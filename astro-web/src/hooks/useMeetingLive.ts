import { useEffect, useState } from 'react';
import { subscribeMeeting } from '../api/meetings';
import { USE_MOCKS } from '../api/client';
import { liveSnapshot } from '../data/meetings';
import type { ActionItem, MeetingAnswer, MeetingDecision, TranscriptLine } from '../types/astro';

interface LiveState {
  transcript: TranscriptLine[];
  answers: MeetingAnswer[];
  decisions: MeetingDecision[];
  actions: ActionItem[];
  speakingId: string | null;
  ended: boolean;
}

const empty: LiveState = { transcript: [], answers: [], decisions: [], actions: [], speakingId: null, ended: false };

/** Live transcript, answers, decisions and action items for a meeting Astro is in. */
export function useMeetingLive(meetingId: string) {
  const [state, setState] = useState<LiveState>(() =>
    USE_MOCKS
      ? { ...empty, transcript: liveSnapshot.transcript, answers: liveSnapshot.answers, decisions: liveSnapshot.decisions, actions: liveSnapshot.actions }
      : empty,
  );

  useEffect(() => {
    return subscribeMeeting(meetingId, (e) => {
      setState((s) => {
        switch (e.type) {
          case 'transcript':
            return { ...s, transcript: [...s.transcript, e.line] };
          case 'speaking':
            return { ...s, speakingId: e.participantId };
          case 'answer':
            return { ...s, answers: [...s.answers, e.answer] };
          case 'decision':
            return { ...s, decisions: [...s.decisions, e.decision] };
          case 'action':
            return { ...s, actions: [...s.actions, e.item] };
          case 'ended':
            return { ...s, ended: true, speakingId: null };
          default:
            return s;
        }
      });
    });
  }, [meetingId]);

  return state;
}

/** mm:ss (or h:mm:ss) since the call started, ticking every second. */
export function useElapsed(startSeconds: number) {
  const [seconds, setSeconds] = useState(startSeconds);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
