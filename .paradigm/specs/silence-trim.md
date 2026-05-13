# Silence Trim — Parametric Cut Model + `atelier trim` CLI

**Status:** Draft — pending implementation
**Owner:** #video-project, #cli-trim (new)
**Related tasks:** T-007 (silence removal pipeline), T-007b (parametric cut adjustment, this spec)
**Depends on:** T-004 (VideoProject folder structure) ✓ shipped in 0.30.0
**Blocks:** T-008 (basic timeline UI) — consumes the parametric cut model authored here

---

## 1. Problem

UGC creators need their dead air gone. Current `CutEntry` (shipped with T-004) stores a single `{ start, end }` pair per kept segment. That model has two failures:

1. **Information loss** — once silence is detected and a kept segment computed, the raw detection boundary is gone. A user who later wants more breath room at the start of a clip can't recover it without re-detecting.
2. **No per-cut tweakability** — the timeline UI (T-008) needs to let the user drag the edges of each clip block to expand or reduce *padding around speech*, not the raw clip extents. Without separating raw detection from user-tunable padding, every edit is destructive and chaotic.

The fix is to make cuts **parametric**: raw detection is immutable, padding is user-tunable, and the effective in/out is computed.

## 2. Goals

- Each kept segment carries both its detected speech boundary and a user-tunable padding pair
- `atelier trim` runs ffmpeg silencedetect and writes the resulting `CutEntry[]` to `cuts.json`
- Subsequent `atelier trim` invocations preserve user padding overrides by default (`--reset` to discard)
- Global "tighten" / "loosen" operations modify *current* padding values across all cuts in one command
- The Atelier composition (`project.atelier`) is rewritten to reflect the current cut list as a sequence of `VideoVisual` layers tagged `silence-trim`
- Overlay layers, caption layers, and any other user-authored layers are never touched by trim
- Headless / scriptable — no UI required to be useful
- **Zero new npm dependencies**

## 3. Non-Goals

- Waveform extraction or rendering (T-008 timeline UI)
- Filler-word ("um"/"uh") detection or word-level cuts (T-006 transcribe)
- Music-aware silence handling (silence with bed music underneath)
- Multi-track audio mixing (Atelier is single-track per state today)
- Per-cut audio gain or fade tweaks (this spec covers temporal cuts only)
- Reusable Studio Recipes as a concept (separate spec — this one only consumes the `silence_policy` block if a recipe is provided)

## 4. Data Model

### 4.1 Extended `CutEntry`

Replaces the current `CutEntry` in `packages/types/src/video-project.ts`:

```typescript
export interface CutEntry {
  /** Raw speech start as detected by ffmpeg silencedetect (immutable post-detection) */
  rawStart: number;
  /** Raw speech end as detected by ffmpeg silencedetect (immutable post-detection) */
  rawEnd: number;
  /** Seconds of padding to keep before rawStart — defaults from recipe.silence_policy.default_padding_pre */
  paddingPre: number;
  /** Seconds of padding to keep after rawEnd — defaults from recipe.silence_policy.default_padding_post */
  paddingPost: number;
  /** Optional label (e.g. "take 1", "primary speech") */
  label?: string;
}
```

**Computed fields (not stored):**
- `start = max(0, rawStart - paddingPre)` — clamped to source start
- `end = min(duration, rawEnd + paddingPost)` — clamped to source end

Code that needs effective in/out calls a helper:

```typescript
export function effectiveSpan(cut: CutEntry, duration: number): { start: number; end: number };
```

### 4.2 `cuts.json` versioning

Bump `VIDEO_PROJECT_VERSION` to `"1.1"`. Add a `version` field to `VideoCutList`:

```typescript
export interface VideoCutList {
  version: string;       // "1.1" for parametric model
  source: string;
  cuts: CutEntry[];
}
```

A loader migration path converts legacy `1.0` cuts ({ start, end }) to `1.1` by treating the stored values as `rawStart`/`rawEnd` with zero padding. This is forward-only — saving always writes `1.1`.

### 4.3 Composition layer tagging

Layers authored by silence-trim get `tags: ["silence-trim"]` plus an id prefix `clip-trim-<idx>`. Re-running trim:

