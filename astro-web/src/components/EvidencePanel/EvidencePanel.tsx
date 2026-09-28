import { Lock } from 'lucide-react';
import type { Source } from '../../types/astro';
import styles from './EvidencePanel.module.scss';

interface Props {
  sources: Source[];
  active: number;
  onSelect: (n: number) => void;
  roleLabel: string;
}

export function EvidencePanel({ sources, active, onSelect, roleLabel }: Props) {
  return (
    <aside className={styles.panel} aria-label="Evidence">
      <div>
        <h2 className={styles.title}>Evidence</h2>
        <p className={styles.sub}>
          {sources.length ? `${sources.length} sources behind the latest answer` : 'Sources appear here when Astro answers'}
        </p>
      </div>

      <div className={styles.access}>
        <Lock size={16} aria-hidden="true" />
        <span>
          Searched as <strong>{roleLabel}</strong>. Sources outside your role aren't searched.
        </span>
      </div>

      <div className={styles.list}>
        {sources.map((s) => (
          <div key={s.id} className={s.n === active ? `${styles.card} ${styles.active}` : styles.card}>
            <button type="button" className={styles.cardHead} aria-pressed={s.n === active} onClick={() => onSelect(s.n)}>
              <span className={styles.num}>{s.n}</span>
              <span className={styles.meta}>
                <span className={styles.cardTitle}>{s.title}</span>
                <span className={styles.where}>
                  {s.kind}, {s.where}
                </span>
              </span>
            </button>
            <p className={styles.excerpt}>{s.excerpt}</p>
            <div className={styles.foot}>
              <span>{s.updated}</span>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.openLabel}
                </a>
              ) : (
                <button type="button">{s.openLabel}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
