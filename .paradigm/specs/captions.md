# Captions — Transcription, Caption Layer Generation, Editable Transcript

**Status:** Draft — pending implementation
**Owner:** #cli-transcribe (new), #caption-pipeline (new), #video-project
**Related tasks:** T-006 (Whisper transcribe), T-008 (timeline UI, consumes caption tags)
**Depends on:** T-004 (VideoProject) ✓ shipped in 0.30.0
**Pairs with:** `silence-trim.md` — shares the *detected-vs-user-edited* model and the layer-tagging convention

---

## 1. Problem

UGC creators need three things from automatic captions:

1. **Auto-generated word-timed captions** that highlight as spoken
2. **Cheap correction flow** for the inevitable transcription errors — Whisper is great, not perfect
3. **Non-destructive re-runs** — if I re-transcribe after recording a new take, my hand-edits don't get blown away

Existing types in `@a-company/atelier-types` (T-004) already define `VideoTranscript`, `TranscriptSegment`, and `TranscriptWord`. This spec extends them with edit-preservation, defines the transcribe pipeline, the editing CLI/agent surface, and the caption-layer generation algorithm.

## 2. Goals

- `atelier transcribe <project>` produces `transcript.json` with word-level timestamps
- Caption `TextVisual` layers tagged `caption` are generated into `project.atelier`
- Word-by-word highlight animation (the "lights up when spoken" effect) using existing tint/opacity deltas — no new engine primitives
- Per-word edits stored alongside the detected text; preserved across re-transcribe
- CLI affordances for batch find/replace, single-word edit, delete/hide, add, merge, split
- Agent-mediated edits via Iris (Composer) using existing MCP tools
- **Local-first** — no required cloud upload; OpenAI API is optional, not the default

## 3. Non-Goals

- Speaker diarization ("who is talking") — separate problem, separate tools (pyannote etc.)
- Multi-language translation — Whisper handles transcription only
- Custom-vocab training / fine-tuning — out of scope; users can post-process with find/replace
- Caption styling presets — that belongs in Studio Recipe (separate spec)
- Real-time / live captioning — batch-only
- Music lyrics or non-speech captioning

## 4. Layer Tagging Convention (shared across pipelines)

This spec **locks the convention** for pipeline-managed layers in `project.atelier`. Used by `atelier trim`, `atelier transcribe`, and future pipeline commands.

| Tag | Managed by | What it tags |
|------|------------|--------------|
| `silence-trim` | `atelier trim` | VideoVisual clips representing kept speech segments |
| `caption` | `atelier transcribe` | TextVisual layers — phrase lines, one per caption block |
| `caption-word` | `atelier transcribe` | Optional fine-grain word-overlay layers if word-isolated styling is requested |
| `overlay` | User or future overlay tool | User-placed images, gifs, b-roll |
| (no tag) | User-authored | Hand-placed layers — never touched by any pipeline |

**Rule:** any pipeline only ever rewrites layers carrying *its own* tag. Untagged or differently-tagged layers survive every re-run.

## 5. Data Model

### 5.1 Extended `TranscriptWord`

Replaces the type in `packages/types/src/video-project.ts`:

```typescript
export interface TranscriptWord {
  /** What Whisper heard (immutable post-detection) */
  detected: string;
  /** What gets rendered (defaults to detected; user can override) */
  text: string;
  /** Start time in seconds (audio-anchored — never moves on text edits) */
  start: number;
  /** End time in seconds */
  end: number;
  /** Whisper confidence score 0–1 — UI can flag low-conf words */
  confidence?: number;
  /** True if user has overridden text — preserved through re-transcribe */
  userEdited?: boolean;
  /** True if user inserted this word (Whisper missed it) — preserved through re-transcribe */
  userAdded?: boolean;
  /** True if this word should be excluded from caption render but kept in transcript */
  hidden?: boolean;
}
```

### 5.2 `VideoTranscript` versioning

Bump to `version: "1.1"`. Add a `version` field; loaders migrate 1.0 transcripts (which have only `word: string`) by setting `detected = text = word` and leaving flags unset.

