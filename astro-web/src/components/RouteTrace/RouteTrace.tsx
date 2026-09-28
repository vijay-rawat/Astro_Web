import { Check } from 'lucide-react';
import type { RouteStep } from '../../types/astro';
import styles from './RouteTrace.module.scss';

interface Props {
  steps: RouteStep[];
  writing?: boolean;
}

/** The orbit line: how the supervisor routed a question and what was searched. */
export function RouteTrace({ steps, writing }: Props) {
  if (!steps.length && !writing) return null;
  return (
    <ol className={styles.trace} aria-label="How Astro answered">
      {steps.map((step, i) => (
        <li key={`${step.kind}-${i}`} className={styles.step}>
          {i > 0 && <span className={styles.line} aria-hidden="true" />}
          {step.kind === 'access' ? (
            <Check size={14} strokeWidth={2.6} className={styles.ok} aria-hidden="true" />
          ) : (
            <span className={`${styles.node} ${styles[step.kind]}`} aria-hidden="true" />
          )}
          {step.label}
        </li>
      ))}
      {writing && (
        <li className={styles.step}>
          {steps.length > 0 && <span className={styles.line} aria-hidden="true" />}
          <span className={`${styles.node} ${styles.agent} ${styles.pulse}`} aria-hidden="true" />
          {steps.length ? 'Writing' : 'Routing your question'}
        </li>
      )}
    </ol>
  );
}
