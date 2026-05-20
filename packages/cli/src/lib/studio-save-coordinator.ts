/**
 * Debounced autosave coordinator for the Studio inline app.
 *
 * Extracted into a real module so the save-race logic is unit-testable in
 * isolation — the inline browser app embeds the SAME source (see
 * `SAVE_COORDINATOR_SRC`) so there is exactly one implementation to reason
 * about.
 *
 * The bug this guards against (#cli-studio autosave corruption):
 *
 *   Edit file A → switch to file B within the 800ms debounce window.
 *   The pending timer closed over A's *doc* but read the GLOBAL current
 *   file at fire time — which by then was B — so A's bytes were written
 *   to B's path. Real `.atelier` corruption.
 *
 * The fix is twofold and both halves live here:
 *   1. Capture the TARGET PATH (and serialized bytes) in the timer closure
 *      so a fired timer always writes to the file it was scheduled for.
 *   2. `flushPending()` synchronously writes any pending edit to its OWN
 *      path before a file switch, then clears the timer. Callers invoke
 *      this at the very top of `loadFile` so no edit is dropped and no
 *      cross-file write can occur.
 */

export interface SaveCoordinatorOptions {
  /** Performs the actual write. Resolves on success, rejects on failure. */
  save: (path: string, content: string) => void | Promise<void>;
  /** Synchronous write used by `flushPending` on a file switch. */
  saveSync: (path: string, content: string) => void;
  /** Debounce window in ms (default 800). */
  delayMs?: number;
  /** Test seam for the timer; defaults to global setTimeout/clearTimeout. */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

interface PendingSave {
  path: string;
  content: string;
}

export class SaveCoordinator {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingSave | null = null;
  private readonly delayMs: number;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void;

  constructor(private readonly opts: SaveCoordinatorOptions) {
    this.delayMs = opts.delayMs ?? 800;
    this.setTimeoutFn = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((h) => clearTimeout(h));
  }

  /**
   * Schedule a debounced save for `path`. Captures BOTH the path and the
   * content in the closure so a fired timer writes the bytes it was given
   * to the file it was given — never whatever the "current" file later
   * becomes.
   */
  schedule(path: string, content: string): void {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
    this.pending = { path, content };
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      const job = this.pending;
      this.pending = null;
      if (job) void this.opts.save(job.path, job.content);
    }, this.delayMs);
  }

  /**
   * Flush any pending edit synchronously to ITS OWN path, then clear the
   * timer. Call this BEFORE switching files so the in-flight edit is never
   * dropped and never lands on the wrong file.
   */
  flushPending(): void {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
    const job = this.pending;
    this.pending = null;
    if (job) this.opts.saveSync(job.path, job.content);
  }

  /** Drop any pending save without writing (e.g. on teardown). */
  cancel(): void {
    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }

  /** True if a save is currently scheduled. Test introspection. */
  hasPending(): boolean {
    return this.pending !== null;
  }
}
