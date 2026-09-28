import styles from './PasswordStrength.module.scss';

const LABELS = ['Faint', 'Dim', 'Bright', 'Brilliant', 'Supernova'];

/** A rough 0-4 score. The server has the final say (length, common passwords, your name). */
export function scorePassword(pw: string): number {
  if (!pw) return -1;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (kinds >= 3 || (kinds >= 2 && pw.length >= 14)) score++;
  if (/(.)\1{2,}/.test(pw) || /^(?:0123|1234|abcd|qwer|pass)/i.test(pw)) score = Math.max(0, score - 1);
  if (pw.length < 8) score = 0;
  return Math.min(4, score);
}

/** Five stars that light up as the password gets stronger. */
export function PasswordStrength({ password }: { password: string }) {
  const score = scorePassword(password);
  if (score < 0) return null;
  return (
    <div className={styles.meter} data-score={score}>
      <svg viewBox="0 0 120 16" aria-hidden="true" className={styles.stars}>
        <polyline points="8,10 32,5 58,9 86,4 112,8" className={styles.line} />
        {[
          [8, 10],
          [32, 5],
          [58, 9],
          [86, 4],
          [112, 8],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i <= score ? 3 : 2} className={i <= score ? styles.lit : styles.star} />
        ))}
      </svg>
      <span className={styles.label}>
        {LABELS[score]}
        {score < 2 && password.length < 12 ? ' · longer is stronger' : ''}
      </span>
    </div>
  );
}
