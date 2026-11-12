/**
 * Canvas 2D renderer for the kit view and timing strip. Runs its own
 * requestAnimationFrame loop and reads LiveState directly every frame,
 * so React never re-renders because of a hit.
 */
import { NITRO_MAX_PADS, type PadId, type PadInfo } from "../kit/nitroMax";
import type { LiveHit, LiveState } from "../live/liveState";
import { onThemeChange, withColorProbe } from "../theme";

/**
 * The canvas paints with the page's theme tokens (App.css), resolved to
 * concrete colors, so the kit view follows light and dark mode like
 * everything else. Re-resolved whenever the theme or the device setting changes.
 */
interface Colors {
  background: string;
  drumHead: string;
  drumRim: string;
  cymbal: string;
  cymbalEdge: string;
  label: string;
  stripBg: string;
  stripTolerance: string;
  stripAxis: string;
  text: string;
  beat: string;
  downbeat: string;
  early: string;
  onTime: string;
  late: string;
  unscored: string;
}

const readColors = (): Colors =>
  withColorProbe((token) => ({
    background: token("--bg"),
    drumHead: token("--drum-head"),
    drumRim: token("--pad-rim"),
    cymbal: token("--cymbal"),
    cymbalEdge: token("--cymbal-edge"),
    label: token("--muted"),
    stripBg: token("--panel"),
    stripTolerance: token("--strip-tolerance"),
    stripAxis: token("--strip-axis"),
    text: token("--text"),
    beat: token("--text"),
    downbeat: token("--downbeat"),
    early: token("--early"),
    onTime: token("--on-time"),
    late: token("--late"),
    unscored: token("--text"),
  }));

/** How long a pad stays lit, and how long its ms label stays up. */
const FLASH_MS = 260;
const LABEL_MS = 900;
const STRIP_HISTORY_MS = 5000;
const BEAT_PULSE_MS = 180;
/** The strip shows ±this many ms around the grid point. */
const STRIP_RANGE_MS = 60;

const PAD_LANES: readonly PadId[] = NITRO_MAX_PADS.map((p) => p.id);

export interface RendererOptions {
  getToleranceMs: () => number;
}