```typescript
export interface VideoTranscript {
  version: string;           // "1.1"
  language?: string;         // BCP-47, from Whisper
  segments: TranscriptSegment[];
}
```

### 5.3 Caption layer convention

For each rendered caption *phrase*:

```typescript
{
  id: `caption-${phraseIdx}`,
  tags: ["caption"],
  visual: {
    type: "text",
    content: "I went to the store",  // user-edited text wins
    style: {
      fontFamily: "Inter",            // default; overridable by Studio Recipe
      fontSize: 84,
      fontWeight: "bold",
      textAlign: "center",
      color: "#FFFFFF",
    },
  },
  frame:  { x: canvas.width / 2, y: canvas.height * 0.85 },
  bounds: { width: canvas.width * 0.9, height: 200 },
  anchorPoint: { x: 0.5, y: 0.5 },
  opacity: 0,
}
```

Plus opacity deltas:

```
[phrase.start - 0.05, phrase.start]  : opacity 0 → 1   (fade in)
[phrase.end,         phrase.end + 0.05] : opacity 1 → 0 (fade out)
```

**Word-by-word highlight:** generated as `tint` deltas on the same layer (single-color tint pulse per word) OR as separate `caption-word` overlay layers (per-word TextVisual stacked on top, with `color` deltas). The renderer supports both; default is the tint-pulse approach (simpler, one layer per phrase, less timeline noise).

## 6. Algorithm

### 6.1 Whisper invocation (whisper.cpp preferred path)

```
whisper-cli source.<ext> \
  --model models/ggml-base.en.bin \
  --output-json \
  --word-timestamps \
  --output-file transcript-raw.json
```

Output is JSON with per-word timestamps. Parse into `VideoTranscript` structure (one `TranscriptSegment` per sentence-level boundary as detected by Whisper).

### 6.2 Fallback: @xenova/transformers (Node ONNX)

If `whisper-cli` binary not found in PATH, fall back to ONNX runtime via `@xenova/transformers`. Same output shape. Slower (1-2x realtime vs 5-15x for native), but works on machines without the binary.

### 6.3 Phrase grouping for caption blocks

Whisper segments are too long for on-screen captions (full sentences). Re-group into 3-5 word phrases:

```
For each segment in transcript:
  current_phrase = []
  for word in segment.words (skipping hidden):
    current_phrase.append(word)
    if (
      len(current_phrase) >= 4 OR
      word ends with ',' or '.' or '?' or '!' OR
      gap_to_next_word > 0.4s
    ):
      emit_phrase(current_phrase)
      current_phrase = []
  if current_phrase: emit_phrase(current_phrase)
```

Each emitted phrase becomes one `caption` layer (§5.3).

### 6.4 Re-transcribe merge logic

Mirror of silence-trim's re-detect behavior:

1. Read existing `transcript.json`. If empty, behave as fresh run.
2. Run Whisper anew.
3. For each fresh word, find existing word with `|start_new - start_old| < 0.3s AND detected_new == detected_old`.
4. If matched: preserve `text`, `userEdited`, `userAdded`, `hidden`. Overwrite only timing if it shifted.
5. If unmatched: fresh word with `detected = text` and no flags.
6. User-added words (no matching detected word) are preserved unconditionally — they were never "detected" so no match is expected.

`--reset` skips the merge — fully fresh transcript.

### 6.5 Caption layer regeneration

Triggered by transcribe OR by `atelier captions regenerate`. Same procedure:

1. Read current `transcript.json`
2. Remove all layers tagged `caption` or `caption-word`
3. Re-group into phrases (§6.3)
4. Write new `caption` layers with opacity + tint deltas

User-edited `text` always wins. Layers tagged anything else are untouched.

## 7. CLI Surface

### 7.1 `atelier transcribe`

```
atelier transcribe <project-dir> [options]

Options:
  --model <name>       Whisper model: tiny|base|small|medium|large-v3 (default: base.en)
  --language <code>    BCP-47 language hint (default: autodetect)
  --reset              Discard existing user edits; full fresh transcript
  --no-captions        Write transcript.json only; skip caption layer generation
  --recipe <path>      Read caption style + phrase rules from Studio Recipe
  --use-api            Use OpenAI Whisper API instead of local (requires OPENAI_API_KEY)
  --dry-run            Print transcript to stdout; don't write files
  --json               Output transcript as JSON for piping
```

