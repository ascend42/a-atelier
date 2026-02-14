export class Player {
  private animationId: number | null = null;
  private currentFrame = 0;
  private playing = false;
  private lastTimestamp = 0;
  private accumulator = 0;

  constructor(
    private fps: number,
    private totalFrames: number,
    private onFrame: (frame: number) => void,
    private loop = true,
  ) {}

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.lastTimestamp = 0;
    this.accumulator = 0;
    this.animationId = requestAnimationFrame((ts) => this.tick(ts));
  }

  pause(): void {
    this.playing = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  seek(frame: number): void {
    this.currentFrame = Math.max(0, Math.min(frame, this.totalFrames - 1));
    this.onFrame(this.currentFrame);
  }

  toggle(): void {
    if (this.playing) this.pause(); else this.play();
  }

  get isPlaying(): boolean { return this.playing; }
  get frame(): number { return this.currentFrame; }

  destroy(): void { this.pause(); }

  private tick(timestamp: number): void {
    if (!this.playing) return;
    if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
    const elapsed = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    this.accumulator += elapsed;
    const frameDuration = 1000 / this.fps;
    let frameChanged = false;
    while (this.accumulator >= frameDuration) {
      this.accumulator -= frameDuration;
      this.currentFrame++;
      if (this.currentFrame >= this.totalFrames) {
        if (this.loop) { this.currentFrame = 0; }
        else { this.currentFrame = this.totalFrames - 1; this.pause(); this.onFrame(this.currentFrame); return; }
      }
      frameChanged = true;
    }
    if (frameChanged) this.onFrame(this.currentFrame);
    this.animationId = requestAnimationFrame((ts) => this.tick(ts));
  }
}
