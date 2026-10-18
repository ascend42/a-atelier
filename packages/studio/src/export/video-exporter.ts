/**
 * Browser-based export for Atelier documents.
 *
 * MP4 path:  WebCodecs VideoEncoder + mp4-muxer (dynamic import).
 * WebM path: WebCodecs VideoEncoder + webm-muxer (dynamic import) — supports alpha.
 * GIF path:  Built-in GIF89a encoder (no deps).
 */

import type { AtelierDocument } from "@a-company/atelier-types";
import { resolveFrame } from "@a-company/atelier-core";
import { withTemplateDefaults } from "../utils/template-defaults.js";
import { renderFrame, ImageCache } from "@a-company/atelier-canvas";
import { createGifEncoder } from "./gif-encoder.js";

// ── Capability checks ──────────────────────────────────────────

/** Returns true if the browser supports WebCodecs (needed for MP4/WebM export). */
export function supportsWebCodecs(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined"
  );
}

/** WebM export uses the same WebCodecs API as MP4. */
export function supportsWebM(): boolean {
  return supportsWebCodecs();
}

/** GIF export is always available (built-in encoder). */
export function supportsGifExport(): boolean {
  return true;
}

// ── Public types ───────────────────────────────────────────────

export type ExportFormat = "mp4" | "gif" | "webm";

/**
 * Async per-frame video seek resolver used by the export loop. Returns the
 * underlying drawable (HTMLVideoElement) once the seek has completed, so
 * the deterministic frame-by-frame encoder can be sure drawImage paints
 * the intended frame. The studio supplies a `BrowserVideoFrameProvider`
 * instance whose `awaitSeek` matches this signature.
 *
 * Without this hook, video layers silently no-op in the exported file
 * because renderFrame's `if (videoFrameProvider)` guard short-circuits —
 * the output then shows a transparent canvas painted only with non-video
 * layers (text/shape/image), reproducing the "single static frame +
 * captions stacked" bug owner caught in animation (1).mp4.
 */
export type VideoSeekResolver = (src: string, sourceTime: number) => Promise<object>;

export interface ExportOptions {
  format: ExportFormat;
  /** Which states to render. Defaults to all states in document order. */
  states?: string[];
  /** Progress callback — called after each frame. */
  onProgress?: (info: { frame: number; total: number; percent: number }) => void;
  /**
   * Optional async video seek. Pass `provider.awaitSeek.bind(provider)`
   * from a BrowserVideoFrameProvider — without this, video layers don't
   * render in the export output. Omitted → video layers silently skip
   * (legacy behaviour).
   */
  videoSeek?: VideoSeekResolver;
  /**
   * Optional resolved URL of a source video whose audio track should be
   * muxed into the output (MP4/WebM only — GIF has no audio container).
   * Mediabunny demuxes the URL's audio packets in-codec and feeds them
   * to mp4-muxer's `addAudioChunkRaw` — no re-encoding. Pass the SAME
   * resolved URL the videoSeek provider uses (i.e. already run through
   * the host's srcResolver). Omitted → silent export, current default.
   *
   * Limitation: only the FIRST video layer's audio is muxed. Multi-clip
   * audio composition is v1.1 — would need an AudioMixer or per-clip
   * EncodedAudioChunk re-timing.
   */
  audioSource?: string;
}

export interface ExportResult {
  blob: Blob;
  format: ExportFormat;
  totalFrames: number;
  durationMs: number;
}

// ── Main export entry ──────────────────────────────────────────

/**
 * Render all frames of a document and encode to MP4, WebM, or GIF.
 *
 * The provided canvas is used as a scratch surface — its contents will
 * be overwritten during export. Caller should pause playback first.
 */
export async function exportDocument(
  doc: AtelierDocument,
  canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  // Templates export with every variable bound to its default.
  doc = withTemplateDefaults(doc);
  if (opts.format === "mp4") {
    return exportMP4(doc, canvas, imageCache, opts);
  }
  if (opts.format === "webm") {
    return exportWebM(doc, canvas, imageCache, opts);
  }
  return exportGIF(doc, canvas, imageCache, opts);
}

