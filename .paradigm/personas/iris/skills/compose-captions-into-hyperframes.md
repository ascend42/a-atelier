# Skill — Compose Captions into Hyperframes HTML

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** `projects/<name>/transcripts/<basename>.json` (already
generated; Iris does not run whisper), merged STORYBOARD.md (for
caption placement overrides + audio holds), merged brand typography
from `.atelier-brand.yaml`.
**Outputs:** One `<div class="clip caption" data-start data-duration>`
per transcript segment, appended into `index.html`'s body, styled from
brand typography vars.

## Prompt

> You are Iris. The transcript exists — whisper ran before you were
> called. Read it from `projects/<name>/transcripts/<basename>.json`
> and emit one caption element per segment. Captions are HTML, not
> some upstream "text visual" — in v2 they are first-class Hyperframes
> clips like everything else.

## Procedure

1. **Locate the transcript.** Default path is
   `projects/<name>/transcripts/<basename>.json` where `<basename>`
   matches the source video's filename without extension. If the
   transcript is missing, STOP and surface — Iris does not invoke
   whisper.
2. **Parse the segments.** Standard shape (from Atelier's transcribe
   pipeline):
   ```json
   {
     "segments": [
       { "start": 0.0, "end": 1.4, "text": "First caption text." },
       ...
     ]
   }
   ```
   `start` and `end` are seconds.
3. **Emit one element per segment.**
   ```html
   <div class="clip caption"
        data-start="<start>"
        data-duration="<end - start>"
        data-track-index="10">Text content here.</div>
   ```
   - `class="clip caption"` — `clip` makes it Hyperframes-managed;
     `caption` triggers the brand-typography styles defined in the
     `<head>`.
   - `data-duration` = `Math.max(0.05, end - start)` — clamp tiny
     segments so Hyperframes doesn't drop them as zero-length.
   - `data-track-index="10"` (or higher) puts captions on top of source
     video + overlay graphics. Higher number = front; clips on the
     same track cannot overlap.
4. **Escape HTML.** Replace `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`
   in segment text. Transcripts rarely contain markup but the cost of
   escaping is zero and the cost of a busted render is real.
5. **Respect audio holds.** If Lux marked `> audio: silence-hold-Ns`
   at a window in STORYBOARD, ensure no caption covers that window
   unless the storyboard explicitly says so. A hold is a deliberate
   beat of silence; covering it with text breaks the beat.
6. **Respect STORYBOARD caption overrides.** If a beat in STORYBOARD
   provides explicit overlay copy that differs from the transcript
   (Lux + Quill may rewrite a line for visual punch), prefer the
   storyboard copy — the markdown trio is source of truth. Transcript
   captions are the default, not the override.

## Notes & conventions

- **Captions are styled via the `<head>` block, not per-element CSS.**
  The `.caption` class in `scaffold-hyperframes-index-html.md`'s base
  styles draws on `--brand-font-display` + `--brand-palette-paper` +
  text-shadow. If the creator wants per-project caption styling, that
  belongs in the project's CSS var overrides — not inline on each
  div.
- **Word-level alignment is out of scope at v0.** Hyperframes
  catalog has kinetic caption components (`caption-kinetic-slam`,
  `caption-pill-karaoke`) that work at word granularity; integrating
  those requires reaching into Hyperframes' catalog blocks per
  STORYBOARD direction. Default Iris emits segment-level only.
- **No silence-trim, no whisper.** Both ran upstream. If a transcript
  doesn't exist for a media file, that's a setup gap — surface it,
  don't generate.

## Failure modes

| Symptom | Cause | Action |
|---|---|---|
| Transcript JSON missing | Whisper hasn't run for this media | STOP; surface — do not run whisper from Iris |
| Segment has `end ≤ start` | Bad transcript data | Skip segment + log; surface count to creator |
| Caption duration < 0.05s | Sub-frame segment | Clamp to 0.05s minimum |
| Transcript text contains HTML markup | Rare, but possible (creator hand-edited) | Escape; never pass through raw |
| Caption overlaps a `silence-hold` window | Storyboard hold conflict | Surface to Lux; do not strip caption or hold |
| Storyboard overlay copy disagrees with transcript | Intentional rewrite by Quill/Lux | Prefer storyboard; markdown trio is source |

## Mode-aware capture

When the creator hand-edits caption text (corrects a whisper error,
shortens a line), treat each edit as signal. Ambient: log silently.
Explicit: ask whether to record the edit pattern (e.g. "creator
consistently breaks lines at ≤6 words") into the brand's caption
guidance.
