/**
 * Minimal GIF89a animated encoder — zero dependencies.
 *
 * Produces looping animated GIFs from RGBA pixel data.
 * Uses popularity-based color quantization (top 256 colors)
 * and standard variable-length LZW compression.
 *
 * Performance-critical paths use typed arrays and numeric
 * lookups — no string allocations in the hot loop.
 */

export interface GifEncoder {
  /** Add a frame. `pixels` is RGBA (width*height*4). `delay` is in centiseconds. */
  addFrame(pixels: Uint8ClampedArray, delay: number): void;
  /** Finalize and return the complete GIF byte stream. */
  finish(): Uint8Array;
}

export function createGifEncoder(width: number, height: number): GifEncoder {
  const chunks: Uint8Array[] = [];

  // ── Header + Logical Screen Descriptor ────────────────────
  const header = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
    width & 0xff, (width >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
    0xf7, // GCT flag, 8-bit color, 256 entries (7+1=8 → 2^8=256)
    0x00, // background color index
    0x00, // pixel aspect ratio
  ]);
  chunks.push(header);

  let globalPalette: Uint8Array | null = null;

  // NETSCAPE2.0 looping extension (loop forever)
  const loopExt = new Uint8Array([
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, // "NETSCAPE"
    0x32, 0x2e, 0x30, // "2.0"
    0x03, 0x01,
    0x00, 0x00, // loop count = 0 (infinite)
    0x00,       // terminator
  ]);

  let frameCount = 0;

  function addFrame(pixels: Uint8ClampedArray, delay: number): void {
    const { palette, indices } = quantize(pixels, width, height);

    if (frameCount === 0) {
      globalPalette = palette;
      chunks.push(globalPalette);
      chunks.push(loopExt);
    }

    // Graphic Control Extension
    const gce = new Uint8Array([
      0x21, 0xf9, 0x04,
      0x08, // disposal = restore to background, no transparency
      delay & 0xff, (delay >> 8) & 0xff,
      0x00, 0x00,
    ]);
    chunks.push(gce);

    // Image Descriptor
    const imgDesc = new Uint8Array([
      0x2c,
      0x00, 0x00, 0x00, 0x00,
      width & 0xff, (width >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
      frameCount === 0 ? 0x00 : 0x87,
    ]);
    chunks.push(imgDesc);

    if (frameCount > 0) {
      chunks.push(palette);
    }

    chunks.push(lzwEncode(indices, 8));
    frameCount++;
  }

  function finish(): Uint8Array {
    if (frameCount === 0 && !globalPalette) {
      globalPalette = new Uint8Array(256 * 3);
      chunks.push(globalPalette);
      chunks.push(loopExt);
    }

    chunks.push(new Uint8Array([0x3b])); // trailer

    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  return { addFrame, finish };
}

// ── Color Quantization ────────────────────────────────────────

interface QuantizeResult {
  palette: Uint8Array;
  indices: Uint8Array;
}

/**
 * 15-bit frequency table (32768 entries) — avoids Map overhead entirely.
 * Reused across frames to avoid re-allocation.
 */
const freqTable = new Uint32Array(32768);

function quantize(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): QuantizeResult {
  const pixelCount = width * height;

  // ── Pass 1: count 15-bit color frequencies ──
  freqTable.fill(0);
  const pixelKeys = new Uint16Array(pixelCount); // 15-bit key per pixel

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    const key = ((pixels[off] >> 3) << 10) | ((pixels[off + 1] >> 3) << 5) | (pixels[off + 2] >> 3);
    freqTable[key]++;
    pixelKeys[i] = key;
  }

  // ── Pass 2: pick top 256 colors ──
  // Collect non-zero entries, partial-sort for top 256
  const entries: { key: number; count: number }[] = [];
  for (let k = 0; k < 32768; k++) {
    if (freqTable[k] > 0) entries.push({ key: k, count: freqTable[k] });
  }

  // Only need top 256 — full sort is fine when entries.length is bounded by 32768
  // but we can use a partial approach: if <= 256 unique colors, skip sort entirely
  let top: { key: number; count: number }[];
  if (entries.length <= 256) {
    top = entries;
  } else {
    entries.sort((a, b) => b.count - a.count);
    top = entries.slice(0, 256);
  }

  // ── Build palette + full 15-bit → index lookup table ──
  const palette = new Uint8Array(256 * 3);
  // paletteLut[15-bit-key] = palette index (for direct hits)
  // We'll fill misses via nearest-neighbor in a second pass
  const paletteR5 = new Uint8Array(256);
  const paletteG5 = new Uint8Array(256);
  const paletteB5 = new Uint8Array(256);
  const paletteCount = top.length;

  // Mark which 15-bit keys map directly to a palette entry
  const directLut = new Int16Array(32768);
  directLut.fill(-1);

  for (let i = 0; i < paletteCount; i++) {
    const key = top[i].key;
    const r5 = (key >> 10) & 0x1f;
    const g5 = (key >> 5) & 0x1f;
    const b5 = key & 0x1f;
    palette[i * 3] = r5 << 3;
    palette[i * 3 + 1] = g5 << 3;
    palette[i * 3 + 2] = b5 << 3;
    paletteR5[i] = r5;
    paletteG5[i] = g5;
    paletteB5[i] = b5;
    directLut[key] = i;
  }

  // Build full 32768-entry LUT: every possible 15-bit color → nearest palette index.
  // This makes the per-pixel mapping O(1) instead of O(256).
  const colorLut = new Uint8Array(32768);
  for (let k = 0; k < 32768; k++) {
    const direct = directLut[k];
    if (direct >= 0) {
      colorLut[k] = direct;
      continue;
    }
    // Nearest-neighbor search (only runs for non-palette colors during LUT build,
    // NOT per pixel — so this 32768 × 256 loop runs once per frame, not per pixel)
    const r = (k >> 10) & 0x1f;
    const g = (k >> 5) & 0x1f;
    const b = k & 0x1f;
    let best = 0;
    let bestDist = 0x7fffffff;
    for (let i = 0; i < paletteCount; i++) {
      const dr = r - paletteR5[i];
      const dg = g - paletteG5[i];
      const db = b - paletteB5[i];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
        if (dist === 0) break;
      }
    }
    colorLut[k] = best;
  }

  // ── Pass 3: map pixels to palette indices — O(1) per pixel ──
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    indices[i] = colorLut[pixelKeys[i]];
  }

  return { palette, indices };
}