- **Removes** every layer with `tags` containing `silence-trim` (or with id matching `clip-trim-*` as backup)
- **Writes** fresh layers from the current `cuts.json`

User-authored layers (overlays, captions, intros) are untouched.

## 5. Algorithm

### 5.1 Detection (silencedetect)

```
ffmpeg -i source.<ext> -af silencedetect=noise=-30dB:d=0.35 -f null - 2>&1
```

Defaults (overridable via recipe `silence_policy` or CLI flags):
- `noise=-30dB` — threshold for what counts as silence
- `d=0.35` — minimum silence duration in seconds to register

ffmpeg writes silence boundaries to **stderr** in this format:

```
[silencedetect @ 0x...] silence_start: 1.234
[silencedetect @ 0x...] silence_end: 5.678 | silence_duration: 4.444
```

Parse with a line-by-line regex. Build a list of silence intervals `[(s1_start, s1_end), (s2_start, s2_end), ...]`.

### 5.2 Inversion to speech intervals

Given silence intervals `[(s1_start, s1_end), ..., (sN_start, sN_end)]` and source `duration`:

```
Speech intervals:
  if s1_start > 0: [0, s1_start]
  [s1_end, s2_start]
  [s2_end, s3_start]
  ...
  if sN_end < duration: [sN_end, duration]
```

If a silence interval starts at 0 (silent intro), no leading speech interval; same for trailing.

### 5.3 Initial CutEntry construction

For each speech interval `(speechStart, speechEnd)`:

```typescript
{
  rawStart: speechStart,
  rawEnd: speechEnd,
  paddingPre:  recipe?.silence_policy?.default_padding_pre  ?? 0.08,  // 80ms
  paddingPost: recipe?.silence_policy?.default_padding_post ?? 0.12,  // 120ms
}
```

### 5.4 Overlap resolution (after padding)

If two adjacent cuts' padded spans overlap (`cut[i].end > cut[i+1].start`):

**Rule:** clamp both to the midpoint of the silence between their raw boundaries.

```
silenceMid = (cut[i].rawEnd + cut[i+1].rawStart) / 2
cut[i].paddingPost  = silenceMid - cut[i].rawEnd
cut[i+1].paddingPre = cut[i+1].rawStart - silenceMid
```

Each cut keeps an equal share of the silence between them. No cut "wins."

### 5.5 Boundary clamping

- `cut[0].paddingPre` is clamped so `start >= 0`
- `cut[N-1].paddingPost` is clamped so `end <= duration`
- Done after overlap resolution

### 5.6 Composition write

For each cut in order:

```typescript
{
  id: `clip-trim-${index}`,
  tags: ["silence-trim"],
  visual: {
    type: "video",
    assetId: "src",
    src: manifest.source,
    startFrame: cumulativeStartFrame,
    sourceOffset: effectiveStart,  // floor to nearest frame
    sourceEnd:    effectiveEnd,    // ceil to nearest frame
    playbackRate: 1.0,
    objectFit: "contain",
  },
  frame:  { x: 0, y: 0 },
  bounds: { width: canvas.width, height: canvas.height },
}
```

`cumulativeStartFrame` is the running total: each new clip starts the frame after the previous clip ends, in composition time.

**Sub-frame rounding rule:** `floor(start * fps)` and `ceil(end * fps)` — keep more material on both ends. Matches the principle "don't clip breath."

### 5.7 Re-run with existing cuts

Default behavior (preserve overrides):

1. Read existing `cuts.json`. If empty or missing, behave as fresh run.
2. Run silencedetect anew. Get fresh speech intervals.
3. For each fresh speech interval, look for a matching existing cut where `|rawStart_new - rawStart_old| < 0.5s AND |rawEnd_new - rawEnd_old| < 0.5s`.
4. If a match: keep the existing `paddingPre`/`paddingPost`; overwrite only `rawStart`/`rawEnd`.
5. If no match: create a new cut with default padding.
6. Run overlap resolution + boundary clamping.

The 0.5s tolerance matters because re-detection may shift speech boundaries by a few hundred milliseconds depending on threshold tuning.

`--reset` skips the merge entirely: blow away existing padding, use recipe defaults.

