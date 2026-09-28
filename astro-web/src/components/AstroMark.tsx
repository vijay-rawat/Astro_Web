interface Props {
  size?: number;
  /** 'light' follows the active theme; 'dark' is fixed for the night screens. */
  tone?: 'light' | 'dark';
}

/** Planet, tilted orbit, brass moon. */
export function AstroMark({ size = 28, tone = 'light' }: Props) {
  const planet = tone === 'light' ? 'var(--ink)' : '#E8ECF5';
  const ring = tone === 'light' ? 'var(--orbit)' : '#8C92F0';
  const moon = tone === 'light' ? 'var(--brass)' : '#E0A64A';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="7" style={{ fill: planet }} />
      <ellipse
        cx="16"
        cy="16"
        rx="14"
        ry="5.5"
        transform="rotate(-24 16 16)"
        fill="none"
        style={{ stroke: ring }}
        strokeWidth="1.8"
      />
      <circle cx="28.6" cy="10.4" r="2.4" style={{ fill: moon }} />
    </svg>
  );
}
