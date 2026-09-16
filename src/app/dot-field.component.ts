import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild
} from '@angular/core';

/** Grid geometry, in CSS pixels. */
const SPACING = 34;
const DOT_RADIUS = 1.5;
const INFLUENCE = 168;
const INFLUENCE_SQ = INFLUENCE * INFLUENCE;
const PUSH = 15;

/** Dots are drawn in alpha/colour buckets so a frame costs a handful of fills. */
const LEVELS = 10;
const REST_COLOR = [168, 200, 255] as const;
const GLOW_COLOR = [255, 198, 27] as const;
const REST_ALPHA = 0.2;
const GLOW_ALPHA = 0.92;

/** A dot never renders larger than this multiple of its resting radius. */
const GLOW_SCALE = 1.7;

/** Idle life: every dot breathes, drifts a hair, and lights up as a wave passes. */
const AMBIENT_SCALE = 0.16;
const AMBIENT_SPEED = 0.0011;
/** Each dot loiters around its grid slot on a slow, per-dot ellipse. */
const DRIFT = 1.2;
const DRIFT_SPEED = 0.00042;
/** A brightness crest sweeping the field on the diagonal. */
const WAVE_SPEED = 0.00055;
const WAVE_LENGTH = 320;
/** How far up the rest->glow ramp the crest may push a dot, and how much it swells. */
const WAVE_LIGHT = 0.34;
const WAVE_POP = 0.45;
/** Per-dot flicker riding on the crest, so it never reads as a clean bar. */
const TWINKLE_SPEED = 0.0019;

/** Sine lookup: the idle pass does ~5 waves per dot, and Math.sin is the bill. */
const TAU = Math.PI * 2;
const LUT_SIZE = 1024;
const LUT_MASK = LUT_SIZE - 1;
const LUT_SCALE = LUT_SIZE / TAU;
const SIN_LUT = new Float32Array(LUT_SIZE);
for (let i = 0; i < LUT_SIZE; i++) SIN_LUT[i] = Math.sin((i / LUT_SIZE) * TAU);

/** sin(t) to ~0.6% — negative indices wrap correctly through the mask. */
function sinAt(t: number): number {
  return SIN_LUT[((t * LUT_SCALE) | 0) & LUT_MASK]!;
}

/** Idle frames are throttled; interaction gets every frame the display offers. */
const IDLE_FRAME_MS = 33;
const EASE_PER_FRAME = 0.16;
const SETTLED = 0.003;

/** Guard against absurd dot counts on very large or very dense displays. */
const MAX_DOTS = 7000;

/**
 * Animated dot grid behind the manual. Pure canvas: one element, one raf loop,
 * no DOM churn and no change detection — the component only owns the canvas and
 * tears the loop down on destroy.
 */
@Component({
  selector: 'chairo-dot-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dot-field.component.css',
  template: '<canvas #surface aria-hidden="true"></canvas>'
})
export class DotFieldComponent {
  private readonly surface = viewChild.required<ElementRef<HTMLCanvasElement>>('surface');
  private readonly document = inject(DOCUMENT);

  private ctx: CanvasRenderingContext2D | null = null;
  private frameHandle = 0;

  /** Base grid positions, plus a per-dot phase so the shimmer travels. */
  private baseX = new Float32Array(0);
  private baseY = new Float32Array(0);
  private phase = new Float32Array(0);
  /** Distance along the wave axis, baked in at resize so the loop only adds time. */
  private wavePhase = new Float32Array(0);
  /** Current (eased) pointer influence per dot, 0 at rest. */
  private glow = new Float32Array(0);
  private count = 0;

  /** Buckets reused every frame: no per-dot fillStyle changes. */
  private readonly palette: string[] = [];
  private cursorGlow: CanvasGradient | null = null;

  private pointerX = 0;
  private pointerY = 0;
  private pointerNear = 0;
  private pointerActive = false;
  private width = 0;
  private height = 0;
  private lastFrame = 0;
  private lastDraw = 0;
  private reducedMotion = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const canvas = this.surface().nativeElement;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;
      this.ctx = ctx;

      for (let level = 0; level < LEVELS; level++) this.palette.push(colorAt(level / (LEVELS - 1)));

      const view = this.document.defaultView!;
      const motionQuery = view.matchMedia('(prefers-reduced-motion: reduce)');
      const observer = new ResizeObserver(() => this.resize());