## 6. CLI Surface

### 6.1 `atelier trim`

```
atelier trim <project-dir> [options]

Options:
  --noise <dB>              Silence threshold (default: -30)
  --min-silence <seconds>   Minimum silence duration to trigger cut (default: 0.35)
  --pad-pre <seconds>       Default leading padding (default: 0.08, or recipe)
  --pad-post <seconds>      Default trailing padding (default: 0.12, or recipe)
  --tighten <ms>            Reduce all current padding by N ms (preserves overrides)
  --loosen <ms>             Increase all current padding by N ms (preserves overrides)
  --reset                   Discard existing padding; re-detect from scratch
  --cut <index>             Apply --pad-pre / --pad-post to a single cut only
  --recipe <path>           Read silence_policy from a Studio Recipe YAML
  --dry-run                 Print computed cuts to stdout; don't write files
  --json                    Output cut list as JSON for piping
```

### 6.2 Composed flows

**Fresh detect + apply:**
```
atelier trim my-take/
```

**Re-detect after recording a new take in the same folder:**
```
atelier trim my-take/        # preserves my hand-tuned padding on matching cuts
```

**Globally tighten everything by 50ms:**
```
atelier trim my-take/ --tighten 50
```

**Reset one bad cut's padding:**
```
atelier trim my-take/ --cut 3 --pad-pre 0.08 --pad-post 0.12
```

**Inspect without writing:**
```
atelier trim my-take/ --dry-run --json | jq .
```

### 6.3 Startup probe

On every `atelier trim` invocation, before detection:

```typescript
async function probeSilencedetect(): Promise<void> {
  const { stdout } = await spawnPromise("ffmpeg", ["-filters"]);
  if (!/\bsilencedetect\b/.test(stdout)) {
    throw new Error(
      "Your ffmpeg build lacks the silencedetect filter. " +
      "Install a standard ffmpeg ≥ 4.0 (brew install ffmpeg / apt install ffmpeg).",
    );
  }
}
```

Fail loud, fail early.

## 7. Edge Cases

| Case | Behavior |
|------|----------|
| Source is entirely silent | One cut spanning 0 → duration with zero padding (degenerate but valid) |
| Source has no detected silence | One cut spanning 0 → duration |
| Adjacent cuts overlap after padding | Split at silence midpoint (§5.4) |
| `paddingPre` would make `start < 0` | Clamp to 0 |
| `paddingPost` would make `end > duration` | Clamp to duration |
| Silence shorter than `min-silence` | Not detected — speech remains continuous |
| Fresh detection moves a boundary by > 0.5s | Treated as new cut; existing padding not preserved for that segment |
| User-authored layers (overlays, captions) | Untouched on re-run — only `tags: ["silence-trim"]` layers are rewritten |
| `cuts.json` from format 1.0 (pre-spec) | Migrated on read: stored values become `rawStart`/`rawEnd` with zero padding |
| `--tighten 50` when a cut has 30ms padding | Floor at 0 — never goes negative |
| `--cut` index out of range | Exit 1 with clear message |

## 8. Library Vetting

This spec adds **zero new npm dependencies**. All silence detection is invoked via `node:child_process.spawn`, the same pattern used in `packages/cli/src/commands/render-pipeline.ts`.

### 8.1 ffmpeg silencedetect (system dependency)

| Aspect | Finding |
|--------|---------|
| **Maturity** | `silencedetect` filter has been in ffmpeg since 2.7 (2015). Current option syntax (`noise=<dB>:d=<seconds>`) stable since 4.0 (2018). |
| **Minimum version** | Pin **ffmpeg ≥ 4.0** in error messaging. All standard distro packages (Homebrew, apt, official Windows builds) ship modern versions. |
| **CVEs** | No CVEs affecting the `silencedetect` or null muxer paths. ffmpeg CVEs are concentrated in demuxers (HEVC, MOV, RTP) which we do not invoke here. |
| **License** | ffmpeg is LGPL/GPL depending on build. Atelier shells out via `child_process.spawn` (no linking), so LGPL/GPL terms do not transit to the project. Same model already used for `atelier render`. |
| **Attack surface** | Output parsing is plain text on stderr — regex matching float-formatted numbers. No deserialization, no binary parsing, no exec-with-shell-string. |
| **Filter availability** | Some custom ffmpeg builds disable filters at compile time. Mitigated by the startup probe in §6.3 — fails loud if `silencedetect` is missing. |

