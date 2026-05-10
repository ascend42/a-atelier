// @a-company/atelier-video
// Video frame providers and encoding pipeline for Atelier

// Preview provider — HTMLVideoElement backed, fast, non-frame-accurate
export { ElementVideoProvider } from "./providers/element-provider.js";

// Export provider — WebCodecs backed, frame-accurate, Chrome/Chromium only
export { WebCodecsVideoProvider } from "./providers/webcodecs-provider.js";

// Encoding pipeline — FFmpeg WASM, T-003 implementation pending
export { FfmpegEncoder } from "./encoding/ffmpeg-encoder.js";
export type { EncodeFormat, EncodeOptions, EncodeProgress } from "./encoding/ffmpeg-encoder.js";
