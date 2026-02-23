/**
 * Export dialog — modal overlay for choosing format and showing progress.
 *
 * UI states: options → progress → done.
 * Built with vanilla DOM, matching existing studio patterns.
 */

import type { AtelierDocument } from "@a-company/atelier-types";
import type { ImageCache } from "@a-company/atelier-canvas";
import { exportDocument, supportsWebCodecs, type ExportFormat, type ExportResult } from "./video-exporter.js";

export class ExportDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private blobUrl: string | null = null;
  private parentEl: HTMLElement | null = null;

  /**
   * Mount the export overlay into the given parent element.
   * Typically called with the studio root.
   */
  show(
    doc: AtelierDocument,
    canvas: HTMLCanvasElement,
    imageCache: ImageCache,
    parentEl: HTMLElement,
  ): void {
    this.parentEl = parentEl;

    // Overlay
    this.overlay = document.createElement("div");
    this.overlay.className = "atel-export-overlay";
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.destroy();
    });

    // Dialog card
    this.dialog = document.createElement("div");
    this.dialog.className = "atel-export-dialog";
    this.overlay.appendChild(this.dialog);
    parentEl.appendChild(this.overlay);

    this.renderOptions(doc, canvas, imageCache);
  }

  destroy(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
    if (this.overlay && this.parentEl) {
      this.parentEl.removeChild(this.overlay);
    }
    this.overlay = null;
    this.dialog = null;
    this.parentEl = null;
  }

  // ── Options screen ─────────────────────────────────────────

  private renderOptions(
    doc: AtelierDocument,
    canvas: HTMLCanvasElement,
    imageCache: ImageCache,
  ): void {
    if (!this.dialog) return;
    this.dialog.innerHTML = "";

    // Title
    const title = document.createElement("div");
    title.className = "atel-export-dialog__title";
    title.textContent = "Export Animation";
    this.dialog.appendChild(title);

    // Format picker
    const formatRow = document.createElement("div");
    formatRow.className = "atel-export-dialog__row";

    const formatLabel = document.createElement("label");
    formatLabel.className = "atel-control-label";
    formatLabel.textContent = "FORMAT";
    formatRow.appendChild(formatLabel);

    const formatSelect = document.createElement("select");
    formatSelect.className = "atel-toolbar__select atel-export-dialog__select";

    const gifOpt = document.createElement("option");
    gifOpt.value = "gif";
    gifOpt.textContent = "GIF";
    formatSelect.appendChild(gifOpt);

    const mp4Opt = document.createElement("option");
    mp4Opt.value = "mp4";
    if (supportsWebCodecs()) {
      mp4Opt.textContent = "MP4";
    } else {
      mp4Opt.textContent = "MP4 (not supported)";
      mp4Opt.disabled = true;
    }
    formatSelect.appendChild(mp4Opt);

    const webmOpt = document.createElement("option");
    webmOpt.value = "webm";
    if (supportsWebCodecs()) {
      webmOpt.textContent = "WebM (transparent)";
    } else {
      webmOpt.textContent = "WebM (not supported)";
      webmOpt.disabled = true;
    }
    formatSelect.appendChild(webmOpt);

    formatRow.appendChild(formatSelect);
    this.dialog.appendChild(formatRow);

    // Info line
    const fps = doc.canvas.fps ?? 30;
    const stateNames = Object.keys(doc.states);
    let totalFrames = 0;
    for (const name of stateNames) {
      totalFrames += doc.states[name]?.duration ?? 0;
    }
    const info = document.createElement("div");
    info.className = "atel-export-dialog__info";
    info.textContent = `${doc.canvas.width}\u00D7${doc.canvas.height} \u2022 ${fps} fps \u2022 ${totalFrames} frames \u2022 ${stateNames.length} state${stateNames.length !== 1 ? "s" : ""}`;
    this.dialog.appendChild(info);

    // Button row
    const btnRow = document.createElement("div");
    btnRow.className = "atel-export-dialog__actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "atel-toolbar__btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.destroy());
    btnRow.appendChild(cancelBtn);

    const exportBtn = document.createElement("button");
    exportBtn.className = "atel-toolbar__btn atel-toolbar__btn--active";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", () => {
      const format = formatSelect.value as ExportFormat;
      this.renderProgress(doc, canvas, imageCache, format);
    });
    btnRow.appendChild(exportBtn);

    this.dialog.appendChild(btnRow);
  }

  // ── Progress screen ────────────────────────────────────────

  private renderProgress(
    doc: AtelierDocument,
    canvas: HTMLCanvasElement,
    imageCache: ImageCache,
    format: ExportFormat,
  ): void {
    if (!this.dialog) return;
    this.dialog.innerHTML = "";

    const title = document.createElement("div");
    title.className = "atel-export-dialog__title";
    title.textContent = "Exporting\u2026";
    this.dialog.appendChild(title);

    const progress = document.createElement("progress");
    progress.className = "atel-export-dialog__progress";
    progress.max = 100;
    progress.value = 0;
    this.dialog.appendChild(progress);

    const statusText = document.createElement("div");
    statusText.className = "atel-export-dialog__status";
    statusText.textContent = "Preparing\u2026";
    this.dialog.appendChild(statusText);

    exportDocument(doc, canvas, imageCache, {
      format,
      onProgress: ({ frame, total, percent }) => {
        progress.value = percent;
        statusText.textContent = `Rendering frame ${frame} / ${total}`;
      },
    })
      .then((result) => {
        this.renderDone(result);
      })
      .catch((err) => {
        this.renderError(err);
      });
  }

  // ── Done screen ────────────────────────────────────────────

  private renderDone(result: ExportResult): void {
    if (!this.dialog) return;
    this.dialog.innerHTML = "";

    const title = document.createElement("div");
    title.className = "atel-export-dialog__title";
    title.textContent = "Export Complete";
    this.dialog.appendChild(title);

    const info = document.createElement("div");
    info.className = "atel-export-dialog__info";
    const sizeMB = (result.blob.size / (1024 * 1024)).toFixed(2);
    const durationSec = (result.durationMs / 1000).toFixed(1);
    info.textContent = `${result.totalFrames} frames \u2022 ${durationSec}s \u2022 ${sizeMB} MB`;
    this.dialog.appendChild(info);

    // Download link
    this.blobUrl = URL.createObjectURL(result.blob);
    const ext = result.format;

    const downloadBtn = document.createElement("a");
    downloadBtn.href = this.blobUrl;
    downloadBtn.download = `animation.${ext}`;
    downloadBtn.className = "atel-toolbar__btn atel-toolbar__btn--active atel-export-download";
    downloadBtn.textContent = `Download .${ext}`;
    this.dialog.appendChild(downloadBtn);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "atel-toolbar__btn";
    closeBtn.textContent = "Close";
    closeBtn.style.marginTop = "8px";
    closeBtn.addEventListener("click", () => this.destroy());
    this.dialog.appendChild(closeBtn);
  }

  // ── Error screen ───────────────────────────────────────────

  private renderError(err: unknown): void {
    if (!this.dialog) return;
    this.dialog.innerHTML = "";

    const title = document.createElement("div");
    title.className = "atel-export-dialog__title";
    title.textContent = "Export Failed";
    this.dialog.appendChild(title);

    const msg = document.createElement("div");
    msg.className = "atel-export-dialog__info";
    msg.textContent = err instanceof Error ? err.message : String(err);
    this.dialog.appendChild(msg);

    const closeBtn = document.createElement("button");
    closeBtn.className = "atel-toolbar__btn";
    closeBtn.textContent = "Close";
    closeBtn.style.marginTop = "8px";
    closeBtn.addEventListener("click", () => this.destroy());
    this.dialog.appendChild(closeBtn);
  }
}
