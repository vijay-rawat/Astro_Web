import { useEffect, useRef } from 'react';
import { OrbRenderer, type OrbMode } from './orbRenderer';
import styles from './BlackHoleOrb.module.scss';

interface Props {
  mode: OrbMode;
  /** Called once per frame while listening; returns mic loudness 0..1. */
  levelSource?: () => number;
  className?: string;
}

/** The black-hole orb. Decorative: state is announced in text elsewhere on the page. */
export function BlackHoleOrb({ mode, levelSource, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<OrbRenderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let orb: OrbRenderer;
    try {
      orb = new OrbRenderer(canvas, reduced);
    } catch {
      return; // no canvas: the CSS fallback glow still shows
    }
    renderer.current = orb;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      orb.resize(width, height);
    });
    observer.observe(canvas);
    if (!reduced) orb.start();
    return () => {
      observer.disconnect();
      orb.destroy();
      renderer.current = null;
    };
  }, []);

  useEffect(() => {
    renderer.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    renderer.current?.setLevelSource(levelSource ?? null);
  }, [levelSource]);

  return (
    <div className={`${styles.orb} ${className ?? ''}`} data-mode={mode} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
