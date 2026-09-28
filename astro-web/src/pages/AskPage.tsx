import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Answer } from '../components/Answer/Answer';
import { Composer } from '../components/Composer/Composer';
import { EvidencePanel } from '../components/EvidencePanel/EvidencePanel';
import { useSession } from '../auth/AuthProvider';
import { sampleConversation } from '../data/mock';
import { useAstroChat } from '../hooks/useAstroChat';
import type { RouteMode } from '../types/astro';
import styles from './AskPage.module.scss';

const followUps = ['Show me where the partition key is set', 'Who owns the order service?', "Explain Kafka like I'm new to it"];

export function AskPage() {
  const { company, user } = useSession();
  const { messages, isStreaming, send, stop, reset } = useAstroChat(company.id, sampleConversation);
  const [mode, setMode] = useState<RouteMode>('auto');
  const [active, setActive] = useState(1);
  const endRef = useRef<HTMLDivElement>(null);

  const latest = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant' && m.sources && m.sources.length > 0),
    [messages],
  );

  useEffect(() => {
    setActive(1);
  }, [latest?.id]);
  // Block body: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>Ask Astro</h1>
            <p>Answers come from {company.name} knowledge you're allowed to see, with sources.</p>
          </div>
          <button type="button" className={styles.newChat} onClick={reset}>
            <Plus size={16} aria-hidden="true" />
            New chat
          </button>
        </header>

        <div className={styles.thread}>
          <div className={styles.threadInner}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                <h2>What do you want to know?</h2>
                <p>Ask about the product, the code, policies or numbers. Astro shows where every answer comes from.</p>
              </div>
            )}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className={styles.question}>
                  {m.text}
                </div>
              ) : (
                <Answer
                  key={m.id}
                  message={m}
                  onCite={(n) => {
                    if (m.id === latest?.id) setActive(n);
                  }}
                  followUps={m.id === lastAssistantId ? followUps : []}
                  onFollowUp={(q) => send(q, mode)}
                />
              ),
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className={styles.composer}>
          <Composer mode={mode} onModeChange={setMode} onSend={(t) => send(t, mode)} onStop={stop} isStreaming={isStreaming} />
        </div>
      </main>

      <EvidencePanel sources={latest?.sources ?? []} active={active} onSelect={setActive} roleLabel={user.roleLabel} />
    </div>
  );
}
