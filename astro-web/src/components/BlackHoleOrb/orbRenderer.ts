/**
 * Canvas 2D renderer for the black-hole orb.
 *
 * Performance notes: particles live in typed arrays and are drawn with drawImage from three
 * pre-rendered glow sprites (no shadowBlur, no per-particle gradients). Glow bands are a few
 * layered strokes with additive blending. Device pixel ratio is capped at 2, particle count scales
 * with the canvas area, and the loop pauses whenever the tab is hidden. Mode changes ease in over
 * a few frames, so there is never a jump.
 */

export type OrbMode = 'idle' | 'dim' | 'listening' | 'verifying' | 'success' | 'error';

interface Params {
  energy: number; // overall glow
  speed: number; // orbital speed multiplier
  ring: number; // photon-ring scale
  red: number; // 0..1 shift to red (error)
  flash: number; // success bloom
  inflow: number; // particles spiral inward (verifying)
}

const TARGETS: Record<OrbMode, Params> = {
  idle: { energy: 0.62, speed: 1, ring: 1, red: 0, flash: 0, inflow: 0 },
  dim: { energy: 0.4, speed: 0.55, ring: 0.97, red: 0, flash: 0, inflow: 0 },
  listening: { energy: 0.9, speed: 1.9, ring: 1.03, red: 0, flash: 0, inflow: 0.15 },
  verifying: { energy: 1.05, speed: 3.4, ring: 0.96, red: 0, flash: 0, inflow: 1 },
  success: { energy: 1.6, speed: 5.5, ring: 1.4, red: 0, flash: 1, inflow: 0 },
  error: { energy: 0.6, speed: 0.7, ring: 1, red: 1, flash: 0, inflow: 0 },
};

const TILT = 0.24; // disk seen almost edge-on
const ROT = (-9 * Math.PI) / 180; // disk plane rotation
const COS_R = Math.cos(ROT);
const SIN_R = Math.sin(ROT);