// ── LZW Compression (numeric hash-trie, no string allocs) ─────

/**
 * LZW dictionary as a hash table of (prefix, suffix) → code.
 * Uses open addressing with a power-of-2 table for fast modulo.
 *
 * Key encoding: (prefix << 8) | suffix — fits in 20 bits (max prefix 4095, suffix 0-255).
 * Hash table size is 8192 (next power of 2 above 4096).
 */
const LZW_HASH_SIZE = 8192;
const LZW_HASH_MASK = LZW_HASH_SIZE - 1;
const hashKeys = new Int32Array(LZW_HASH_SIZE);
const hashVals = new Int16Array(LZW_HASH_SIZE);

function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const maxDictSize = 4096;

  // Output buffer — pre-allocate generous size, grow if needed
  let buf = new Uint8Array(256 + (indices.length >>> 1));
  let bufPos = 0;
  buf[bufPos++] = minCodeSize; // first byte = min code size

  // Sub-block writer
  let subBlockStart = bufPos; // position where sub-block length byte will go
  buf[bufPos++] = 0; // placeholder for sub-block length
  let subBlockLen = 0;
  let bitBuf = 0;
  let bitCount = 0;

  function ensureCapacity(need: number): void {
    if (bufPos + need >= buf.length) {
      const next = new Uint8Array(Math.max(buf.length * 2, bufPos + need + 256));
      next.set(buf);
      buf = next;
    }
  }

  function writeBits(code: number, codeSize: number): void {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      ensureCapacity(4);
      buf[bufPos++] = bitBuf & 0xff;
      bitBuf >>>= 8;
      bitCount -= 8;
      subBlockLen++;
      if (subBlockLen === 255) {
        buf[subBlockStart] = 255;
        subBlockStart = bufPos;
        buf[bufPos++] = 0; // next sub-block length placeholder
        subBlockLen = 0;
      }
    }
  }

  function flushBits(): void {
    if (bitCount > 0) {
      ensureCapacity(4);
      buf[bufPos++] = bitBuf & 0xff;
      bitBuf = 0;
      bitCount = 0;
      subBlockLen++;
    }
    // Write final sub-block length
    if (subBlockLen > 0) {
      buf[subBlockStart] = subBlockLen;
      ensureCapacity(1);
      buf[bufPos++] = 0; // sub-block terminator
    } else {
      // Remove unused sub-block header, write terminator
      bufPos = subBlockStart;
      ensureCapacity(1);
      buf[bufPos++] = 0;
    }
  }

  // ── Dictionary (hash table) ──
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  function resetDict(): void {
    hashKeys.fill(-1);
    // Seed single-byte entries (0..255) — these are looked up by
    // their initial code, no hash table entry needed since we
    // always start with `current = indices[i]` as a known code.
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  }

  function hashLookup(prefix: number, suffix: number): number {
    const key = (prefix << 8) | suffix;
    let slot = (key * 2654435761) & LZW_HASH_MASK; // Knuth multiplicative hash
    while (true) {
      if (hashKeys[slot] === key) return hashVals[slot];
      if (hashKeys[slot] === -1) return -1;
      slot = (slot + 1) & LZW_HASH_MASK;
    }
  }

  function hashInsert(prefix: number, suffix: number, code: number): void {
    const key = (prefix << 8) | suffix;
    let slot = (key * 2654435761) & LZW_HASH_MASK;
    while (hashKeys[slot] !== -1) {
      slot = (slot + 1) & LZW_HASH_MASK;
    }
    hashKeys[slot] = key;
    hashVals[slot] = code;
  }

  // Begin encoding
  resetDict();
  writeBits(clearCode, codeSize);

  if (indices.length === 0) {
    writeBits(eoiCode, codeSize);
    flushBits();
    return buf.subarray(0, bufPos);
  }

  let current = indices[0]; // current code (starts as single-byte code = pixel value)

  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i];
    const found = hashLookup(current, suffix);
    if (found >= 0) {
      current = found;
    } else {
      writeBits(current, codeSize);
      if (nextCode < maxDictSize) {
        hashInsert(current, suffix, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        writeBits(clearCode, codeSize);
        resetDict();
      }
      current = suffix;
    }
  }

  writeBits(current, codeSize);
  writeBits(eoiCode, codeSize);
  flushBits();

  return buf.subarray(0, bufPos);
}
