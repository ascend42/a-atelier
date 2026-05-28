/**
 * #bottom-timeline-view — read-only timeline UI mounted BELOW the canvas in
 * the workspace studio (TD-2026-05-28, Wave A — Unit B).
 *
 * v1.0 scope is viewer-only:
 *   - click a clip block to select it (emits `onSelectClip`)
 *   - click the ruler to seek (emits `onSeek`)
 *   - the canvas-panel's scrubber drives `setFrame()` to position the playhead
 *
 * Drag-to-reposition is v1.1 territory. The doc remains untouched by this
 * component — selections and seeks are emitted upward; mutation is the
 * caller's job (and not in scope for v1.0).
 *
 * Reads from `doc.timeline` — the derived summary block. When that block is
 * missing or empty, the view renders a muted "No clips" placeholder so empty
 * docs and image-only projects degrade gracefully.
 *
 * Vanilla DOM + inline styles to match the workspace-app convention (no
 * framework, no new dep). All atel- prefixed classes are scoped via the
 * injected stylesheet in workspace-app.ts.
 */

import type { AtelierDocument } from "@a-company/atelier-types";

import {
  type TimelineSelection,
  frameToPixel,
  pixelToFrame,
} from "./timeline-state-types.js";

export interface TimelineViewOptions {
  /** Container element to mount into (typically below the canvas). */
  container: HTMLElement;
  /** Called when the user clicks a clip block to select it. */
  onSelectClip: (selection: TimelineSelection | null) => void;
  /** Called when the user clicks somewhere on the ruler to seek. */
  onSeek: (frame: number) => void;
}

/** Per-clip layout slot, output of the pure `computeClipPositions` helper. */
export interface ClipPosition {
  layerId: string;
  trackId: string;
  /** Display label — `layerId` or the source basename without extension. */
  label: string;
  startFrame: number;
  endFrame: number;
  leftPx: number;
  widthPx: number;
}

interface ClipLike {
  layerId: string;
  startFrame: number;
  endFrame: number;
  source: string;
}

/**
 * Pure layout helper — converts a clip array into pixel-positioned slots.
 * Extracted so the math is unit-testable without a DOM harness (the project
 * has no jsdom; everything else is verified manually).
 *
 * Each slot's `widthPx` clamps to a minimum of 4px so a zero-length clip
 * stays clickable. A `leftPx + widthPx` past the lane edge stays anchored at
 * the lane width — `frameToPixel` already clamps to `[0, widthPx]`.
 */
export function computeClipPositions(
  clips: ClipLike[],
  trackId: string,
  totalFrames: number,
  laneWidthPx: number,
): ClipPosition[] {
  const out: ClipPosition[] = [];
  for (const clip of clips) {
    const leftPx = frameToPixel(clip.startFrame, totalFrames, laneWidthPx);
    const endPx = frameToPixel(clip.endFrame, totalFrames, laneWidthPx);
    const rawWidth = endPx - leftPx;
    const widthPx = Math.max(4, rawWidth);
    out.push({
      layerId: clip.layerId,
      trackId,
      label: deriveClipLabel(clip),
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
      leftPx,
      widthPx,
    });
  }
  return out;
}

function deriveClipLabel(clip: ClipLike): string {
  // Prefer the source basename (without extension) — it's the artifact name
  // the creator recognizes from the sidebar. Falls back to the layerId when
  // the source is empty or odd.
  if (clip.source && clip.source.length > 0) {
    const base = clip.source.split("/").pop() ?? clip.source;
    const dot = base.lastIndexOf(".");
    return dot > 0 ? base.slice(0, dot) : base;
  }
  return clip.layerId;
}

