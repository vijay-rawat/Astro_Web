import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTheme, type ThemePref } from '../../lib/theme';
import styles from './ThemeSwitch.module.scss';

const options: { value: ThemePref; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'Auto', icon: Monitor },
  { value: 'light', label: 'Day', icon: Sun },
  { value: 'dark', label: 'Night', icon: Moon },
];

/** Auto / Day / Night theme picker. */
export function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const { pref, setPref } = useTheme();
  const index = options.findIndex((o) => o.value === pref);

  return (
    <div
      className={compact ? `${styles.switch} ${styles.compact}` : styles.switch}
      role="radiogroup"
      aria-label="Theme"
      style={{ '--i': index } as CSSProperties}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          title={`${label} theme`}
          className={pref === value ? `${styles.option} ${styles.selected}` : styles.option}
          onClick={() => setPref(value)}
        >
          <Icon size={14} aria-hidden="true" />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
