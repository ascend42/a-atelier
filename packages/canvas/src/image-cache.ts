/**
 * A loaded image entry that can be drawn via RenderContext.drawImage.
 */
export interface CachedImage {
  complete: boolean;
  image: unknown;
}

/**
 * Simple image cache for loading and caching images.
 * Browser-agnostic — the actual Image constructor is injected via createImage.
 * Triggers an onLoad callback when an image finishes loading so the
 * renderer can re-render the current frame.
 */
export class ImageCache {
  private cache = new Map<string, CachedImage>();
  private loading = new Set<string>();
  private onLoad?: () => void;
  private createImage?: (src: string, onLoad: () => void, onError: () => void) => unknown;

  constructor(opts?: {
    onLoad?: () => void;
    createImage?: (src: string, onLoad: () => void, onError: () => void) => unknown;
  }) {
    this.onLoad = opts?.onLoad;
    this.createImage = opts?.createImage;
  }

  get(src: string): unknown | null {
    const entry = this.cache.get(src);
    return entry?.complete ? entry.image : null;
  }

  load(src: string): void {
    if (this.cache.has(src) || this.loading.has(src)) return;
    if (!this.createImage) return;
    this.loading.add(src);
    const image = this.createImage(
      src,
      () => {
        this.cache.set(src, { complete: true, image });
        this.loading.delete(src);
        this.onLoad?.();
      },
      () => {
        this.loading.delete(src);
      },
    );
  }
}
