# Iris — Core Skills Bundle

Skills are inert prompt + docs bundles (TD-2026-05-26-229) — no scripts,
no executables. Iris loads these into context when the task matches.

Skills shipped canonically with Atelier:

| Skill | Purpose |
|---|---|
| [`apply-recipe-to-document.md`](./apply-recipe-to-document.md) | Apply a creator recipe (style-as-preset) to the live AtelierDocument, binding asset slots locally. |
| [`run-silence-trim-and-caption.md`](./run-silence-trim-and-caption.md) | Run the silence-trim / transcribe / caption pipeline against the active document. |

Future canonical skills (stubs for later sessions):

- `place-audio-bed.md` — pick and place an audio bed under the script's beats.
- `branch-iteration.md` — branch iteration history for an experimental cut.
- `rollback-safely.md` — roll back without losing creator-edited content.

Creator-authored skills overlay as `kind: creator` and are never
auto-published (TD-2026-05-26-902).