### 7.2 `atelier transcript` (edit subcommands)

```
atelier transcript fix <project-dir> --replace "<wrong>=<right>" [...]
atelier transcript fix <project-dir> --word <idx> --text "<correction>"
atelier transcript add <project-dir> --after-word <idx> --text "<word>" [--duration <s>]
atelier transcript delete <project-dir> --word <idx>             # sets hidden=true
atelier transcript merge <project-dir> --words <i,i+1>           # merges adjacent words
atelier transcript split <project-dir> --word <idx> --at <fraction>  # splits one word in two
atelier transcript list <project-dir> [--json]                   # print with indices
```

All edit commands set `userEdited: true` (or `userAdded: true` for `add`) on affected words and trigger caption layer regeneration unless `--no-regenerate` is passed.

### 7.3 `atelier captions regenerate`

```
atelier captions regenerate <project-dir> [--recipe <path>]
```

Re-derives caption layers from current `transcript.json`. Used when caption *styling* changes (recipe swap, font tweak) without re-transcribing audio.

### 7.4 Startup probe

On `atelier transcribe`:

```typescript
async function probeWhisper(): Promise<"native" | "onnx"> {
  if (await commandExists("whisper-cli")) return "native";
  if (canImport("@xenova/transformers")) return "onnx";
  throw new Error(
    "No Whisper backend available. Install whisper.cpp (brew install whisper-cpp) " +
    "or run `pnpm add @xenova/transformers` for the ONNX fallback."
  );
}
```

Fail loud, fail early.

## 8. Edge Cases

| Case | Behavior |
|------|----------|
| Word with `confidence < 0.5` | Marked in transcript; UI/CLI can highlight for review. Still rendered unless `hidden`. |
| Two words detected as one ("NewYork") | User splits via `transcript split --at 0.5` — timing prorated. |
| One word detected as two ("New" + "York") | User merges via `transcript merge --words 14,15` — timestamps span combined range. |
| Re-transcribe drops a word user had edited | The user-edited word survives as orphan with original timing — flagged `userEdited` but no matching detection. Surfaces as a warning. |
| User-added word with explicit timing past `duration` | Clamped to source duration; warning emitted. |
| User edits text to empty string | Treated as `hidden: true` — preserves timing but skips render. |
| Phrase grouping spans a silence cut (T-007b) | Caption phrase still emits as a single block; renderer handles the gap (the underlying clip jumps but the caption text is continuous). |
| Two languages in one take | Whisper auto-detects per segment if `--language` not set; transcript records `language` at the top level. Mixed-language UGC is rare. |
| Format 1.0 transcript (legacy) | Migrated on read: `word.detected = word.text = word.word` |

## 9. Library Vetting

This spec adds **one optional npm dependency** and **one optional system binary**, with a graceful-degradation path between them.

### 9.1 whisper.cpp (system binary, preferred path)

| Aspect | Finding |
|--------|---------|
| **Maintainer** | Georgi Gerganov (also llama.cpp). Active commits weekly. |
| **License** | MIT |
| **Maturity** | Initial release Oct 2022; powers Descript, OBS plugins, dozens of products. |
| **Install** | `brew install whisper-cpp` (macOS), prebuilt binaries on GitHub releases (Linux/Windows). |
| **Models** | Hosted on Hugging Face. `base.en` (~140MB) is the default; downloads on first use. |
| **CVEs** | None affecting the inference path. Model file is GGML format — binary, but Whisper's parser is well-fuzzed. |
| **Attack surface** | Subprocess via `child_process.spawn`; output is JSON. No deserialization beyond `JSON.parse`. Same model as ffmpeg integration. |
| **Pinned minimum** | whisper.cpp release ≥ 1.5.0 — first version with stable `--word-timestamps` flag. |

