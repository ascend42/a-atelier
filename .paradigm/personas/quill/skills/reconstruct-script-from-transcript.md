# Skill — Reconstruct SCRIPT.md from a Transcript

**Owner:** #quill-showrunner
**Kind:** canonical
**Inputs:** A Whisper-generated transcript JSON in the active project — typically
`projects/<name>/transcripts/<name>.json` (the shape `atelier transcribe`
writes). Optional existing `projects/<name>/SCRIPT.md` whose creator-edited
fields should be preserved where they don't conflict with what the transcript
actually says. The merged brand voice (`_brand/SCRIPT.md` +
`_brand/.atelier-brand.yaml`) for voice rules and "we never CTA"-style
preferences.
**Outputs:** `projects/<name>/SCRIPT.md` (mode: `narrated`) whose beats anchor
to the transcript's real word boundaries — every beat carries
`bind_to_transcript: true` because real word-level timing is known.

This skill is the **Veteran hero path's** first move: a creator who already has
a voice records the clip in one take, runs `atelier transcribe`, and asks Quill
to back-fill the SCRIPT from what was actually said. We are documenting the
performance, not improving it.

## Prompt

> You are Quill. The creator recorded a video and ran `atelier transcribe`. A
> transcript JSON now exists at `projects/<name>/transcripts/<name>.json` with
> word-level timestamps. Your job: reconstruct
> `projects/<name>/SCRIPT.md` as it was actually delivered, with beats
> anchored to real word timing.
>
> Procedure:
>
> 1. **Read the transcript.** Walk through the word-level entries. Note natural
>    pauses (gaps > ~600ms between words), shifts in pacing/energy, and
>    complete thoughts. Take the transcript's word timing *verbatim* — do not
>    round, smooth, or estimate.
>
> 2. **Identify beat boundaries.** Group consecutive words into beats.
>    Boundaries fall at natural pauses, complete sentences, or where the
>    creator changes topic. Aim for 3–7 beats for a 30–90s clip; longer clips
>    get more. If a stretch is genuinely unbroken with no clear boundary —
>    long mid-sentence runs, intentional dramatic pauses, run-on energy — ask
>    the creator before splitting arbitrarily.
>
> 3. **Infer the hook / story / proof / CTA structure.** The opener becomes
>    the hook (first 2–5s typically). The body that sets up the point is the
>    story. The evidence or punchline is the proof. The wrap-up — if the
>    creator made one — is the CTA. **Not every freestyle clip has all four.**
>    Mark explicitly any block the creator did not deliver, e.g.
>    `> note: no CTA beat — creator did not call to action`. If the creator's
>    voice notebook says they don't follow hook→story→proof→CTA, respect that
>    — write the beats they actually delivered without forcing structure.
>
> 4. **Write `projects/<name>/SCRIPT.md`.** YAML frontmatter: `mode: narrated`,
>    `target_duration_s` equal to the transcript's total span (last word `end`
>    minus first word `start`), `language` from the transcript metadata,
>    `tts_voice` **omitted** (the creator delivered it themselves; no TTS
>    voice slot to reference). Each beat:
>    - `id`: kebab-case (`hook-1`, `story-1`, `proof-1`, `cta-1`, …).
>    - `copy`: the exact words from the transcript for this beat span, with
>      `um` / `uh` / obvious false-starts removed only if obvious. Do not
>      paraphrase or polish. This is documenting what was said, not improving
>      it.
>    - `intent`: one sentence inferred from context — *why* this beat exists
>      in the arc.
>    - `est_duration_s`: the actual transcript span (last word's `end` minus
>      first word's `start` for the beat). Real timing, not text-derived.
>    - `bind_to_transcript: true` — always, since real timing is known.
>
> 5. **Preserve creator edits if SCRIPT.md already exists.** If a beat in the
>    existing `projects/<name>/SCRIPT.md` has a hand-edited `intent` (or notes
>    the creator added) that does NOT conflict with the transcript reality,
>    keep it. Note which beats you rewrote vs preserved in a closing
>    `> reconstructed: <ISO date>` comment block at the end of the file.
>
> Surface a one-line summary at the end of the reconstruction:
> `Reconstructed <N> beats from <M> words over <T> seconds. Hook/Story/Proof/CTA detected: yes/yes/yes/no` etc.

## Notes & conventions

- The output path is **always** `projects/<name>/SCRIPT.md`. A reconstructed
  performance is project-specific by definition — it documents one recording,
  not the brand. Never write the reconstruction to `_brand/SCRIPT.md`.
- Use the transcript's word timing **verbatim**. Don't round to half-seconds,
  don't average across beats, don't estimate.
- The transcript shape on disk: `segments[*].words[*]` with
  `{ detected, text, start, end, ... }`. Walk the flattened word list (or
  segments — they correspond to natural pauses already).
- `bind_to_transcript: true` on every beat — that's the whole point of this
  skill. Real timing is known; SCRIPT.md is the documentation layer.
- Respect the merged brand voice — read `_brand/SCRIPT.md` and
  `_brand/.atelier-brand.yaml` first for voice rules, banned phrases, "we
  never CTA" preferences. The brand floor beats structural assumptions.
- If the transcript reveals a recurring phrasing the creator favors —
  signature sign-off, opener cadence, distinctive contractions — surface it
  as a candidate `_brand/.atelier-brand.yaml.voice.exemplars` addition.
  Don't auto-promote.

## Failure modes to watch

- **Over-polishing the transcript copy.** This is documentation, not
  screenwriting. If the creator said "kind of, sort of," the script says "kind
  of, sort of." Filler words go only when they are unambiguous filler.
- **Inventing beats the creator didn't say.** The classic is **CTA
  hallucination** — writing "follow for more" into a `cta-1` that has zero
  transcript backing. If the creator didn't call to action, there is no CTA
  beat. Say so.
- **Forcing hook→story→proof→CTA onto a freestyle clip.** Not every clip is
  an essay. If the creator delivered a monologue with no proof and no CTA,
  write `hook-1` through `hook-3` (or just numbered beats) and annotate the
  absence — don't fabricate structure.
- **Ignoring long pauses that were intentional.** A 1.2s gap mid-sentence is
  a dramatic beat, not a beat boundary; the creator chose silence. Use
  pacing/energy shifts, not just gap-thresholds, to find real boundaries.
- **Rounding the timing.** `est_duration_s: 3.0` when the real span is 2.87s
  is a small lie that compounds across beats. Carry the precision the
  transcript carries.
- **Writing the reconstruction to `_brand/SCRIPT.md`.** Recordings are
  project-tier artifacts. Brand SCRIPT.md is voice exemplars + do/don't, not
  episode transcripts.
