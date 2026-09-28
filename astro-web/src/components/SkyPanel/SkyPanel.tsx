import { useEffect, useState } from 'react';
import { SITE, formatHours, localSiderealHours, moonLitPath, moonPhase, siteTime } from '../../lib/sky';
import styles from './SkyPanel.module.scss';

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function MoonGlyph({ phase, size = 30 }: { phase: number; size?: number }) {
  const c = size / 2;
  const r = c - 3;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.moon} aria-hidden="true">
      <circle cx={c} cy={c} r={c - 0.5} className={styles.halo} />
      <circle cx={c} cy={c} r={r} className={styles.dark} />
      <path d={moonLitPath(phase, r, c)} className={styles.lit} />
    </svg>
  );
}

/** Live sky telemetry for the rail, for New Delhi: tonight's moon, local sidereal time and IST. */
export function SkyPanel() {
  const now = useNow(1000);
  const moon = moonPhase(now);

  return (
    <section className={styles.panel} aria-label="Sky now">
      <header className={styles.head}>
        <span className={styles.eyebrow}>Sky · {SITE.name}</span>
        <span className={styles.live}>
          <i aria-hidden="true" />
          Live
        </span>
      </header>

      <div className={styles.moonRow}>
        <MoonGlyph phase={moon.phase} size={26} />
        <div>
          <div className={styles.value}>{moon.name}</div>
          <div className={styles.meta}>
            {Math.round(moon.illumination * 100)}% lit · day {Math.floor(moon.age)}
          </div>
        </div>
      </div>

      <dl className={styles.readouts}>
        <div>
          <dt title={`Local sidereal time, `}>LST</dt>
          <dd>{formatHours(localSiderealHours(now))}</dd>
        </div>
        <div>
          <dt title="India Standard Time">{SITE.zoneLabel}</dt>
          <dd>{siteTime(now)}</dd>
        </div>
      </dl>

      <span className={styles.scan} aria-hidden="true" />
    </section>
  );
}
