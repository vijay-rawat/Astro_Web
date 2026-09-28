import styles from './Switch.module.scss';

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Shown only to screen readers; put a visible label next to it. */
  label: string;
  tone?: 'light' | 'night';
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, tone = 'light', disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${styles.switch} ${tone === 'night' ? styles.night : ''}`}
    >
      <span className={`${styles.track} ${checked ? styles.on : ''}`} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </button>
  );
}