type RGB = [number, number, number];
const INDIGO: RGB = [124, 132, 255];
const BRASS: RGB = [255, 196, 120];
const WHITE: RGB = [236, 240, 255];
const RED: RGB = [255, 104, 92];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function rgba(c: RGB, alpha: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

function makeSprite(color: RGB): HTMLCanvasElement {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, rgba(color, 0.95));
  grad.addColorStop(0.5, rgba(color, 0.25));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

export class OrbRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private running = false;
  private mode: OrbMode = 'idle';
  private p: Params = { ...TARGETS.idle };
  private level: () => number = () => 0;
  private sprites: HTMLCanvasElement[];
  private redSprite: HTMLCanvasElement;
  // particles
  private n = 0;
  private radius = new Float32Array(0);
  private angle = new Float32Array(0);
  private jitter = new Float32Array(0);
  private size = new Float32Array(0);
  private tint = new Uint8Array(0);
  private fade = new Float32Array(0);

  constructor(
    private canvas: HTMLCanvasElement,
    private reducedMotion: boolean,
  ) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.sprites = [makeSprite(INDIGO), makeSprite(BRASS), makeSprite(WHITE)];
    this.redSprite = makeSprite(RED);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setMode(mode: OrbMode) {
    this.mode = mode;
    if (this.reducedMotion) this.drawOnce();
  }

  setLevelSource(fn: (() => number) | null) {
    this.level = fn ?? (() => 0);
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(cssW * this.dpr));
    this.h = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    const count = Math.round(Math.min(460, Math.max(120, (cssW * cssH) / 850)));
    if (count !== this.n) this.seed(count);
    this.drawOnce();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else if (!this.reducedMotion) this.start();
  };

  private seed(count: number) {
    this.n = count;
    this.radius = new Float32Array(count);
    this.angle = new Float32Array(count);
    this.jitter = new Float32Array(count);
    this.size = new Float32Array(count);
    this.tint = new Uint8Array(count);
    this.fade = new Float32Array(count);
    for (let i = 0; i < count; i++) this.spawn(i, true);
  }

  private spawn(i: number, anywhere: boolean) {
    this.radius[i] = anywhere ? 1.28 + Math.pow(Math.random(), 1.5) * 2.2 : 3.1 + Math.random() * 0.4;
    this.angle[i] = Math.random() * Math.PI * 2;
    this.jitter[i] = (Math.random() - 0.5) * 0.09;
    this.size[i] = 0.6 + Math.random() * Math.random() * 2.4;
    const r = Math.random();
    this.tint[i] = r < 0.5 ? 1 : r < 0.85 ? 0 : 2; // mostly brass, some indigo, a few white-hot
    this.fade[i] = anywhere ? 1 : 0;
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawOnce() {
    this.step(0);
    this.draw();
  }

  private step(dt: number) {
    const target = TARGETS[this.mode];
    const k = dt > 0 ? 1 - Math.exp(-dt * (this.mode === 'success' ? 5 : 3.2)) : 1;
    const p = this.p;
    for (const key of Object.keys(p) as (keyof Params)[]) p[key] += (target[key] - p[key]) * k;
    const motion = this.reducedMotion ? 0.12 : 1;
    this.time += dt * motion;

    const inflow = p.inflow * motion;
    const speed = p.speed * motion;
    for (let i = 0; i < this.n; i++) {
      const r = this.radius[i];
      this.angle[i] += (1.05 / (r * Math.sqrt(r))) * speed * dt * 1.6;
      if (inflow > 0.01) {
        this.radius[i] = r - dt * inflow * 0.55 * (r - 1.02);
        if (this.radius[i] < 1.12) this.spawn(i, false);
      }
      if (this.fade[i] < 1) this.fade[i] = Math.min(1, this.fade[i] + dt * 1.5);
    }
  }

  private draw() {
    const { ctx, w, h, p } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.135;
    const lvl = this.mode === 'listening' ? this.level() : 0;
    const breathe = 1 + Math.sin(this.time * 1.7) * 0.015;
    const energy = p.energy + lvl * 0.75;
    const warm = mix(BRASS, RED, p.red);
    const cool = mix(INDIGO, RED, p.red * 0.8);
    const ringR = R * p.ring * breathe * (1 + lvl * 0.07);

    ctx.globalCompositeOperation = 'lighter';

    // 1. Halo
    const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 3.8);
    halo.addColorStop(0, rgba(cool, 0.28 * energy));
    halo.addColorStop(0.35, rgba(mix(cool, [40, 30, 120], 0.5), 0.12 * energy));
    halo.addColorStop(1, rgba(cool, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // 2. Lensed ring around the horizon (the far side of the disk, bent over the top)
    this.glowCircle(cx, cy, ringR * 1.1, R, warm, energy);

    // 3. Back half of the disk, then particles behind the hole
    this.diskBand(cx, cy, R, warm, energy, Math.PI, Math.PI * 2);
    this.particles(cx, cy, R, energy, false);

    // 4. Event horizon
    ctx.globalCompositeOperation = 'source-over';
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, ringR);
    core.addColorStop(0, '#000000');
    core.addColorStop(0.86, '#010105');
    core.addColorStop(1, 'rgba(2,2,10,0.96)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.fill();

    // 5. Photon ring
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1, 1.4 * this.dpr);
    ctx.strokeStyle = rgba(mix(WHITE, warm, 0.35), 0.75 * Math.min(1.2, energy));
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 1.012, 0, Math.PI * 2);
    ctx.stroke();

    // 6. Front half of the disk, then particles in front
    this.diskBand(cx, cy, R, warm, energy, 0, Math.PI);
    this.particles(cx, cy, R, energy, true);

    // 7. Success bloom
    if (p.flash > 0.02) {
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (1.5 + p.flash * 5));
      bloom.addColorStop(0, rgba(WHITE, 0.55 * p.flash));
      bloom.addColorStop(1, rgba(cool, 0));
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A soft ring: three strokes of falling width and rising opacity fake a blur cheaply. */
  private glowCircle(cx: number, cy: number, r: number, R: number, color: RGB, energy: number) {
    const { ctx } = this;
    const passes: [number, number][] = [
      [R * 0.5, 0.05],
      [R * 0.24, 0.1],
      [R * 0.08, 0.34],
    ];
    for (const [width, alpha] of passes) {
      ctx.lineWidth = width;
      ctx.strokeStyle = rgba(color, alpha * energy);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Half of the accretion disk as a glowing ellipse, brighter on the side moving towards us. */
  private diskBand(cx: number, cy: number, R: number, color: RGB, energy: number, from: number, to: number) {
    const { ctx } = this;
    const rx = R * 2.35;
    const ry = rx * TILT;
    const grad = ctx.createLinearGradient(cx - rx, cy, cx + rx, cy);
    grad.addColorStop(0, rgba(color, 0.12 * energy));
    grad.addColorStop(0.5, rgba(mix(color, WHITE, 0.4), 0.3 * energy));
    grad.addColorStop(1, rgba(color, 0.5 * energy));
    ctx.strokeStyle = grad;
    for (const [width, scale] of [
      [R * 0.9, 0.35],
      [R * 0.36, 0.7],
      [R * 0.1, 1],
    ] as const) {
      ctx.lineWidth = width;
      ctx.globalAlpha = scale;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, ROT, from, to);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private particles(cx: number, cy: number, R: number, energy: number, front: boolean) {
    const { ctx } = this;
    const red = this.p.red > 0.5;
    const unit = this.dpr * (R / 90);
    for (let i = 0; i < this.n; i++) {
      const a = this.angle[i];
      const s = Math.sin(a);
      if (front ? s < 0 : s >= 0) continue;
      const r = this.radius[i] * R;
      const c = Math.cos(a);
      const lx = r * c;
      const ly = r * s * (TILT + this.jitter[i]);
      const x = cx + lx * COS_R - ly * SIN_R;
      const y = cy + lx * SIN_R + ly * COS_R;
      // Doppler beaming: the approaching side (right) is brighter; far particles dimmer.
      const beam = 0.45 + 0.55 * (0.5 + 0.5 * c);
      const depth = front ? 1 : 0.55;
      const heat = 1.25 - this.radius[i] * 0.2;
      ctx.globalAlpha = Math.min(1, beam * depth * heat * energy * this.fade[i]);
      const size = this.size[i] * unit * 6 * (0.8 + heat * 0.3);
      const sprite = red && this.tint[i] === 1 ? this.redSprite : this.sprites[this.tint[i]];
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}
