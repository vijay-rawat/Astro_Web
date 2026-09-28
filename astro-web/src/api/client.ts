import { agentName, mockAnswers } from '../data/mock';
import type { AgentId, KnowledgeSource, RoleAccess, RouteMode, StreamEvent } from '../types/astro';
import { knowledgeSources } from '../data/mock';
import { routeQuestion } from '../lib/router';

import { API_URL, USE_MOCKS } from './env';

export { API_URL, USE_MOCKS };

export interface ChatRequest {
  companyId: string;
  message: string;
  mode: RouteMode;
  conversationId?: string;
}

/**
 * POST {API_URL}/chat/stream and read Server-Sent Events.
 * Each event is `data: {json}\n\n` where json is a StreamEvent.
 * The backend must scope every query by companyId and the user's role.
 */
export async function streamChat(
  req: ChatRequest,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (USE_MOCKS) return mockStream(req, onEvent, signal);

  const res = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Chat request failed with ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (data) onEvent(JSON.parse(data) as StreamEvent);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

export async function fetchSources(companyId: string): Promise<KnowledgeSource[]> {
  if (USE_MOCKS) return knowledgeSources;
  const res = await fetch(`${API_URL}/companies/${companyId}/sources`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Couldn't load sources (${res.status})`);
  return res.json();
}

export async function updateRoleAccess(companyId: string, rules: RoleAccess[]): Promise<void> {
  if (USE_MOCKS) return;
  const res = await fetch(`${API_URL}/companies/${companyId}/access`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ rules }),
  });
  if (!res.ok) throw new Error(`Couldn't save access rules (${res.status})`);
}

// ---------------------------------------------------------------------------
// Mock mode: a keyword router standing in for the LangGraph supervisor.


const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

async function mockStream(req: ChatRequest, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const agent: AgentId = req.mode === 'auto' ? routeQuestion(req.message).agent : req.mode;
  const answer = mockAnswers[agent];

  if (req.mode === 'auto') {
    onEvent({ type: 'route', step: { kind: 'supervisor', label: 'Supervisor' } });
    await wait(350, signal);
  }
  onEvent({ type: 'agent', agent });
  onEvent({ type: 'route', step: { kind: 'agent', label: `${agentName(agent)} agent` } });
  for (const label of answer.retrieval) {
    await wait(300, signal);
    onEvent({ type: 'route', step: { kind: 'retrieval', label } });
  }
  await wait(250, signal);
  onEvent({ type: 'route', step: { kind: 'access', label: 'Access check passed' } });

  const words = answer.text.split(/(\s+)/);
  for (const word of words) {
    await wait(18, signal);
    onEvent({ type: 'token', text: word });
  }
  onEvent({ type: 'sources', sources: answer.sources });
  onEvent({ type: 'done' });
}
