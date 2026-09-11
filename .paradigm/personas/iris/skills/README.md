# Iris — Core Skills Bundle (v2)

Skills are inert prompt + docs bundles — no scripts, no executables.
Iris loads them into context when the task matches.

v2.0 (TD-2026-05-28-097) reshapes Iris around Hyperframes. The v1
skills (`apply-recipe-to-document.md`, `run-silence-trim-and-caption.md`)
are removed: there is no live `.atelier` document to mutate, no recipe
engine, and the audio pipeline (silence-trim + whisper) runs upstream
before Iris is invoked.

Skills shipped canonically with Atelier:

| Skill | Purpose |
|---|---|
| [`scaffold-hyperframes-from-storyboard.md`](./scaffold-hyperframes-from-storyboard.md) | **Keystone.** End-to-end procedure: read merged trio → emit `index.html` → symlink assets → compose captions → hand to preview/render. |
| [`scaffold-hyperframes-index-html.md`](./scaffold-hyperframes-index-html.md) | HTML craft reference: head structure, CSS var emission, body templates, the timing-attribute contract Hyperframes enforces. |
| [`run-hyperframes-preview-and-render.md`](./run-hyperframes-preview-and-render.md) | How to invoke `npx hyperframes preview` (backgrounded, hot reload) and `npx hyperframes render` (foreground, MP4 output). Verbatim-stderr discipline on non-zero exits. |
| [`symlink-pack-assets-into-project.md`](./symlink-pack-assets-into-project.md) | For each asset Lux cited, `ln -s` the pack file into `projects/<name>/assets/`. Prune stale symlinks. Never `cp`. |
| [`compose-captions-into-hyperframes.md`](./compose-captions-into-hyperframes.md) | Read the already-generated transcript JSON, emit one `<div class="clip caption">` per segment. Iris does not run whisper. |
| [`merge-brand-and-project-for-composition.md`](./merge-brand-and-project-for-composition.md) | Iris's slice of the cross-cutting cascade protocol (`.paradigm/personas/_shared/cascade-merge.md`) — the two merged inputs she needs to scaffold. |

## Skill loading order

For a typical "compose this project" task, the keystone
(`scaffold-hyperframes-from-storyboard.md`) is the entry point. It
references the others by name; Iris loads them as the procedure
crosses into their concerns.

For an iteration loop ("re-render after I edit STORYBOARD"), the
keystone runs again from the top — re-scaffold is the safe operation.
Hand-edits to `index.html` are diffed and preserved or surfaced before
overwrite.

## Experimental — alternative renderer backends

Atelier feeds a renderer; Hyperframes is the mainline one. Skills for
evaluating **other** backends in the same slot live in subfolders and are
`experimental` (unverified) until a live run promotes them:

- [`resolve-backend/`](./resolve-backend/README.md) — driving **DaVinci
  Resolve** (a timeline NLE) over `davinci-resolve-mcp` as an alternative
  finishing/render backend. Grounded in a source audit, not yet a live run.
  See KB guide `davinci-resolve-mcp — renderer-slot evaluation`.

## Future canonical skills (stubs for later sessions)

- `compose-multi-clip-source-video.md` — sequencing two or more source
  clips when STORYBOARD beats span them. (Currently single-clip only;
  the v1 render fix noted this as v1.1 follow-up.)
- `compose-music-bed.md` — second `<audio>` element with `data-volume`
  for ducking under VO.
- `compose-nested-composition.md` — extracting a recurring shell
  (brand intro/outro) into `compositions/intro.html` referenced via
  `data-composition-src`.

Creator-authored skills overlay as `kind: creator` and are never
auto-published (TD-902).
