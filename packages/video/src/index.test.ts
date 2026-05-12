import { describe, it, expect } from "vitest";
import { FfmpegEncoder, WebCodecsVideoProvider } from "./index.js";

describe("FfmpegEncoder", () => {
  it("applies default filename based on format", () => {
    const mp4 = new FfmpegEncoder({ width: 1920, height: 1080, fps: 30, format: "mp4" });
    expect(mp4.options.filename).toBe("export.mp4");
    expect(mp4.options.crf).toBe(18);

    const webm = new FfmpegEncoder({ width: 1280, height: 720, fps: 24, format: "webm" });
    expect(webm.options.filename).toBe("export.webm");
  });

  it("respects custom filename and crf overrides", () => {
    const enc = new FfmpegEncoder({
      width: 1920,
      height: 1080,
      fps: 60,
      format: "mp4",
      filename: "ugc-final.mp4",
      crf: 22,
    });
    expect(enc.options.filename).toBe("ugc-final.mp4");
    expect(enc.options.crf).toBe(22);
  });

  it("init/writeFrame/finalize throw until T-003 lands", async () => {
    const enc = new FfmpegEncoder({ width: 100, height: 100, fps: 30, format: "mp4" });
    await expect(enc.init()).rejects.toThrow(/T-003/);
    await expect(enc.writeFrame(null as never)).rejects.toThrow(/T-003/);
    await expect(enc.finalize()).rejects.toThrow(/T-003/);
  });

  it("dispose is a no-op safe to call", () => {
    const enc = new FfmpegEncoder({ width: 100, height: 100, fps: 30, format: "mp4" });
    expect(() => enc.dispose()).not.toThrow();
  });
});

describe("WebCodecsVideoProvider", () => {
  it("isSupported returns a boolean based on VideoDecoder availability", () => {
    const result = WebCodecsVideoProvider.isSupported();
    expect(typeof result).toBe("boolean");
    // VideoDecoder is not available in vitest's default node environment
    expect(result).toBe(false);
  });

  it("asProvider returns a callable VideoFrameProvider function", () => {
    const provider = new WebCodecsVideoProvider();
    const cb = provider.asProvider();
    expect(typeof cb).toBe("function");
  });

  it("getFrame returns null for unknown src (triggers async load in background)", () => {
    const provider = new WebCodecsVideoProvider();
    const cb = provider.asProvider();
    const frame = cb("nonexistent.mp4", 0, 1920, 1080);
    expect(frame).toBeNull();
  });

  it("dispose is safe on a fresh provider with no loaded frames", () => {
    const provider = new WebCodecsVideoProvider();
    expect(() => provider.dispose()).not.toThrow();
  });
});
