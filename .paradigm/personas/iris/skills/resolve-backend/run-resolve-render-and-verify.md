# Skill — Render a DaVinci Resolve timeline + verify the output

**Owner:** #iris-composer
**Kind:** experimental (unverified — grounded in source audit, not a live run)
**Inputs:** A finished timeline (cut + captions + overlays + brand look) in
an open Resolve project. A deliverable intent from the brand/creator
(platform + codec, e.g. "1080p H.264 for web", "ProRes master").
**Outputs:** A rendered file at a **project-derived** path under
`projects/<name>/out/`, plus a `verify_output` report confirming it is real
(not a near-empty stub).

## Prompt

> You are Iris, at the publishing-prep moment — the Resolve analog of
> `npx hyperframes render`. Resolve renders by adding a **job** to the
> render queue and starting it, then you must **verify the output file**,
> because Resolve reports `Complete` even on a near-empty render. Use the
> guided `delivery_workflow` path (probe → validate → dry-run set → prepare
> job) so settings are checked before you commit. Surface stderr verbatim
> on any failure; do **not** silent-retry with different flags — that is
> exactly the trap the Hyperframes RENDER-AUDIO-ISSUE taught us.

## The path (guided delivery → render → verify)

`delivery_workflow()` documents the safe live sequence — read it, then:

### 1. Pick the deliverable + preset

```
render_presets(action="list")                         # available presets
delivery_workflow()                                   # read the guided flow + QC spec vocabulary
render(action="get_formats"); render(action="get_codecs", params={ format })
```

Map the brand/creator intent to a named delivery target (the repo ships
targets like ProRes / DNxHR / web H.264/H.265 with QC specs in
`src/utils/delivery_targets.py`). Default for short-form web:
**H.264, 1080p, CRF-equivalent high, project fps** — matches the
Hyperframes default so the two backends are comparable.

### 2. Validate + set render settings (dry-run FIRST)

```
render(action="probe_render_matrix")                  # ⚠ VERIFY exact action name
render(action="validate_render_settings", params={ ... })
render(action="safe_set_render_settings", params={ ..., dry_run: true })   # preview
render(action="safe_set_render_settings", params={ ... })                  # commit
render(action="set_format_and_codec", params={ format, codec })
```

Set the **output path explicitly** and **derive it** —
`projects/<name>/out/<workspace>-<project>-<variant>.mp4`. Create `out/`
first. Never let Resolve default the location, and never render to a path
you didn't construct.

### 3. Add the job + render (foreground — creator is waiting)

```
render(action="add_job", params={ ... target_dir, custom_name, ... })  → { job_id }   # ⚠ VERIFY params
# delivery_workflow's prepare_render_job ADDS but does not START — good.
render(action="start", params={ job_ids: [ job_id ] })
render(action="is_rendering")            # poll
render(action="get_job_status", params={ job_id })   → status
```

Do **not** `project_manager.close` while `is_rendering` is true — it
refuses mid-render anyway (orphans the output).

### 4. VERIFY the output (mandatory — do not skip)

```
render(action="verify_output",
       params={ job_id, expected_duration_seconds: <variant length> })
```

`verify_output` ffprobes the file and cross-checks it against the job's
timeline extent — it catches the "JobStatus says Complete but the file is
near-empty" case. This is Resolve's equivalent of the Hyperframes
"file size suspiciously small" check. Treat `verified:false` as a failure,
surface the report, diagnose — **do not** re-render blindly.

On success, surface **output path + duration + file size** so the creator
knows exactly what was produced and where.

## Optional — offline QC gate

For a real deliverable (not just the eval), `delivery_workflow`'s offline
actions gate quality without Resolve: `deliverable_qc` (ffprobe vs spec),
`loudness_qc` (EBU R128 LUFS/true-peak/LRA), `reframe_blanking_check`.
These are **report-only, never auto-pass** — surface per-field results to
the creator.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `verify_output` → `verified:false`, tiny file | source clip didn't render (missing media, wrong track), or single-frame job | Inspect timeline items; confirm media online; re-check the cut — do not just re-run |
| Render errors with ffmpeg/codec message | codec unavailable in this Resolve edition, or bad preset | Surface verbatim; pick a supported codec via `render.get_codecs` |
| No audio in output | timeline audio track not enabled in preset, or muted | Confirm audio track + preset audio settings; re-render once fixed |
| Captions missing in file but present in edit | soft subs + preset didn't burn/include them | Burn-in or include-subtitle in preset (cf. captions skill) |
| `start` returns but nothing renders | job not added, or another render in progress | `list_jobs`; confirm `job_id`; wait for `is_rendering` false |
| Close refused | render in progress | Expected — wait for completion, don't force |

The first instinct on a render failure is to retry with different flags.
**Resist.** Surface stdout/stderr + the `verify_output` report verbatim,
diagnose, fix the timeline or the preset, then re-render.

## Conventions

- **Always `verify_output`.** A render is not done when Resolve says
  `Complete`; it is done when the file is verified real.
- **Explicit, derived output path** under `projects/<name>/out/`. `out/` is
  never auto-pruned — ask before deleting prior renders.
- **Don't render automatically.** Preview/inspect is the loop; render is
  the creator's commit moment — same discipline as the Hyperframes skill.
- **Compare, don't just ship.** This backend exists to be evaluated against
  Hyperframes — after a successful render, note parity/differences
  (codec quality, caption fidelity, effort, wall-clock) as lore so the
  renderer-slot decision is evidence-based.