      const onMotionChange = () => {
        this.reducedMotion = motionQuery.matches;
        this.pointerActive = false;
        this.pointerNear = 0;
        this.glow.fill(0);
        this.reducedMotion ? this.stop() : this.wake();
        this.draw(performance.now());
      };
      const onPointerMove = (event: PointerEvent) => {
        this.pointerX = event.clientX;
        this.pointerY = event.clientY;
        this.pointerActive = true;
        this.wake();
      };
      const onPointerOut = () => { this.pointerActive = false; };
      const onVisibility = () => {
        this.document.hidden ? this.stop() : this.wake();
      };

      observer.observe(canvas);
      view.addEventListener('pointermove', onPointerMove, { passive: true });
      view.addEventListener('pointerdown', onPointerMove, { passive: true });
      view.addEventListener('blur', onPointerOut);
      this.document.addEventListener('pointerleave', onPointerOut);
      this.document.addEventListener('visibilitychange', onVisibility);
      motionQuery.addEventListener('change', onMotionChange);

      this.reducedMotion = motionQuery.matches;
      this.resize();

      destroyRef.onDestroy(() => {
        this.stop();
        observer.disconnect();
        view.removeEventListener('pointermove', onPointerMove);
        view.removeEventListener('pointerdown', onPointerMove);
        view.removeEventListener('blur', onPointerOut);
        this.document.removeEventListener('pointerleave', onPointerOut);
        this.document.removeEventListener('visibilitychange', onVisibility);
        motionQuery.removeEventListener('change', onMotionChange);
      });
    });
  }

  /** Rebuilds the grid for the current viewport and repaints once. */
  private resize(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const canvas = ctx.canvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    const view = this.document.defaultView!;
    const ratio = Math.min(view.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Spread the grid so it stays centred and never clips at the edges.
    let spacing = SPACING;
    while (Math.ceil(width / spacing) * Math.ceil(height / spacing) > MAX_DOTS) spacing += 4;
    const cols = Math.ceil(width / spacing) + 1;
    const rows = Math.ceil(height / spacing) + 1;
    const offsetX = (width - (cols - 1) * spacing) / 2;
    const offsetY = (height - (rows - 1) * spacing) / 2;

    this.count = cols * rows;
    this.baseX = new Float32Array(this.count);
    this.baseY = new Float32Array(this.count);
    this.phase = new Float32Array(this.count);
    this.wavePhase = new Float32Array(this.count);
    this.glow = new Float32Array(this.count);

    for (let row = 0, i = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++, i++) {
        // Odd rows shift half a step: a quincunx reads softer than a square grid.
        this.baseX[i] = offsetX + col * spacing + (row % 2 ? spacing / 2 : 0);
        this.baseY[i] = offsetY + row * spacing;
        this.phase[i] = col * 0.7 + row * 0.55;
        // Diagonal axis, in radians per pixel: the crest travels down-right.
        this.wavePhase[i] =
          ((this.baseX[i]! * 0.72 + this.baseY[i]! * 0.69) / WAVE_LENGTH) * TAU;
      }
    }

    this.cursorGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, INFLUENCE);
    this.cursorGlow.addColorStop(0, 'rgba(93, 155, 255, 0.26)');
    this.cursorGlow.addColorStop(0.55, 'rgba(58, 106, 214, 0.09)');
    this.cursorGlow.addColorStop(1, 'rgba(6, 29, 92, 0)');

    this.draw(performance.now());
    if (!this.reducedMotion) this.wake();
  }

  private wake(): void {
    if (this.frameHandle || this.reducedMotion || this.document.hidden) return;
    this.lastFrame = 0;
    this.frameHandle = requestAnimationFrame(now => this.frame(now));
  }

  private stop(): void {
    if (!this.frameHandle) return;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private frame(now: number): void {
    this.frameHandle = requestAnimationFrame(next => this.frame(next));
    const settling = this.pointerNear > SETTLED;
    // Nothing under the cursor? Shimmer alone does not need 60 fps.
    if (!this.pointerActive && !settling && now - this.lastDraw < IDLE_FRAME_MS) return;
    this.draw(now);
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.count) return;

    const delta = this.lastFrame ? Math.min(now - this.lastFrame, 64) : 16.7;
    this.lastFrame = now;
    this.lastDraw = now;

    // Frame-rate independent easing: same settle time at 60 or 144 Hz.
    const ease = this.reducedMotion ? 1 : 1 - Math.pow(1 - EASE_PER_FRAME, delta / 16.7);
    const target = this.pointerActive ? 1 : 0;
    this.pointerNear += (target - this.pointerNear) * ease;
    if (this.pointerNear < SETTLED) this.pointerNear = 0;

    const px = this.pointerX;
    const py = this.pointerY;
    const reach = this.pointerNear;
    const still = this.reducedMotion;
    const time = still ? 0 : now * AMBIENT_SPEED;
    const driftTime = still ? 0 : now * DRIFT_SPEED;
    const waveTime = still ? 0 : now * WAVE_SPEED;
    const twinkleTime = still ? 0 : now * TWINKLE_SPEED;

    ctx.clearRect(0, 0, this.width, this.height);

    if (reach > 0.01 && this.cursorGlow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = reach;
      ctx.translate(px, py);
      ctx.fillStyle = this.cursorGlow;
      ctx.fillRect(-INFLUENCE, -INFLUENCE, INFLUENCE * 2, INFLUENCE * 2);
      ctx.restore();
    }

    // One path per brightness bucket, so the whole field costs LEVELS fills.
    const paths: Path2D[] = [];
    for (let level = 0; level < LEVELS; level++) paths.push(new Path2D());

    for (let i = 0; i < this.count; i++) {
      const bx = this.baseX[i]!;
      const by = this.baseY[i]!;
      let level = 0;
      let x = bx;
      let y = by;
      let scale = 1;

      const dx = px - bx;
      const dy = py - by;
      const distSq = dx * dx + dy * dy;
      // Falloff squared: cheap, and keeps the halo edge from showing a seam.
      const pull = distSq < INFLUENCE_SQ ? (1 - distSq / INFLUENCE_SQ) ** 2 * reach : 0;
      let glow = this.glow[i]!;
      glow += (pull - glow) * ease;
      if (glow < SETTLED) glow = 0;
      this.glow[i] = glow;

      if (glow > 0) {
        const dist = Math.sqrt(distSq) || 1;
        const push = glow * PUSH;
        x = bx - (dx / dist) * push;
        y = by - (dy / dist) * push;
        scale = 1 + glow * (GLOW_SCALE - 1);
      }

      let breathe = 1;
      let lit = glow;

      if (!still) {
        const seed = this.phase[i]!;
        // Two detuned axes: the dot loops a lopsided ellipse instead of a circle.
        x += DRIFT * sinAt(driftTime + seed);
        y += DRIFT * sinAt(driftTime * 0.78 + seed * 1.37 + 1.9);
        breathe = 1 + AMBIENT_SCALE * sinAt(time + seed);

        // Cubed sine: a narrow crest with long dark gaps, not a rolling stripe.
        const crest = sinAt(waveTime - this.wavePhase[i]!);
        if (crest > 0) {
          const twinkle = 0.62 + 0.38 * sinAt(twinkleTime + seed * 2.1);
          const pulse = crest * crest * crest * twinkle;
          scale += pulse * WAVE_POP;
          const wave = pulse * WAVE_LIGHT;
          if (wave > lit) lit = wave;
        }
      }

      if (lit > 0) level = Math.min(LEVELS - 1, (lit * LEVELS) | 0);
      const radius = DOT_RADIUS * scale * breathe;
      const path = paths[level]!;
      path.moveTo(x + radius, y);
      path.arc(x, y, radius, 0, Math.PI * 2);
    }

    for (let level = 0; level < LEVELS; level++) {
      ctx.fillStyle = this.palette[level]!;
      ctx.fill(paths[level]!);
    }

    // Everything is home: let the loop idle until the pointer comes back.
    if (!this.pointerActive && !this.pointerNear) this.lastFrame = 0;
  }
}

/** Resting blue to glowing yellow, brightening as it goes. */
function colorAt(t: number): string {
  const r = Math.round(REST_COLOR[0] + (GLOW_COLOR[0] - REST_COLOR[0]) * t);
  const g = Math.round(REST_COLOR[1] + (GLOW_COLOR[1] - REST_COLOR[1]) * t);
  const b = Math.round(REST_COLOR[2] + (GLOW_COLOR[2] - REST_COLOR[2]) * t);
  const alpha = (REST_ALPHA + (GLOW_ALPHA - REST_ALPHA) * t).toFixed(3);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