// ── Managed encoder wrapper ────────────────────────────────────

/**
 * Wraps VideoEncoder with proper error capture and backpressure.
 *
 * The raw VideoEncoder fires errors via an async callback that can't
 * propagate to our async function. This wrapper captures errors and
 * exposes them synchronously so the frame loop can check before each
 * encode.
 */
interface ManagedEncoder {
  encoder: VideoEncoder;
  /** Throws the stored error if the encoder has failed. */
  checkError(): void;
  /** Wait until the encode queue drains below the threshold. */
  waitForDrain(): Promise<void>;
}

function createManagedEncoder(
  onChunk: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void,
): ManagedEncoder {
  let encError: DOMException | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      onChunk(chunk, meta ?? undefined);
    },
    error: (e) => {
      encError = e;
    },
  });

  function checkError(): void {
    if (encError) {
      const msg = encError.message;
      encError = null;
      throw new Error(`VideoEncoder error: ${msg}`);
    }
    if (encoder.state === "closed") {
      throw new Error("VideoEncoder closed unexpectedly.");
    }
  }

  async function waitForDrain(): Promise<void> {
    // Drain if the encoder has more than 5 frames queued, to avoid
    // memory pressure and give the encoder time to process.
    while (encoder.state === "configured" && encoder.encodeQueueSize > 5) {
      await yieldToMain();
      if (encError) checkError();
    }
  }

  return { encoder, checkError, waitForDrain };
}

// ── MP4 Export (WebCodecs + mp4-muxer) ─────────────────────────