### 8.2 npm packages — already in the tree, no changes

| Package | Version | Used for | Notes |
|---------|---------|----------|-------|
| `commander` | ^13.0.0 | CLI argument parsing | Already used by all other subcommands |
| `yaml` | ^2.7.0 | Reading Studio Recipe YAML (optional) | Already used by `atelier studio` for portal/config |
| `zod` | ^3.25.0 | Validating recipe shape via schema package | Already a workspace standard |

No new packages added. No version bumps required for this spec.

### 8.3 Future libraries flagged but **not in scope here**

These will need their own vetting passes when the related tasks land:

- **T-006 transcribe**: Whisper bindings. Candidates: `whisper.cpp` (native), `@xenova/transformers` (ONNX). Vet at adoption.
- **T-008 timeline UI**: waveform rendering. Candidates: `wavesurfer.js`, custom Canvas2D. Vet at adoption.

This spec does not commit to any of those.

## 9. Test Plan

### 9.1 Unit tests (`packages/cli/src/commands/trim.test.ts`)

- silencedetect stderr parsing — given a fixed transcript of ffmpeg output, produce expected silence intervals
- Inversion — silence intervals + duration → speech intervals (incl. silent-intro and silent-outro cases)
- Overlap resolution — two cuts whose padding overlap settle at silence midpoint
- Boundary clamping — leading cut with pre-padding past 0 clamps to 0; trailing cut beyond duration clamps to duration
- `effectiveSpan()` returns the right computed in/out
- Re-run merge — existing cut at `rawStart=2.0` matches a re-detected cut at `rawStart=2.3` (within 0.5s tolerance) and preserves padding
- `--reset` discards padding
- `--tighten 50` reduces every padding by 50ms, floors at 0
- Composition rewrite — fresh layers tagged `silence-trim`; existing user overlay layers untouched
- Format 1.0 → 1.1 migration on read

### 9.2 Integration tests

- Round-trip on a real fixture: 30-second video with three speech segments and two silences. Expected cuts.json structure, expected layer count after composition write
- `--dry-run` produces output without mutating files
- Startup probe fails gracefully when `ffmpeg -filters` lacks silencedetect (mock the spawn)

### 9.3 Manual / dogfood checklist

- Real take of user's UGC: ingest → trim → verify the composition plays the snappy version in studio
- Tighten by 50ms, re-render, listen for clipped breath. Tune the default padding if needed before shipping.
- Re-record the same take, re-run trim, confirm user's per-cut padding tweaks on similar segments are preserved.

## 10. Open Questions

1. **Should `atelier trim` invoke `atelier render` automatically after writing the composition?** Default no — separation keeps it scriptable. A `--render` flag would chain them.
2. **Cut labels on auto-detection** — leave undefined, or auto-label `"speech 1"`, `"speech 2"`? Default undefined; labeling is a manual concern.
3. **Should overlay layers' `startFrame` shift when cuts change?** Default no — overlays are absolute-positioned in comp time. If user wants an overlay anchored to a specific clip, that's a future "anchor to cut" feature.
4. **Should padding be specified in ms in JSON / seconds in TS?** Spec uses seconds everywhere (matches existing CutEntry). CLI accepts seconds for thresholds, ms for tighten/loosen (more intuitive for "nudge").

## 11. Risks

- **silencedetect noise floor mis-tuning**: -30dB is fine for a quiet room, too aggressive for footage with HVAC or street noise. Recipe override is the escape hatch.
- **0.5s match tolerance on re-run**: too tight, every re-record blows away padding; too loose, we preserve padding on the wrong segment. Validate empirically; expose `--match-tolerance` if needed.
- **Layer count explosion**: a 10-minute take with rapid speech could produce 100+ cuts → 100+ VideoVisual layers. Validate that the renderer handles this without frame-drop. Mitigation if needed: collapse very-short adjacent cuts (< 0.5s) by extending the silence threshold.
