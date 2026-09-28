import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Mic, Paperclip, Square } from 'lucide-react';
import { agents } from '../../data/mock';
import { useSession } from '../../auth/AuthProvider';
import type { RouteMode } from '../../types/astro';
import styles from './Composer.module.scss';

const modes: { id: RouteMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto-route', hint: 'Astro picks the right agent for each question' },
  ...agents.map((a) => ({ id: a.id as RouteMode, label: a.name, hint: a.hint })),
];

interface Props {
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function Composer({ mode, onModeChange, onSend, onStop, isStreaming }: Props) {
  const { company } = useSession();
  const [draft, setDraft] = useState('');
  const hint = modes.find((m) => m.id === mode)?.hint;

  const submit = () => {
    if (!draft.trim() || isStreaming) return;
    onSend(draft);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.wrap}>
      <div role="group" aria-label="Send to" className={styles.modes}>
        <span className={styles.modesLabel}>Send to</span>
        {modes.map((m) => (
          <button key={m.id} type="button" className={styles.mode} aria-pressed={m.id === mode} onClick={() => onModeChange(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <form
        className={styles.box}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="ask-input" className="visually-hidden">
          Ask Astro
        </label>
        <textarea
          id="ask-input"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Ask anything about ${company.name}`}
          className={styles.input}
        />
        <div className={styles.row}>
          <button type="button" className={styles.iconBtn} aria-label="Attach a file">
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <span className={styles.hint}>{hint}</span>
          <Link to="/call" className={styles.iconLink} aria-label="Start a voice call">
            <Mic size={18} aria-hidden="true" />
          </Link>
          {isStreaming ? (
            <button type="button" className={styles.send} onClick={onStop} aria-label="Stop the answer">
              <Square size={14} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" className={styles.send} disabled={!draft.trim()} aria-label="Send question">
              <ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