async function exportMP4(
  doc: AtelierDocument,
  canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  if (!supportsWebCodecs()) {
    throw new Error("WebCodecs API not available — MP4 export requires a modern browser.");
  }

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const fps = doc.canvas.fps ?? 30;
  const width = doc.canvas.width;
  const height = doc.canvas.height;

  // H.264 requires even dimensions
  const encWidth = width % 2 === 0 ? width : width + 1;
  const encHeight = height % 2 === 0 ? height : height + 1;

  // Try H.264 profiles from highest capability to lowest
  const codecCandidates: VideoEncoderConfig[] = [
    { codec: "avc1.640033", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // High 5.1 (4K)
    { codec: "avc1.64002a", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // High 4.2 (1080p60)
    { codec: "avc1.640028", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // High 4.0 (1080p30)
    { codec: "avc1.42001f", width: encWidth, height: encHeight, bitrate: 5_000_000, framerate: fps }, // Baseline 3.1 (720p)
  ];

  let support: VideoEncoderSupport | null = null;
  for (const candidate of codecCandidates) {
    const result = await VideoEncoder.isConfigSupported(candidate);
    if (result.supported) {
      support = result;
      break;
    }
  }

  if (!support?.supported) {
    throw new Error(
      `H.264 codec not supported for ${encWidth}\u00D7${encHeight} at ${fps}fps. ` +
      `Try exporting as GIF or WebM instead.`,
    );
  }

  // Pre-resolve the source audio track's codec/channels/rate via Mediabunny
  // so we can configure the muxer's audio track BEFORE writing any chunks
  // (mp4-muxer requires the audio config up-front, not lazily on first
  // addAudioChunk). If no audioSource was given or the URL has no decodable
  // audio, fall through to a silent export. This call is the only thing
  // that could block on network — keep it small + fail-soft.
  let audioConfig: {
    codec: "aac" | "opus";
    channels: number;
    sampleRate: number;
    decoderConfig?: AudioDecoderConfig;
    extract: () => Promise<Array<{ data: Uint8Array; type: "key" | "delta"; timestamp: number; duration: number }>>;
  } | null = null;
  if (opts.audioSource) {
    try {
      audioConfig = await resolveAudioConfig(opts.audioSource);
    } catch (err) {
      console.warn("[atelier export] audio mux skipped:", err);
    }
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width: encWidth,
      height: encHeight,
    },
    ...(audioConfig ? {
      audio: {
        codec: audioConfig.codec,
        numberOfChannels: audioConfig.channels,
        sampleRate: audioConfig.sampleRate,
      },
    } : {}),
    fastStart: "in-memory",
  });

  const { encoder, checkError, waitForDrain } = createManagedEncoder(
    (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  );

  encoder.configure(support.config!);

  // Let the encoder process the config before we start encoding
  await yieldToMain();
  checkError();

  const frames = collectFrames(doc, opts.states);
  const totalFrames = frames.length;
  const frameDurationUs = Math.round(1_000_000 / fps);

  const ctx = canvas.getContext("2d")!;
  const origWidth = canvas.width;
  const origHeight = canvas.height;
  if (encWidth !== width || encHeight !== height) {
    canvas.width = encWidth;
    canvas.height = encHeight;
  }

  // Build a per-frame videoFrameProvider that returns the already-seeked
  // <video> element from our local cache. seekVideosForFrame populates the
  // cache by awaiting the host's async seek BEFORE renderFrame runs; this
  // sync provider just hands it the result.
  const seekedFrames = new Map<string, object>();
  const videoFrameProvider = opts.videoSeek
    ? (src: string): object | null => seekedFrames.get(src) ?? null
    : undefined;

  try {
    for (let i = 0; i < totalFrames; i++) {
      checkError();
      await waitForDrain();

      const { state, frame } = frames[i];
      const resolved = resolveFrame(doc, state, frame);

      // For every VideoVisual layer in the resolved frame, await a seek to
      // the layer's sourceTime BEFORE rendering. Without this, the renderer's
      // sync `videoFrameProvider(src, time)` would return null (no cached
      // frame for this time) and the video layer would be skipped, exactly
      // reproducing the "single static frame" export bug.
      if (opts.videoSeek) {
        seekedFrames.clear();
        for (const r of resolved.layers) {
          if (r.layer.visual.type !== "video") continue;
          const v = r.layer.visual;
          const src = v.src ?? (v.assetId ? doc.assets?.[v.assetId]?.src : undefined);
          if (!src) continue;
          const sourceTime = r.videoSourceTime ?? 0;
          const drawable = await opts.videoSeek(src, sourceTime);
          seekedFrames.set(src, drawable);
        }
      }

      renderFrame(ctx as any, resolved, doc, {
        imageCache,
        videoFrameProvider,
      });

      const timestamp = i * frameDurationUs;
      const videoFrame = new VideoFrame(canvas, { timestamp });
      encoder.encode(videoFrame, { keyFrame: i % 60 === 0 });
      videoFrame.close();

      opts.onProgress?.({
        frame: i + 1,
        total: totalFrames,
        percent: Math.round(((i + 1) / totalFrames) * 100),
      });

      if (i % 10 === 9) await yieldToMain();
    }

    await encoder.flush();
    checkError();
    encoder.close();

    // Mux audio AFTER video encode finishes. Doing it before would race the
    // video encoder's interleave with mp4-muxer's internal track interleaver
    // and risk out-of-order chunks; doing it serially is simpler + correct.
    // Audio chunks are pre-encoded in-source-codec (no re-encode pass), so
    // this is just an I/O loop, not a decode loop.
    if (audioConfig) {
      const audioPackets = await audioConfig.extract();
      const decoderConfig = audioConfig.decoderConfig;
      for (const p of audioPackets) {
        muxer.addAudioChunkRaw(
          p.data,
          p.type,
          p.timestamp,
          p.duration,
          decoderConfig ? { decoderConfig } : undefined,
        );
      }
    }

    muxer.finalize();
  } finally {
    // Restore canvas dimensions even if encoding fails
    if (encWidth !== width || encHeight !== height) {
      canvas.width = origWidth;
      canvas.height = origHeight;
    }
  }

  const durationMs = Math.round((totalFrames / fps) * 1000);
  return {
    blob: new Blob([target.buffer], { type: "video/mp4" }),
    format: "mp4",
    totalFrames,
    durationMs,
  };
}

// ── Mediabunny audio extract helper ─────────────────────────────

/**
 * Demux the audio track from a source URL, returning the encoded packets
 * and the muxer-config it needs (codec, channels, sample rate). Bytes are
 * returned in source codec — no decode/re-encode pass, so a 4-minute AAC
 * source takes well under 100ms to extract.
 *
 * Throws if Mediabunny can't open the URL or the file has no audio track.
 * Caller (exportMP4) catches + warns + falls back to silent export.
 */
async function resolveAudioConfig(audioSourceUrl: string): Promise<{
  codec: "aac" | "opus";
  channels: number;
  sampleRate: number;
  decoderConfig?: AudioDecoderConfig;
  extract: () => Promise<Array<{ data: Uint8Array; type: "key" | "delta"; timestamp: number; duration: number }>>;
}> {
  // Mediabunny is a ~1MB dep; dynamic-import so silent-audio exports don't
  // pay the parse cost. Same pattern mp4-muxer + webm-muxer follow.
  const { Input, UrlSource, ALL_FORMATS, EncodedPacketSink } = await import("mediabunny");
  const input = new Input({
    source: new UrlSource(audioSourceUrl),
    formats: ALL_FORMATS,
  });
  const tracks = await input.getTracks();
  // isAudioTrack() narrows InputTrack → InputAudioTrack so we can hit
  // getNumberOfChannels / getSampleRate / getDecoderConfig without a cast.
  const audioTrack = tracks.find((t) => t.isAudioTrack());
  if (!audioTrack || !audioTrack.isAudioTrack()) {
    throw new Error(`no audio track in ${audioSourceUrl}`);
  }

  const codecName = await audioTrack.getCodec();
  // mp4-muxer accepts only aac/opus. Other codecs (mp3, flac, vorbis) would
  // require a transcode pass — out of scope for v1.0.
  const muxerCodec: "aac" | "opus" | null =
    codecName === "aac" ? "aac" :
    codecName === "opus" ? "opus" :
    null;
  if (!muxerCodec) {
    throw new Error(`source audio codec '${codecName}' isn't mp4-muxer compatible (need aac/opus)`);
  }

  const channels = await audioTrack.getNumberOfChannels();
  const sampleRate = await audioTrack.getSampleRate();
  const decoderConfig = (await audioTrack.getDecoderConfig()) ?? undefined;

  return {
    codec: muxerCodec,
    channels,
    sampleRate,
    decoderConfig: decoderConfig ?? undefined,
    extract: async () => {
      const sink = new EncodedPacketSink(audioTrack);
      const packets: Array<{ data: Uint8Array; type: "key" | "delta"; timestamp: number; duration: number }> = [];
      // Some containers (AAC in MOV/MP4) report priming-sample packets with
      // a small negative timestamp (typically -0.024s for 24ms of encoder
      // priming). mp4-muxer rejects negative timestamps via "must be a
      // non-negative real number". We rebase the timestamps so the first
      // packet sits at 0 — losing the priming offset is acceptable for our
      // single-source use case where AV-sync is already approximate (no
      // sub-frame Player-side audio compensation either).
      let firstTimestampS: number | null = null;
      for await (const packet of sink.packets()) {
        if (firstTimestampS === null) firstTimestampS = packet.timestamp;
        // Skip packets with non-finite times (corrupt container or live
        // stream we're not handling); also skip if duration is NaN/0 since
        // mp4-muxer needs a real duration for muxing.
        if (!Number.isFinite(packet.timestamp) || !Number.isFinite(packet.duration)) continue;
        const rebasedTimestampS = packet.timestamp - firstTimestampS;
        const tsUs = Math.max(0, Math.round(rebasedTimestampS * 1_000_000));
        const durUs = Math.max(0, Math.round(packet.duration * 1_000_000));
        packets.push({
          data: packet.data,
          // mp4-muxer treats audio packets uniformly; mediabunny exposes
          // delta/key but for typical AAC every packet is independently
          // decodable so 'key' is the safer default.
          type: "key",
          timestamp: tsUs,
          duration: durUs,
        });
      }
      return packets;
    },
  };
}

// ── WebM Export (WebCodecs VP9 + webm-muxer, alpha support) ────

async function exportWebM(
  doc: AtelierDocument,
  _canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  if (!supportsWebCodecs()) {
    throw new Error("WebCodecs API not available — WebM export requires a modern browser.");
  }

  const { Muxer, ArrayBufferTarget } = await import("webm-muxer");

  const fps = doc.canvas.fps ?? 30;
  const width = doc.canvas.width;
  const height = doc.canvas.height;

  // Try VP9 with alpha first, fall back to VP9 without alpha, then VP8
  const codecCandidates: VideoEncoderConfig[] = [
    {
      codec: "vp09.00.10.08",
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
      alpha: "keep",
    },
    {
      codec: "vp09.00.10.08",
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
    },
    {
      codec: "vp8",
      width,
      height,
      bitrate: 5_000_000,
      framerate: fps,
    },
  ];

  let chosenConfig: VideoEncoderConfig | null = null;
  for (const candidate of codecCandidates) {
    const support = await VideoEncoder.isConfigSupported(candidate);
    if (support.supported) {
      chosenConfig = support.config!;
      break;
    }
  }

  if (!chosenConfig) {
    throw new Error(
      `No supported VP9/VP8 codec for ${width}\u00D7${height}. ` +
      `Try exporting as MP4 or GIF instead.`,
    );
  }

  const hasAlpha = chosenConfig.alpha === "keep";
  const muxCodec = chosenConfig.codec.startsWith("vp09") ? "V_VP9" : "V_VP8";

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: muxCodec,
      width,
      height,
    },
  });

  const { encoder, checkError, waitForDrain } = createManagedEncoder(
    (chunk, meta) => muxer.addVideoChunk(chunk, meta),
  );

  encoder.configure(chosenConfig);

  await yieldToMain();
  checkError();

  const frames = collectFrames(doc, opts.states);
  const totalFrames = frames.length;
  const frameDurationUs = Math.round(1_000_000 / fps);

  // Use a separate canvas with explicit alpha setting
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = width;
  alphaCanvas.height = height;
  const ctx = alphaCanvas.getContext("2d", { alpha: hasAlpha })!;

  // Per-frame video seek cache, see exportMP4 for full rationale.
  const seekedFrames = new Map<string, object>();
  const videoFrameProvider = opts.videoSeek
    ? (src: string): object | null => seekedFrames.get(src) ?? null
    : undefined;

  for (let i = 0; i < totalFrames; i++) {
    checkError();
    await waitForDrain();

    const { state, frame } = frames[i];
    const resolved = resolveFrame(doc, state, frame);
    if (opts.videoSeek) {
      seekedFrames.clear();
      for (const r of resolved.layers) {
        if (r.layer.visual.type !== "video") continue;
        const v = r.layer.visual;
        const src = v.src ?? (v.assetId ? doc.assets?.[v.assetId]?.src : undefined);
        if (!src) continue;
        const sourceTime = r.videoSourceTime ?? 0;
        const drawable = await opts.videoSeek(src, sourceTime);
        seekedFrames.set(src, drawable);
      }
    }
    ctx.clearRect(0, 0, width, height);
    renderFrame(ctx as any, resolved, doc, {
      imageCache,
      videoFrameProvider,
    });

    const timestamp = i * frameDurationUs;
    const frameOpts: VideoFrameInit = { timestamp };
    if (hasAlpha) (frameOpts as any).alpha = "keep";
    const videoFrame = new VideoFrame(alphaCanvas, frameOpts);
    encoder.encode(videoFrame, { keyFrame: i % 60 === 0 });
    videoFrame.close();

    opts.onProgress?.({
      frame: i + 1,
      total: totalFrames,
      percent: Math.round(((i + 1) / totalFrames) * 100),
    });

    if (i % 10 === 9) await yieldToMain();
  }

  await encoder.flush();
  checkError();
  encoder.close();
  muxer.finalize();

  const durationMs = Math.round((totalFrames / fps) * 1000);
  return {
    blob: new Blob([target.buffer], { type: "video/webm" }),
    format: "webm",
    totalFrames,
    durationMs,
  };
}

