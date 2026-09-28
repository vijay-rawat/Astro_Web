import styles from './Starfield.module.scss';

// Deterministic "random" so the sky is the same on every render and reload.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const rand = seeded(7);
const stars = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  x: rand() * 100,
  y: rand() * 100,
  size: 1 + rand() * 1.6,
  delay: rand() * 8,
  duration: 4 + rand() * 6,
  glint: i % 7 === 0,
}));

// Tilted orbit in the top-right corner, shared by the SVG and the satellite's motion path.
const ORBIT = 'M 148 213 A 300 92 -20 1 1 712 7 A 300 92 -20 1 1 148 213';

/** Decorative sky behind the app content: dust, twinkles, a polar chart and one orbiting satellite. */
export function Starfield() {
  return (
    <div className={styles.sky} aria-hidden="true">
      <div className={styles.nebula} />
      <div className={styles.dust} />

      <div className={styles.chart}>
        <svg width="560" height="560" viewBox="0 0 560 560">
          <g className={styles.rings}>
            {[140, 230, 320, 410].map((r) => (
              <circle key={r} cx="560" cy="0" r={r} />
            ))}
            {Array.from({ length: 7 }, (_, i) => {
              const a = ((90 + i * 15) * Math.PI) / 180;
              return <line key={i} x1="560" y1="0" x2={560 + Math.cos(a) * 430} y2={Math.sin(a) * 430} />;
            })}
          </g>
          <path className={styles.orbitPath} d={ORBIT} />
        </svg>
        <span className={styles.satellite} style={{ offsetPath: `path('${ORBIT}')` }} />
      </div>

      {stars.map((s) => (
        <span
          key={s.id}
          className={s.glint ? `${styles.star} ${styles.glint}` : styles.star}
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}

      <span className={styles.meteor} />
    </div>
  );
}
