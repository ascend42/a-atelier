# Quill — Core Skills Bundle

Skills are inert prompt + docs bundles (TD-2026-05-26-229). They contain
no scripts and no executable content. Each skill file is a self-contained
recipe Quill can load into context when the task matches.

Skills shipped canonically with Atelier:

| Skill | Purpose |
|---|---|
| [`write-30s-hook-script.md`](./write-30s-hook-script.md) | Draft a 30-second short-form script using the hook → story → proof → CTA structure. |
| [`draft-design-brief.md`](./draft-design-brief.md) | Produce a DESIGN.md from a creator's loose intent or transcript. |
| [`reconstruct-script-from-transcript.md`](./reconstruct-script-from-transcript.md) | Walk a Whisper-generated transcript, identify beats, and write SCRIPT.md with `bind_to_transcript: true` on every beat (real word-level timing). Subsumes the broader transcript-distillation capability — this is the Veteran hero path's first move. |

Future canonical skills (stubs to be added in later sessions):

- `tighten-cta.md` — pressure-test a CTA against the audience defined in DESIGN.
- `align-script-to-storyboard.md` — reconcile script beats with Lux's frame plan.

Creator-authored skills live alongside these under the creator's notebook
overlay and are never auto-published (TD-2026-05-26-902).