// ── GIF Export ──────────────────────────────────────────────────

async function exportGIF(
  doc: AtelierDocument,
  canvas: HTMLCanvasElement,
  imageCache: ImageCache,
  opts: ExportOptions,
): Promise<ExportResult> {
  const fps = doc.canvas.fps ?? 30;
  const width = doc.canvas.width;
  const height = doc.canvas.height;
  const ctx = canvas.getContext("2d")!;

  const frames = collectFrames(doc, opts.states);
  const totalFrames = frames.length;

  const encoder = createGifEncoder(width, height);

  // GIF delays are in centiseconds (10ms granularity). Browsers clamp
  // very short delays — Firefox treats ≤2cs as 100ms, Chrome ≤1cs.
  // We use 3cs (30ms) minimum, which is safe across all browsers and
  // gives a maximum effective GIF framerate of ~33fps.
  //
  // For high-fps documents (e.g. 60fps) we skip source frames so the
  // animation plays at the correct speed — just at reduced smoothness,
  // not reduced tempo.
  const MIN_DELAY_CS = 3;
  const minFrameMs = MIN_DELAY_CS * 10;

  let accGifTimeMs = 0;
  let gifFrameCount = 0;

  // Per-frame video seek cache, see exportMP4 for full rationale.
  const seekedFrames = new Map<string, object>();
  const videoFrameProvider = opts.videoSeek
    ? (src: string): object | null => seekedFrames.get(src) ?? null
    : undefined;

  for (let i = 0; i < totalFrames; i++) {
    const frameEndMs = ((i + 1) * 1000) / fps;

    // Skip this frame if not enough real time has elapsed for a GIF
    // frame — but always emit the last frame.
    if (frameEndMs - accGifTimeMs < minFrameMs && i < totalFrames - 1) {
      opts.onProgress?.({
        frame: i + 1,
        total: totalFrames,
        percent: Math.round(((i + 1) / totalFrames) * 100),
      });
      continue;
    }

    const { state, frame } = frames[i];
    const resolved = resolveFrame(doc, state, frame);
    if (opts.videoSeek) {
      seekedFrames.clear();
      for (const r of resolved.layers) {
        if (r.layer.visual.type !== "video") continue;
        const v = r.layer.visual;
        const src = v.src ?? (v.assetId ? doc.assets?.[v.assetId]?.src : undefined);
        if (!src) continue;
        const sourceTime = r.videoSourceTime ?? 0;
        const drawable = await opts.videoSeek(src, sourceTime);
        seekedFrames.set(src, drawable);
      }
    }
    renderFrame(ctx as any, resolved, doc, {
      imageCache,
      videoFrameProvider,
    });

    const delayCentiseconds = Math.max(MIN_DELAY_CS, Math.round((frameEndMs - accGifTimeMs) / 10));
    accGifTimeMs += delayCentiseconds * 10;

    const imageData = ctx.getImageData(0, 0, width, height);
    encoder.addFrame(imageData.data, delayCentiseconds);
    gifFrameCount++;

    opts.onProgress?.({
      frame: i + 1,
      total: totalFrames,
      percent: Math.round(((i + 1) / totalFrames) * 100),
    });

    if (gifFrameCount % 10 === 9) await yieldToMain();
  }

  const bytes = encoder.finish();
  const durationMs = Math.round((totalFrames / fps) * 1000);

  return {
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: "image/gif" }),
    format: "gif",
    totalFrames,
    durationMs,
  };
}

// ── Helpers ────────────────────────────────────────────────────

interface FrameEntry {
  state: string;
  frame: number;
}

function collectFrames(
  doc: AtelierDocument,
  stateNames?: string[],
): FrameEntry[] {
  const names = stateNames ?? Object.keys(doc.states);
  const entries: FrameEntry[] = [];
  for (const state of names) {
    const s = doc.states[state];
    if (!s) continue;
    for (let f = 0; f < s.duration; f++) {
      entries.push({ state, frame: f });
    }
  }
  return entries;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
