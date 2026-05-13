import type { Easing, CubicBezierEasing, SpringEasing } from "@a-company/atelier-types";
import { cubicBezier, easeIn, easeOut, easeInOut, step, linear } from "@a-company/atelier-math";

export interface EasingCurveEditorOptions {
  value: Easing | undefined;
  onChange: (value: Easing) => void;
}

const CANVAS_SIZE = 160;
const PAD = 20;
const PLOT_SIZE = CANVAS_SIZE - PAD * 2;
const HANDLE_R = 6;

/**
 * Visual easing curve editor.
 * Draws the easing function as a graph with draggable control points for cubic-bezier.
 */
export class EasingCurveEditor {
  readonly el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private easing: Easing;
  private dragging: "p1" | "p2" | null = null;
  private abortController = new AbortController();

  constructor(parent: HTMLElement, private opts: EasingCurveEditorOptions) {
    this.easing = opts.value ?? { type: "linear" };

    this.el = document.createElement("div");
    this.el.className = "atel-easing-curve";

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_SIZE * 2; // 2x for retina
    this.canvas.height = CANVAS_SIZE * 2;
    this.canvas.style.width = `${CANVAS_SIZE}px`;
    this.canvas.style.height = `${CANVAS_SIZE}px`;
    this.canvas.className = "atel-easing-curve__canvas";

    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.scale(2, 2);

    this.el.appendChild(this.canvas);

    // Info label
    const info = document.createElement("div");
    info.className = "atel-easing-curve__info";
    info.textContent = this.getLabel();
    this.el.appendChild(info);

    parent.appendChild(this.el);

    // Interaction for cubic-bezier
    const signal = this.abortController.signal;
    this.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e), { signal });
    this.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e), { signal });
    this.canvas.addEventListener("mouseup", () => this.onMouseUp(), { signal });
    this.canvas.addEventListener("mouseleave", () => this.onMouseUp(), { signal });

    this.draw();
  }

  setValue(v: Easing | undefined): void {
    this.easing = v ?? { type: "linear" };
    this.draw();
    this.updateInfo();
  }

  destroy(): void {
    this.abortController.abort();
  }

  private getLabel(): string {
    const e = this.easing;
    if (typeof e === "string") return e;
    if (e.type === "cubic-bezier") {
      return `cubic-bezier(${e.x1.toFixed(2)}, ${e.y1.toFixed(2)}, ${e.x2.toFixed(2)}, ${e.y2.toFixed(2)})`;
    }
    if (e.type === "spring") {
      return `spring(m:${e.mass ?? 1} k:${e.stiffness ?? 100} d:${e.damping ?? 10})`;
    }
    if (e.type === "step") {
      return `steps(${e.steps}, ${e.position ?? "end"})`;
    }
    return e.type;
  }

  private updateInfo(): void {
    const info = this.el.querySelector(".atel-easing-curve__info") as HTMLElement;
    if (info) info.textContent = this.getLabel();
  }

  private getEasingFunction(): (t: number) => number {
    const e = this.easing;
    if (typeof e === "string") {
      switch (e) {
        case "ease-in": return easeIn;
        case "ease-out": return easeOut;
        case "ease-in-out": return easeInOut;
        default: return linear;
      }
    }
    switch (e.type) {
      case "linear": return linear;
      case "cubic-bezier": return cubicBezier(e.x1, e.y1, e.x2, e.y2);
      case "spring": return this.buildSpringFn(e);
      case "step": return step(e.steps, e.position);
      default: return linear;
    }
  }

  private buildSpringFn(s: SpringEasing): (t: number) => number {
    const mass = s.mass ?? 1;
    const stiffness = s.stiffness ?? 100;
    const damping = s.damping ?? 10;
    const w0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));

    return (t: number): number => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      const scaledT = t * 3; // scale to ~3 seconds
      if (zeta >= 1) {
        // Overdamped
        return 1 - Math.exp(-w0 * scaledT) * (1 + w0 * scaledT);
      }
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * scaledT) * (Math.cos(wd * scaledT) + (zeta * w0 / wd) * Math.sin(wd * scaledT));
    };
  }

  // ── Drawing ──────────────────────────────────────────────

  private draw(): void {
    const ctx = this.ctx;
    const w = CANVAS_SIZE;
    const h = CANVAS_SIZE;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(PAD, PAD, PLOT_SIZE, PLOT_SIZE);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const pos = PAD + (PLOT_SIZE / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pos, PAD);
      ctx.lineTo(pos, PAD + PLOT_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PAD, pos);
      ctx.lineTo(PAD + PLOT_SIZE, pos);
      ctx.stroke();
    }

    // Diagonal reference (linear)
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD, PAD + PLOT_SIZE);
    ctx.lineTo(PAD + PLOT_SIZE, PAD);
    ctx.stroke();
    ctx.setLineDash([]);

    // Easing curve
    const fn = this.getEasingFunction();
    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const samples = 100;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const v = fn(t);
      const x = PAD + t * PLOT_SIZE;
      const y = PAD + PLOT_SIZE - v * PLOT_SIZE;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw control point handles for cubic-bezier
    const e = this.easing;
    if (typeof e !== "string" && e.type === "cubic-bezier") {
      this.drawBezierHandles(e);
    }

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("0", PAD, PAD + PLOT_SIZE + 14);
    ctx.fillText("1", PAD + PLOT_SIZE, PAD + PLOT_SIZE + 14);
    ctx.textAlign = "right";
    ctx.fillText("0", PAD - 4, PAD + PLOT_SIZE + 3);
    ctx.fillText("1", PAD - 4, PAD + 3);
  }

  private drawBezierHandles(e: CubicBezierEasing): void {
    const ctx = this.ctx;

    // P0 = (0, 0) at bottom-left, P3 = (1, 1) at top-right
    const p0x = PAD;
    const p0y = PAD + PLOT_SIZE;
    const p3x = PAD + PLOT_SIZE;
    const p3y = PAD;

    const p1x = PAD + e.x1 * PLOT_SIZE;
    const p1y = PAD + PLOT_SIZE - e.y1 * PLOT_SIZE;
    const p2x = PAD + e.x2 * PLOT_SIZE;
    const p2y = PAD + PLOT_SIZE - e.y2 * PLOT_SIZE;

    // Control lines
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(p1x, p1y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p3x, p3y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();

    // Control point circles
    // P1
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(p1x, p1y, HANDLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // P2
    ctx.fillStyle = "#51cf66";
    ctx.beginPath();
    ctx.arc(p2x, p2y, HANDLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── Interaction ──────────────────────────────────────────

  private canvasToPlot(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left);
    const py = (e.clientY - rect.top);
    const x = (px - PAD) / PLOT_SIZE;
    const y = 1 - (py - PAD) / PLOT_SIZE;
    return { x, y };
  }

  private onMouseDown(e: MouseEvent): void {
    const easing = this.easing;
    if (typeof easing === "string" || easing.type !== "cubic-bezier") return;

    const { x, y } = this.canvasToPlot(e);
    const dist1 = Math.hypot(x - easing.x1, y - easing.y1);
    const dist2 = Math.hypot(x - easing.x2, y - easing.y2);
    const threshold = HANDLE_R / PLOT_SIZE + 0.03;

    if (dist1 < threshold && dist1 <= dist2) {
      this.dragging = "p1";
      this.canvas.style.cursor = "grabbing";
    } else if (dist2 < threshold) {
      this.dragging = "p2";
      this.canvas.style.cursor = "grabbing";
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const easing = this.easing;
    if (typeof easing === "string" || easing.type !== "cubic-bezier") return;

    if (!this.dragging) {
      // Hover cursor
      const { x, y } = this.canvasToPlot(e);
      const dist1 = Math.hypot(x - easing.x1, y - easing.y1);
      const dist2 = Math.hypot(x - easing.x2, y - easing.y2);
      const threshold = HANDLE_R / PLOT_SIZE + 0.03;
      this.canvas.style.cursor = (dist1 < threshold || dist2 < threshold) ? "grab" : "";
      return;
    }

    const { x, y } = this.canvasToPlot(e);
    // Clamp x to [0, 1], allow y to overshoot slightly for bounce effects
    const cx = Math.max(0, Math.min(1, x));
    const cy = Math.max(-0.5, Math.min(1.5, y));

    if (this.dragging === "p1") {
      easing.x1 = Math.round(cx * 100) / 100;
      easing.y1 = Math.round(cy * 100) / 100;
    } else {
      easing.x2 = Math.round(cx * 100) / 100;
      easing.y2 = Math.round(cy * 100) / 100;
    }

    this.draw();
    this.updateInfo();
    this.opts.onChange(easing);
  }

  private onMouseUp(): void {
    if (this.dragging) {
      this.dragging = null;
      this.canvas.style.cursor = "";
    }
  }
}
