import { engineeringRecap, liveScript, meetings as mockMeetings } from '../data/meetings';
import { mockAnswers } from '../data/mock';
import { stripCitations } from '../lib/formatAnswer';
import { routeQuestion } from '../lib/router';
import type { Meeting, MeetingLiveEvent, MeetingPlatform, MeetingRecap, MeetingSetting } from '../types/astro';
import { API_URL, USE_MOCKS } from './client';

// Astro joins calls through a meeting-bot worker on the backend. The frontend only
// needs these endpoints; every one is scoped to the signed-in user's company.

const json = async <T>(res: Response, what: string): Promise<T> => {
  if (!res.ok) throw new Error(`${what} failed with ${res.status}`);
  return res.json() as Promise<T>;
};

const send = (path: string, method: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Recognises Google Meet, Zoom and Teams links. Returns null for anything else. */
export function parseMeetingLink(link: string): MeetingPlatform | null {
  let url: URL;
  try {
    url = new URL(link.trim().startsWith('http') ? link.trim() : `https://${link.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}/.test(url.pathname)) return 'meet';
  if (host.endsWith('zoom.us') && url.pathname.includes('/j/')) return 'zoom';
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') return 'teams';
  return null;
}

export const platformName: Record<MeetingPlatform, string> = { meet: 'Google Meet', zoom: 'Zoom', teams: 'Microsoft Teams' };

export async function fetchMeetings(companyId: string): Promise<Meeting[]> {
  if (USE_MOCKS) return mockMeetings;
  return json(await fetch(`${API_URL}/companies/${companyId}/meetings`, { credentials: 'include' }), 'Loading meetings');
}

/** POST /companies/:id/meetings/join. The bot joins as "Astro (<Company>)" and introduces itself. */
export async function sendAstroToMeeting(companyId: string, link: string): Promise<{ meetingId: string }> {
  if (USE_MOCKS) {
    await sleep(900);
    return { meetingId: `adhoc-${Date.now()}` };
  }
  return json(await send(`/companies/${companyId}/meetings/join`, 'POST', { link }), 'Sending Astro');
}

export async function setAstroInvited(companyId: string, meetingId: string, invited: boolean): Promise<void> {
  if (USE_MOCKS) return;
  const res = await send(`/companies/${companyId}/meetings/${meetingId}`, 'PATCH', { astroInvited: invited });
  if (!res.ok) throw new Error(`Updating the invite failed with ${res.status}`);
}

export async function updateMeetingSettings(companyId: string, settings: MeetingSetting[]): Promise<void> {
  if (USE_MOCKS) return;
  const body = Object.fromEntries(settings.map((s) => [s.id, s.enabled]));
  const res = await send(`/companies/${companyId}/meeting-settings`, 'PUT', body);
  if (!res.ok) throw new Error(`Saving settings failed with ${res.status}`);
}

/**
 * GET /meetings/:id/live as Server-Sent Events. The server sends the history first,
 * then new transcript lines, answers, decisions and action items as they happen.
 * Returns an unsubscribe function.
 */
export function subscribeMeeting(meetingId: string, onEvent: (e: MeetingLiveEvent) => void): () => void {
  if (USE_MOCKS) {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = (i: number) => {
      if (cancelled || i >= liveScript.length) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        onEvent(liveScript[i].event);
        step(i + 1);
      }, liveScript[i].delayMs);
    };
    step(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }
  const source = new EventSource(`${API_URL}/meetings/${meetingId}/live`, { withCredentials: true });
  source.onmessage = (msg) => onEvent(JSON.parse(msg.data) as MeetingLiveEvent);
  return () => source.close();
}

/** Only the asker sees the answer. It is never spoken or posted to the meeting chat. */
export async function askPrivately(meetingId: string, question: string): Promise<{ answer: string; source?: string }> {
  if (USE_MOCKS) {
    await sleep(1100);
    const { agent } = routeQuestion(question);
    const mock = mockAnswers[agent];
    const first = stripCitations(mock.text).split('\n')[0];
    return { answer: first, source: mock.sources[0]?.title };
  }
  return json(await send(`/meetings/${meetingId}/ask-private`, 'POST', { question }), 'Asking Astro');
}

export async function setLiveOptions(meetingId: string, options: { speak?: boolean; notes?: boolean }): Promise<void> {
  if (USE_MOCKS) return;
  const res = await send(`/meetings/${meetingId}/live`, 'PATCH', options);
  if (!res.ok) throw new Error(`Updating Astro failed with ${res.status}`);
}

/** Astro leaves the call and starts writing the recap from the transcript. */
export async function removeAstro(meetingId: string): Promise<void> {
  if (USE_MOCKS) return sleep(500);
  const res = await send(`/meetings/${meetingId}/leave`, 'POST');
  if (!res.ok) throw new Error(`Removing Astro failed with ${res.status}`);
}

export async function fetchRecap(meetingId: string): Promise<MeetingRecap> {
  if (USE_MOCKS) {
    await sleep(300);
    if (meetingId !== engineeringRecap.meetingId) throw new Error('Only the engineering meeting has a sample recap');
    return engineeringRecap;
  }
  return json(await fetch(`${API_URL}/meetings/${meetingId}/recap`, { credentials: 'include' }), 'Loading the recap');
}

/** Nothing is sent to Jira or Slack until a person approves it. */
export async function approveAction(meetingId: string, actionId: string): Promise<void> {
  if (USE_MOCKS) return sleep(400);
  const res = await send(`/meetings/${meetingId}/actions/${actionId}/approve`, 'POST');
  if (!res.ok) throw new Error(`Approving failed with ${res.status}`);
}

export async function postFollowUp(meetingId: string, channel: string, text: string): Promise<void> {
  if (USE_MOCKS) return sleep(500);
  const res = await send(`/meetings/${meetingId}/follow-up`, 'POST', { channel, text });
  if (!res.ok) throw new Error(`Posting failed with ${res.status}`);
}
