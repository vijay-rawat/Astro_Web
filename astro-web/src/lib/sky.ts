// Small, dependency-free sky calculations for the decorative telemetry.
// Accurate to well under a minute / a few percent, which is plenty for UI.

const SYNODIC_MONTH = 29.530588853; // days, new moon to new moon
const REFERENCE_NEW_MOON_JD = 2451550.1; // 2000-01-06 18:14 UTC

function julianDate(date: Date) {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/** Greenwich mean sidereal time, in hours [0, 24). */
export function gmstHours(date: Date) {
  const d = julianDate(date) - 2451545.0;
  const h = (18.697374558 + 24.06570982441908 * d) % 24;
  return h < 0 ? h + 24 : h;
}

/** The observatory the telemetry is shown for. */
export const SITE = {
  name: 'New Delhi',
  country: 'India',
  longitude: 77.209, // degrees east
  timeZone: 'Asia/Kolkata',
  zoneLabel: 'IST',
};

/** Local sidereal time at a longitude (degrees east), in hours [0, 24). */
export function localSiderealHours(date: Date, longitude = SITE.longitude) {
  const h = (gmstHours(date) + longitude / 15) % 24;
  return h < 0 ? h + 24 : h;
}

const siteClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: SITE.timeZone,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Wall-clock time at the site, HH:MM:SS. */
export function siteTime(date: Date) {
  return siteClock.format(date);
}

/** Formats decimal hours as HH:MM:SS. */
export function formatHours(hours: number) {
  const total = Math.floor(hours * 3600);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return [hh, mm, ss].map((n) => String(n).padStart(2, '0')).join(':');
}

export interface MoonPhase {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
  phase: number;
  /** Lit fraction of the disc, 0 to 1. */
  illumination: number;
  /** Days since new moon. */
  age: number;
  name: string;
}

const PHASE_NAMES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
];

export function moonPhase(date: Date): MoonPhase {
  let age = (julianDate(date) - REFERENCE_NEW_MOON_JD) % SYNODIC_MONTH;
  if (age < 0) age += SYNODIC_MONTH;
  const phase = age / SYNODIC_MONTH;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const name = PHASE_NAMES[Math.round(phase * 8) % 8];
  return { phase, illumination, age, name };
}

/**
 * SVG path for the lit part of a moon disc of radius r centred at (c, c).
 * Waxing moons are lit on the right, waning on the left.
 */
export function moonLitPath(phase: number, r: number, c: number) {
  const rx = Math.abs(Math.cos(2 * Math.PI * phase)) * r;
  const waxing = phase < 0.5;
  const limbSweep = waxing ? 1 : 0;
  const terminatorSweep = waxing ? (phase < 0.25 ? 0 : 1) : phase < 0.75 ? 0 : 1;
  const top = `${c} ${c - r}`;
  const bottom = `${c} ${c + r}`;
  return `M ${top} A ${r} ${r} 0 0 ${limbSweep} ${bottom} A ${rx.toFixed(3)} ${r} 0 0 ${terminatorSweep} ${top} Z`;
}
