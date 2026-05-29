# Quill — Core Skills Bundle (v2)

Skills are inert prompt + docs bundles (TD-2026-05-26-229). They contain
no scripts and no executable content. Each skill file is a self-contained
recipe Quill can load into context when the task matches.

Quill is filesystem-only in v2 — she reads and writes markdown + YAML with
normal file tools. The brand cascade (`_brand/` + `projects/<name>/`)
protocol shared with Lux and Iris lives at
[`.paradigm/personas/_shared/cascade-merge.md`](../../_shared/cascade-merge.md).

Skills shipped canonically with Atelier:

| Skill | Purpose |
|---|---|
| [`draft-design-brief.md`](./draft-design-brief.md) | Produce a DESIGN.md at the right tier (workspace `_brand/` or `projects/<name>/`) from a creator's loose intent or transcript. |
| [`write-30s-hook-script.md`](./write-30s-hook-script.md) | Draft a 30-second short-form script at the project tier (`projects/<name>/SCRIPT.md`) using the merged brand voice, hook → story → proof → CTA. |
| [`reconstruct-script-from-transcript.md`](./reconstruct-script-from-transcript.md) | Walk a Whisper-generated transcript (`segments[*].words[*]`), identify beats, and write `projects/<name>/SCRIPT.md` with `bind_to_transcript: true` on every beat. The Veteran hero path's first move. |
| [`merge-brand-and-project-artifacts.md`](./merge-brand-and-project-artifacts.md) | Quill's in-head cascade merge — workspace `_brand/<artifact>` + `projects/<name>/<artifact>` → effective brand for this task. References the shared protocol; worked example for SCRIPT.md. |

Future canonical skills (stubs to be added in later sessions):

- `tighten-cta.md` — pressure-test a CTA against the audience defined in DESIGN.
- `align-script-to-storyboard.md` — reconcile script beats with Lux's frame plan.
- `promote-to-brand.md` — surface project content that recurs and promote it to `_brand/` with creator confirmation.

Creator-authored skills live alongside these under the creator's notebook
overlay and are never auto-published (TD-2026-05-26-902).
