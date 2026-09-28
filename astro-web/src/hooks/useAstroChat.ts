import { useCallback, useRef, useState } from 'react';
import { streamChat } from '../api/client';
import type { ChatMessage, RouteMode } from '../types/astro';

const uid = () => Math.random().toString(36).slice(2, 10);

export function useAstroChat(companyId: string, initial: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);

  const send = useCallback(
    async (text: string, mode: RouteMode) => {
      const message = text.trim();
      if (!message || streamingRef.current) return;

      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: 'user', text: message },
        { id: assistantId, role: 'assistant', text: '', route: [], sources: [], status: 'streaming' },
      ]);

      const patch = (fn: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setIsStreaming(true);

      try {
        await streamChat(
          { companyId, message, mode },
          (event) => {
            switch (event.type) {
              case 'route':
                patch((m) => ({ ...m, route: [...(m.route ?? []), event.step] }));
                break;
              case 'agent':
                patch((m) => ({ ...m, agent: event.agent }));
                break;
              case 'token':
                patch((m) => ({ ...m, text: m.text + event.text }));
                break;
              case 'sources':
                patch((m) => ({ ...m, sources: event.sources }));
                break;
              case 'error':
                patch((m) => ({ ...m, status: 'error', error: event.message }));
                break;
              case 'done':
                patch((m) => ({ ...m, status: m.status === 'error' ? 'error' : 'done' }));
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          patch((m) => ({ ...m, status: 'done' }));
        } else {
          patch((m) => ({
            ...m,
            status: 'error',
            error: "Astro couldn't reach the server. Check that the API is running, then try again.",
          }));
        }
      } finally {
        streamingRef.current = false;
        abortRef.current = null;
        setIsStreaming(false);
      }
    },
    [companyId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  return { messages, isStreaming, send, stop, reset };
}
