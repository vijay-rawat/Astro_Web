import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { AstroMark } from '../AstroMark';
import { RouteTrace } from '../RouteTrace/RouteTrace';
import { agentName } from '../../data/mock';
import { parseAnswer, stripCitations, type Inline } from '../../lib/formatAnswer';
import type { ChatMessage } from '../../types/astro';
import styles from './Answer.module.scss';

interface Props {
  message: ChatMessage;
  onCite: (n: number) => void;
  onFollowUp?: (text: string) => void;
  followUps?: string[];
}

export function Answer({ message, onCite, onFollowUp, followUps = [] }: Props) {
  const blocks = useMemo(() => parseAnswer(message.text), [message.text]);
  const [copied, setCopied] = useState(false);
  const streaming = message.status === 'streaming';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stripCitations(message.text));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked outside secure contexts; nothing to do.
    }
  };

  const renderInlines = (inlines: Inline[]) =>
    inlines.map((part, i) => {
      if (part.kind === 'text') return <Fragment key={i}>{part.value}</Fragment>;
      if (part.kind === 'strong') return <strong key={i}>{part.value}</strong>;
      return (
        <button key={i} type="button" className={styles.cite} aria-label={`Show source ${part.n}`} onClick={() => onCite(part.n)}>
          {part.n}
        </button>
      );
    });

  return (
    <article className={styles.answer} aria-busy={streaming}>
      <div className={styles.head}>
        <AstroMark size={22} />
        <span className={styles.name}>Astro</span>
        {message.agent && <span className={styles.via}>answered with the {agentName(message.agent)} agent</span>}
      </div>

      <RouteTrace steps={message.route ?? []} writing={streaming} />

      {message.status === 'error' ? (
        <div className={styles.error} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          {message.error}
        </div>
      ) : (
        blocks.length > 0 && (
          <div className={styles.body}>
            {blocks.map((block, i) =>
              block.kind === 'p' ? (
                <p key={i}>{renderInlines(block.inlines)}</p>
              ) : (
                <ul key={i}>
                  {block.items.map((item, j) => (
                    <li key={j}>{renderInlines(item)}</li>
                  ))}
                </ul>
              ),
            )}
          </div>
        )
      )}

      {message.status === 'done' && (
        <>
          <div className={styles.actions}>
            <button type="button" onClick={copy}>
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy answer'}
            </button>
            <button type="button">
              <Check size={15} aria-hidden="true" />
              Helpful
            </button>
            <button type="button">
              <AlertTriangle size={15} aria-hidden="true" />
              Report a problem
            </button>
          </div>
          {followUps.length > 0 && onFollowUp && (
            <div className={styles.followUps}>
              {followUps.map((q) => (
                <button key={q} type="button" onClick={() => onFollowUp(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}
