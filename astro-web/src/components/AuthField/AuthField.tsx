import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './AuthField.module.scss';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: LucideIcon;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
}

/** Floating-label input for the night-themed auth screens. */
export const AuthField = forwardRef<HTMLInputElement, Props>(function AuthField(
  { label, icon: Icon, error, hint, trailing, id, ...input },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  return (
    <div className={styles.wrap}>
      <div className={error ? `${styles.field} ${styles.invalid}` : styles.field}>
        <Icon size={17} className={styles.icon} aria-hidden="true" />
        <input
          ref={ref}
          id={inputId}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          {...input}
        />
        <label htmlFor={inputId}>{label}</label>
        {trailing}
      </div>
      {(error || hint) && (
        <p id={noteId} className={error ? styles.error : styles.hint}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
