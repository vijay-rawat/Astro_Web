import styles from './OrbitOrb.module.scss';

export type OrbState = 'listening' | 'thinking' | 'speaking' | 'muted' | 'idle';

/** The call's focal point: three tilted orbits around a voice core. */
export function OrbitOrb({ state }: { state: OrbState }) {
  return (
    <div className={`${styles.orb} ${styles[state]}`} aria-hidden="true">
      <svg className={`${styles.ring} ${styles.a}`} viewBox="0 0 420 420">
        <ellipse cx="210" cy="210" rx="196" ry="72" transform="rotate(-18 210 210)" />
        <circle cx="396" cy="150" r="7" className={styles.moon} />
      </svg>
      <svg className={`${styles.ring} ${styles.b}`} viewBox="0 0 420 420">
        <ellipse cx="210" cy="210" rx="170" ry="108" transform="rotate(34 210 210)" />
        <circle cx="69" cy="115" r="5" className={styles.moonSoft} />
      </svg>
      <svg className={`${styles.ring} ${styles.c}`} viewBox="0 0 420 420">
        <ellipse cx="210" cy="210" rx="130" ry="40" transform="rotate(70 210 210)" />
        <circle cx="254" cy="332" r="4" className={styles.moonPale} />
      </svg>
      <div className={styles.halo} />
      <div className={styles.core}>
        {[18, 34, 24, 40, 16].map((h, i) => (
          <span key={i} className={i === 2 ? styles.barBrass : styles.bar} style={{ height: h, animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    </div>
  );
}