export class KitRenderer {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private width = 0;
  private height = 0;
  private resizeObserver: ResizeObserver;
  private colors: Colors = readColors();
  private stopThemeWatch = onThemeChange(() => {
    this.colors = readColors();
  });

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly state: LiveState,
    private readonly options: RendererOptions,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D not available");
    this.ctx = ctx;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  start(): void {
    const loop = () => {
      this.draw(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.stopThemeWatch();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw(now: number): void {
    const { ctx, width, height } = this;
    if (width === 0 || height === 0) return;

    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    const stripHeight = Math.max(90, height * 0.22);
    const kitHeight = height - stripHeight;

    // Fit a 1.6:1 box for the kit, centred in the kit area.
    const boxH = Math.min(kitHeight * 0.96, (width * 0.96) / 1.6);
    const boxW = boxH * 1.6;
    const boxX = (width - boxW) / 2;
    const boxY = (kitHeight - boxH) / 2;

    for (const pad of NITRO_MAX_PADS) {
      this.drawPad(pad, boxX + pad.x * boxW, boxY + pad.y * boxH, pad.r * boxH, now);
    }
    this.drawTimingStrip(0, kitHeight, width, stripHeight, now);
  }

  private drawPad(pad: PadInfo, cx: number, cy: number, r: number, now: number): void {
    const { ctx } = this;
    const hit = this.state.lastHitByPad.get(pad.id);
    const age = hit ? now - hit.time : Infinity;
    const flash = age >= 0 && age < FLASH_MS ? (1 - age / FLASH_MS) ** 2 : 0;
    const intensity = hit ? flash * (0.35 + 0.65 * (hit.velocity / 127)) : 0;
    const color = hit ? this.hitColor(hit) : this.colors.unscored;

    // Grow slightly on impact, scaled by how hard the pad was hit.
    const radius = r * (1 + 0.08 * intensity);

    ctx.save();
    if (pad.shape === "pedal") {
      ctx.beginPath();
      ctx.roundRect(cx - radius * 0.6, cy - radius, radius * 1.2, radius * 2, radius * 0.25);
      ctx.fillStyle = this.colors.drumHead;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.colors.drumRim;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = pad.shape === "cymbal" ? this.colors.cymbal : this.colors.drumHead;
      ctx.fill();
      ctx.lineWidth = pad.shape === "cymbal" ? 2 : Math.max(3, r * 0.1);
      ctx.strokeStyle = pad.shape === "cymbal" ? this.colors.cymbalEdge : this.colors.drumRim;
      ctx.stroke();
      if (pad.shape === "cymbal") {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.18, 0, Math.PI * 2);
        ctx.strokeStyle = this.colors.cymbalEdge;
        ctx.stroke();
      }
    }

    if (intensity > 0.01) {
      ctx.globalAlpha = intensity;
      ctx.shadowColor = color;
      ctx.shadowBlur = r * 0.8;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (pad.shape === "pedal") {
        ctx.roundRect(cx - radius * 0.6, cy - radius, radius * 1.2, radius * 2, radius * 0.25);
      } else {
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = this.colors.label;
    ctx.font = `500 ${Math.max(11, r * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pad.label, cx, cy + radius + Math.max(10, r * 0.22));

    // Timing label floats up and fades out.
    if (hit?.score && age < LABEL_MS) {
      const t = age / LABEL_MS;
      ctx.globalAlpha = 1 - t * t;
      ctx.fillStyle = this.hitColor(hit);
      ctx.font = `700 ${Math.max(14, r * 0.34)}px ui-monospace, monospace`;
      ctx.fillText(formatDelta(hit.score.deltaMs), cx, cy - t * r * 0.5);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private hitColor(hit: LiveHit): string {
    return this.colors[hit.score?.verdict ?? "unscored"];
  }

  /**
   * The metronome's click, shown on the strip's "on the click" line, where
   * the hits land too: how strongly it shows now (1 at the click, fading to
   * 0) and whether it's beat 1. Nothing shows while the metronome is stopped.
   */
  private beatPulse(now: number): { pulse: number; downbeat: boolean } {
    let current = null;
    for (const beat of this.state.beats) {
      if (beat.time <= now) current = beat;
      else break;
    }
    const age = current ? now - current.time : Infinity;
    return { pulse: age < BEAT_PULSE_MS ? 1 - age / BEAT_PULSE_MS : 0, downbeat: current?.downbeat ?? false };
  }

  private drawTimingStrip(x: number, y: number, w: number, h: number, now: number): void {
    const { ctx } = this;
    const pad = 16;
    const innerX = x + pad;
    const innerW = w - pad * 2;
    const top = y + 22;
    const bottom = y + h - 10;
    const centerX = innerX + innerW / 2;
    const msToX = (ms: number) =>
      centerX + (Math.max(-STRIP_RANGE_MS, Math.min(STRIP_RANGE_MS, ms)) / STRIP_RANGE_MS) * (innerW / 2);

    ctx.fillStyle = this.colors.stripBg;
    ctx.fillRect(x, y, w, h);

    const tol = this.options.getToleranceMs();
    ctx.fillStyle = this.colors.stripTolerance;
    ctx.fillRect(msToX(-tol), top, msToX(tol) - msToX(-tol), bottom - top);

    ctx.strokeStyle = this.colors.stripAxis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const ms of [-STRIP_RANGE_MS, -30, 0, 30, STRIP_RANGE_MS]) {
      ctx.moveTo(msToX(ms) + 0.5, top);
      ctx.lineTo(msToX(ms) + 0.5, bottom);
    }
    ctx.stroke();

    // The click flashes along the center line, stronger on beat 1.
    const { pulse, downbeat } = this.beatPulse(now);
    const clickColor = downbeat ? this.colors.downbeat : this.colors.beat;
    if (pulse > 0) {
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = clickColor;
      ctx.lineWidth = downbeat ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(centerX, top);
      ctx.lineTo(centerX, bottom);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = this.colors.early;
    ctx.textAlign = "left";
    ctx.fillText(`◀ EARLY  (−${STRIP_RANGE_MS} ms)`, innerX, y + 15);
    ctx.fillStyle = this.colors.late;
    ctx.textAlign = "right";
    ctx.fillText(`(+${STRIP_RANGE_MS} ms)  LATE ▶`, innerX + innerW, y + 15);
    ctx.fillStyle = this.colors.label;
    ctx.textAlign = "center";
    ctx.fillText("on the click", centerX, y + 15);
    if (pulse > 0) {
      // The label lights up with the click.
      ctx.globalAlpha = pulse;
      ctx.fillStyle = clickColor;
      ctx.fillText("on the click", centerX, y + 15);
      ctx.globalAlpha = 1;
    }

    // One lane per pad, so patterns like "kick always late" are visible.
    const laneH = (bottom - top) / PAD_LANES.length;
    for (const hit of this.state.recentHits) {
      if (!hit.score || !hit.pad) continue;
      const age = now - hit.time;
      if (age > STRIP_HISTORY_MS || age < 0) continue;
      const lane = PAD_LANES.indexOf(hit.pad);
      const cy = top + laneH * (lane + 0.5);
      ctx.globalAlpha = 1 - age / STRIP_HISTORY_MS;
      ctx.fillStyle = this.hitColor(hit);
      ctx.beginPath();
      ctx.arc(msToX(hit.score.deltaMs), cy, Math.max(2.5, Math.min(5, laneH * 0.45)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function formatDelta(deltaMs: number): string {
  const rounded = Math.round(deltaMs);
  if (rounded === 0) return "0 ms";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)} ms`;
}