### 9.2 @xenova/transformers (npm, optional ONNX fallback)

| Aspect | Finding |
|--------|---------|
| **Maintainer** | Hugging Face (organization). Active development. |
| **License** | Apache-2.0 |
| **Maturity** | Production-grade. Used in HF's own Transformers.js demos and downstream products. |
| **Bundle size** | The npm package is ~5MB; models download separately on first use (~75MB for base, cached). |
| **CVEs** | None as of vetting. Surface is ONNX runtime + model loading. |
| **Audit posture** | `pnpm audit` clean at the time of this spec. |
| **Pinned minimum** | `@xenova/transformers ^2.17.0` (current stable line) |
| **Adoption gating** | Optional peer dependency. Not installed by default; users opt-in by `pnpm add @xenova/transformers` if they need the fallback. |

### 9.3 OpenAI Whisper API (third-party service, opt-in only)

| Aspect | Finding |
|--------|---------|
| **Usage** | Only when `--use-api` is passed. Default off. |
| **Required env** | `OPENAI_API_KEY` |
| **Data flow** | Uploads source audio to OpenAI's servers. Documented for users; not used silently. |
| **License/terms** | OpenAI API terms apply. |
| **Why opt-in only** | Privacy concern for UGC creators — many won't want their unreleased footage sent to a third party. |

### 9.4 No other new dependencies

Same as silence-trim: ffmpeg (already a project dep) handles audio extraction; `commander`, `yaml`, `zod`, `node:child_process` are all already in the tree.

## 10. Test Plan

### 10.1 Unit tests

- whisper.cpp JSON output parsing → `VideoTranscript`
- Phrase grouping algorithm (§6.3) — given fixture transcripts, expected phrase boundaries
- Re-transcribe merge (§6.4) — userEdited words survive; matching by start-time + detected text
- Caption layer generation — phrase becomes one `caption`-tagged TextVisual with correct opacity deltas
- Format 1.0 → 1.1 migration on read
- `userAdded` words preserved even with no matching detection
- `hidden: true` excludes from caption render but stays in transcript
- `--reset` discards user edits
- `transcript merge` / `split` / `delete` / `add` — round-trip with timing preservation

### 10.2 Integration tests

- Fixture: 30-second clip with known transcript → `atelier transcribe` produces expected layer count and content
- Edit one word via CLI → caption layer content updates without timing drift
- Re-transcribe after one user edit → user's edit preserved; other words refreshed
- Caption layers regenerate without re-transcribing when `atelier captions regenerate --recipe new.yaml` is called

### 10.3 Manual dogfood

- Real take of user's UGC — transcribe, scan transcript for errors, fix one common misheard term, re-render, verify captions match audio
- Re-record the same scripted take, re-transcribe, verify user's term-fix survives the re-run
- Confirm caption highlight pulse renders cleanly at 30fps and at 60fps

## 11. Open Questions

1. **Default caption position** — bottom-third (current draft) vs. center? Recipe override planned, but the default ships somewhere.
2. **Default font** — Inter? Or sniff installed system fonts? Recipe override is the long-term answer.
3. **Word highlight color** — gold/yellow is the UGC convention; expose via recipe.
4. **Should `transcript fix` accept regex find/replace?** Power-users will want it. Defer to a `--regex` flag if requested.
5. **Caption export for VTT/SRT** — separate `atelier captions export --format srt` command? Useful for YouTube upload. Probably yes, but not required for v1.

## 12. Risks

- **whisper.cpp install friction**: requires Homebrew on macOS or manual binary install elsewhere. Mitigated by ONNX fallback and clear error messaging.
- **Phrase grouping mis-segmentation**: aggressive comma-splits produce too many short caption blocks; conservative grouping produces unreadable runs. Validate empirically and expose the grouping rule as a recipe parameter.
- **Word-highlight timing on rapid speech**: words shorter than ~150ms can produce visual flicker. Mitigation: floor the highlight pulse duration at 100ms even if the word is shorter.
- **Tint vs caption-word layer modes diverge**: the two highlight render paths can drift in look. Keep them visually identical at the engine level; document which the renderer picks.