/** Escape minimal HTML — duplicated locally to avoid a cross-module import. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class TimelineView {
  private readonly opts: TimelineViewOptions;
  private rootEl: HTMLElement | null = null;
  private rulerEl: HTMLElement | null = null;
  private laneEl: HTMLElement | null = null;
  private playheadEl: HTMLElement | null = null;
  private emptyEl: HTMLElement | null = null;

  private doc: AtelierDocument | null = null;
  private selection: TimelineSelection | null = null;
  private currentFrame: number = 0;

  /** Cached clip DOM, keyed by `${trackId}::${layerId}` for selection updates. */
  private clipEls = new Map<string, HTMLElement>();

  constructor(opts: TimelineViewOptions) {
    this.opts = opts;
  }

  /** Mount the timeline DOM into the container. Idempotent. */
  mount(): void {
    if (this.rootEl) return;

    const root = document.createElement("div");
    root.className = "atel-timeline-view";
    this.rootEl = root;

    // Ruler row — frame ticks + numbers (every fps frames = every second).
    const ruler = document.createElement("div");
    ruler.className = "atel-timeline-view__ruler";
    ruler.addEventListener("click", (ev) => this.handleRulerClick(ev));
    root.appendChild(ruler);
    this.rulerEl = ruler;

    // Track lane — single row (video track only in v1.0).
    const lane = document.createElement("div");
    lane.className = "atel-timeline-view__lane";
    // Background click on the lane clears the selection.
    lane.addEventListener("click", (ev) => {
      if (ev.target === lane) {
        this.setSelection(null);
        this.opts.onSelectClip(null);
      }
    });
    root.appendChild(lane);
    this.laneEl = lane;

    // Playhead — vertical line drawn above ruler + lane.
    const playhead = document.createElement("div");
    playhead.className = "atel-timeline-view__playhead";
    playhead.style.display = "none";
    root.appendChild(playhead);
    this.playheadEl = playhead;

    // Empty-state — shown when no doc or no clips.
    const empty = document.createElement("div");
    empty.className = "atel-timeline-view__empty";
    empty.textContent = "No clips";
    empty.style.display = "none";
    root.appendChild(empty);
    this.emptyEl = empty;

    this.opts.container.appendChild(root);

    // Recompute layout on resize so clip block widths track the lane width.
    // The browser fires `resize` on the window; the workspace-main column is
    // flex-driven, so a window resize is the only trigger we need to handle
    // here (no internal resizers in v1.0).
    this.resizeHandler = (): void => this.renderClips();
    window.addEventListener("resize", this.resizeHandler);

    this.renderAll();
  }

  private resizeHandler: (() => void) | null = null;

  /** Update with a new doc. Pass null to clear. */
  setDoc(doc: AtelierDocument | null): void {
    this.doc = doc;
    // Reset selection + playhead when the doc changes — they belong to the
    // old doc's layer ids, which won't match the new one.
    this.selection = null;
    this.currentFrame = 0;
    this.renderAll();
  }

  /** Position the playhead — typically driven by the canvas-panel's scrubber. */
  setFrame(frame: number): void {
    this.currentFrame = Math.max(0, frame);
    this.renderPlayhead();
  }

  /** Highlight a clip as selected, or clear. */
  setSelection(selection: TimelineSelection | null): void {
    this.selection = selection;
    this.applySelectionClasses();
  }

  /** Remove from DOM. */
  destroy(): void {
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.rootEl) {
      this.rootEl.remove();
      this.rootEl = null;
    }
    this.rulerEl = null;
    this.laneEl = null;
    this.playheadEl = null;
    this.emptyEl = null;
    this.clipEls.clear();
  }

  // ── render passes ─────────────────────────────────────────────────

  private renderAll(): void {
    this.renderRuler();
    this.renderClips();
    this.renderPlayhead();
  }

  private getTotalFrames(): number {
    return this.doc?.timeline?.totalFrames ?? 0;
  }

  private getFps(): number {
    return this.doc?.timeline?.fps ?? this.doc?.canvas?.fps ?? 30;
  }

  private renderRuler(): void {
    if (!this.rulerEl) return;
    this.rulerEl.innerHTML = "";
    const totalFrames = this.getTotalFrames();
    if (totalFrames <= 0) return;

    const width = this.rulerEl.clientWidth || this.opts.container.clientWidth || 800;
    const fps = this.getFps();
    // One label per second — every `fps` frames.
    const step = Math.max(1, fps);
    for (let frame = 0; frame <= totalFrames; frame += step) {
      const leftPx = frameToPixel(frame, totalFrames, width);
      const tick = document.createElement("div");
      tick.className = "atel-timeline-view__tick";
      tick.style.left = `${leftPx}px`;
      tick.textContent = String(frame);
      this.rulerEl.appendChild(tick);
    }
  }

  private renderClips(): void {
    if (!this.laneEl) return;
    this.laneEl.innerHTML = "";
    this.clipEls.clear();

    const totalFrames = this.getTotalFrames();
    const tracks = this.doc?.timeline?.tracks ?? [];
    const videoTracks = tracks.filter((t) => t.kind === "video");
    const hasClips = videoTracks.some((t) => t.clips.length > 0);

    if (!this.doc || totalFrames <= 0 || !hasClips) {
      if (this.emptyEl) this.emptyEl.style.display = "";
      this.renderRuler();
      return;
    }
    if (this.emptyEl) this.emptyEl.style.display = "none";

    const laneWidth = this.laneEl.clientWidth || this.opts.container.clientWidth || 800;
    // Re-render the ruler now that we know the lane is laid out — the ruler
    // and lane share the same width column, so a single render pass is fine.
    this.renderRuler();

    for (const track of videoTracks) {
      const slots = computeClipPositions(track.clips, track.id, totalFrames, laneWidth);
      for (const slot of slots) {
        const el = document.createElement("div");
        el.className = "atel-timeline-view__clip";
        el.style.left = `${slot.leftPx}px`;
        el.style.width = `${slot.widthPx}px`;
        el.title = `${slot.label} · frames ${slot.startFrame}–${slot.endFrame}`;
        el.innerHTML = `<span class="atel-timeline-view__clip-label">${esc(slot.label)}</span>`;
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const next: TimelineSelection = { trackId: slot.trackId, layerId: slot.layerId };
          this.setSelection(next);
          this.opts.onSelectClip(next);
        });
        this.laneEl.appendChild(el);
        this.clipEls.set(`${slot.trackId}::${slot.layerId}`, el);
      }
    }

    this.applySelectionClasses();
  }

  private applySelectionClasses(): void {
    for (const [key, el] of this.clipEls.entries()) {
      const isSel = this.selection !== null &&
        key === `${this.selection.trackId}::${this.selection.layerId}`;
      el.classList.toggle("atel-timeline-view__clip--selected", isSel);
    }
  }

  private renderPlayhead(): void {
    if (!this.playheadEl || !this.rootEl) return;
    const totalFrames = this.getTotalFrames();
    if (totalFrames <= 0 || !this.doc) {
      this.playheadEl.style.display = "none";
      return;
    }
    const width = this.rootEl.clientWidth || 800;
    const leftPx = frameToPixel(this.currentFrame, totalFrames, width);
    this.playheadEl.style.display = "";
    this.playheadEl.style.left = `${leftPx}px`;
  }

  // ── input handlers ────────────────────────────────────────────────

  private handleRulerClick(ev: MouseEvent): void {
    if (!this.rulerEl) return;
    const totalFrames = this.getTotalFrames();
    if (totalFrames <= 0) return;
    const rect = this.rulerEl.getBoundingClientRect();
    const xPx = ev.clientX - rect.left;
    const frame = pixelToFrame(xPx, totalFrames, rect.width);
    this.setFrame(frame);
    this.opts.onSeek(frame);
  }
}
