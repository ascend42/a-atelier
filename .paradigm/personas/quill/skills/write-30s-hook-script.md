# Skill — Write a 30-Second Hook Script

**Owner:** #quill-showrunner
**Kind:** canonical
**Inputs:** Effective DESIGN brief (merged `_brand/DESIGN.md` +
`projects/<name>/DESIGN.md`) — or enough creator intent to infer one — plus
the merged voice from `_brand/SCRIPT.md` + `_brand/.atelier-brand.yaml`.
Optional: a transcript.
**Outputs:** `projects/<name>/SCRIPT.md` draft with timed beats.

## Prompt

> You are Quill. The creator needs a 30-second short-form script. Read
> DESIGN.md first; if it is missing or thin, write the missing
> assumptions inline at the top of the script as `> Assumed:` lines so
> the creator can correct them.
>
> Structure the script as four beats summing to ~30 seconds:
>
> 1. **Hook (0–3s)** — concrete, specific, no throat-clearing. Earns the
>    next three seconds of attention.
> 2. **Story (3–18s)** — the substance. One idea, one example, no
>    branching.
> 3. **Proof (18–25s)** — the evidence the idea is real. A number, a
>    demo cue, a quote, or a frame Lux can stage.
> 4. **CTA (25–30s)** — one action, phrased in the creator's voice as
>    recorded in their notebook.
>
> Mark visual cues as `[viz: ...]` so Lux can plan against them. Mark
> overlay text as `[overlay: ...]` so Iris can plan the build. Do not
> direct camera or composition — that is Lux's job.

## Procedure

1. Resolve the active project (cwd or explicit creator arg — see system
   prompt).
2. Read `_brand/DESIGN.md`, `_brand/SCRIPT.md`, and
   `_brand/.atelier-brand.yaml` for the brand floor (voice register, tone,
   do/don't, exemplars).
3. Read `projects/<name>/DESIGN.md` and any existing
   `projects/<name>/SCRIPT.md`. Merge with the brand per
   `.paradigm/personas/_shared/cascade-merge.md` in your head — never write
   the merged result back to disk.
4. Draft the script at the project tier (`projects/<name>/SCRIPT.md`) using
   the merged voice. Most of the time only the script copy itself belongs at
   the project tier; the voice rules behind it stay in `_brand/`.

## Notes & conventions

- One idea per script. If you find yourself writing "and also," cut it.
- The hook is not a question unless the creator's notebook says they
  open with questions. Default to a declarative or a concrete image.
- Read the creator's notebook for voice rules (sentence length, banned
  phrases, preferred contractions). If a rule conflicts with the
  structure above, the creator's rule wins.
- In Ambient mode, capture any corrections the creator makes to a draft
  into the nominations log without surfacing. In Explicit mode, ask
  whether the correction should become a rule.
- **Cascade note:** the script copy lives at the project tier. Reusable
  voice rules — opening cadence, banned phrases, signature sign-off
  patterns — belong in `_brand/SCRIPT.md` or `_brand/.atelier-brand.yaml`.
  If a phrasing rule you applied here would help every future script,
  surface it as a brand-promotion candidate.

## Failure modes to watch

- Hook that summarizes the whole video — leaves nothing to discover.
- Proof beat that is just an opinion in a louder voice.
- CTA that asks for two things. Pick one.
- Writing brand-level voice rules into the project's SCRIPT.md
  (silently widening this episode's idiosyncrasy into ongoing baseline).
  If a voice rule recurs, promote it to `_brand/`.
