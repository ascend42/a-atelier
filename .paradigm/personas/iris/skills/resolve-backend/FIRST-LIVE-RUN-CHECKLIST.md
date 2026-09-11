# First Live Run — DaVinci Resolve MCP verification checklist

> Work through this **on the machine with DaVinci Resolve Studio**. It is the
> ordered list of every `⚠ VERIFY` assumption baked into the
> `resolve-backend/` skills (authored from a source audit, never run). Each
> item says **confirm → then do**. When all boxes are checked, the bundle
> promotes `experimental → canonical` — record the run as lore
> (`paradigm_lore_record`) so the confirmed shapes replace the inferred ones.
>
> Legend: `[ ]` todo · fill the blank after `→ CONFIRMED:` with what you
> actually saw, or `→ WRONG:` with the real shape (that's the edit to make).

---

## Phase 0 — Preconditions (do once, before any tool call)

- [ ] **DaVinci Resolve installed + open.** Edition/version decides the path:
      - **Studio** (any recent version) → external scripting works directly. Preferred.
      - **Free ≤ 21.0.x** → works via the in-app bridge (below). Validated on 21.0.3.7.
      - **Free 21.1+** → ❌ STOP: Python scripting removed from free; a fresh
        download today is past this. Get Studio, or source an older ≤21.0.x free build.
      → USING edition + version: `____`
- [ ] **Studio path:** Preferences → System → General → "External scripting
      using" = **Local** (OFF by default). → CONFIRMED exact path this version: `____`
- [ ] **Free path:** `python scripts/install_resolve_bridge.py` → restart Resolve
      → Workspace ▸ Scripts ▸ `resolve_bridge` lists + runs. (macOS: set
      `PYTHON3HOME` via `launchctl setenv`, not `export`.) → CONFIRMED bridge up: `____`
- [ ] Repo cloned **outside** the atelier repo; installed via
      `python install.py` (run `--dry-run` first to preview writes).
- [ ] Update policy is **`prompt` or `never`**, NOT `auto`. → CONFIRMED: `____`
- [ ] `safe_mode` turned **ON**. Set `destructive.safe_mode = true`.
      → CONFIRMED config key + file: `____`
      (skill guessed `destructive.safe_mode` in the server config;
      `src/utils/destructive_hook.py` reads it.)

---

## Phase 1 — Connection probes (read-only, safe to run freely)

Run these and confirm each returns sensibly before ANY mutation.

- [ ] `resolve_is_running()` → true?  → CONFIRMED: `____`
- [ ] `resolve_control(action="is_studio")` → Studio or free? **Sets
      expectations for the whole run** — on free, Neural-Engine/AI/HDR/NR/
      >4K tools will refuse (`success:false`/`capability_gaps`), core
      pipeline still works.  → CONFIRMED edition: `____`
- [ ] `resolve_control(action="get_version")` → version string?
      → CONFIRMED action name (or real one): `____`
- [ ] `project_manager(action="list")` → your projects?  → CONFIRMED: `____`
- [ ] `project_manager(action="get_current")` → what's open?  → CONFIRMED: `____`

If `resolve_is_running` is false with Resolve open → fix Phase-0 scripting
pref, restart Resolve, re-probe.

> Tip: `resolve_control(action="api_truth", ...)` queries the repo's ledger of
> documented API quirks — use it to look up any method's real signature when
> a guess below fails, instead of trial-and-error.

---

## Phase 2 — Project + settings (`map-storyboard` steps 1–2)

- [ ] `project_manager(action="safe_project_create", params={name, dry_run:true})`
      previews without creating?  → CONFIRMED: `____`
- [ ] `project_manager(action="create", params={name})` works.
- [ ] **Frame rate set BEFORE clips land** via `project_settings`.
      → CONFIRMED set action + exact keys (frame rate, resolution): `____`
      ⚠ Changing fps after clips exist is destructive — must be step 1.
- [ ] Pick project fps (default **30** to match Hyperframes). → USING: `____`

---

## Phase 3 — Media ingest (`map-storyboard` step 3)

- [ ] `media_storage` action to list/add media.
      → CONFIRMED actions (`get_mounted_volumes` / `add_items` / real ones): `____`
- [ ] `media_pool(action="add_subfolder", ...)` works.
- [ ] `media_pool` import action.
      → CONFIRMED (`import` / `add_items` / real one) + param key for paths: `____`
- [ ] **Path rule held:** every ingested path is project-derived
      (`projects/<name>/media/…`) or a Lux pack-query absolute path. No path
      from a transcript/filename/web result. (This is the safety invariant —
      the server does NOT confine paths.)

---

## Phase 4 — The keystone: beats → timeline (`map-storyboard` step 4)

This is the highest-value thing to confirm.

- [ ] `media_pool(action="create_timeline_from_clips", params={name, clip_infos:[…]})`
      accepts the rich `clip_infos` shape.
      → CONFIRMED exact key names: `____`
      (skill guessed `mediaPoolItem` / `startFrame` / `endFrame` / `recordFrame` —
      confirm camelCase vs snake_case.)
- [ ] Record frames are **absolute** timeline positions (not relative).
      → CONFIRMED: `____`
- [ ] `if_exists` accepts `"replace"` (idempotent re-runs).
      → CONFIRMED value vocabulary: `____`
- [ ] `media_pool(action="append_to_timeline", params={clip_infos:[…]})` with
      `track_index` places beats on the right track.  → CONFIRMED: `____`
- [ ] Verify: `timeline(action="get_current")` + `get_track_count` show the
      beats landed at the right record frames (spot-check one beat's
      `round(start_s*fps)`).  → CONFIRMED positions correct: `____`

**If `clip_infos` is rejected:** fall back to simple
`create_timeline_from_clips(clip_ids)` (end-to-end append) + `move_clips`,
and note the real `clip_infos` contract here for the skill fix.

---

## Phase 5 — Captions + overlays (`compose-captions` skill)

- [ ] Subtitle track add action.
      → CONFIRMED (`add_track` w/ `track_type:"subtitle"` / real one): `____`
- [ ] Per-cue OR bulk subtitle creation from transcript/SRT.
      → CONFIRMED action (`add_subtitle` / `create_subtitles_from_transcript` /
      SRT-import) + whether bulk import exists: `____`
- [ ] Where subtitle **style** lives (item / track / project setting).
      → CONFIRMED: `____`
- [ ] (If brand needs styled titles) Fusion `Text+` via
      `fusion_comp(action="safe_add_tool", params={tool:…})`.
      → CONFIRMED tool id (`TextPlus`? real one): `____`
- [ ] (Optional brand look) `timeline_item_color` CDL apply.
      → CONFIRMED action + params shape: `____`

---

## Phase 6 — Render + verify (`run-resolve-render-and-verify` skill)

- [ ] `render_presets(action="list")` shows presets.
- [ ] `render(action="probe_render_matrix")` OR the real probe action.
      → CONFIRMED action name: `____`
- [ ] `render(action="safe_set_render_settings", params={…, dry_run:true})`
      previews, then commits without dry_run.  → CONFIRMED: `____`
- [ ] Output path set **explicitly + derived** →
      `projects/<name>/out/<workspace>-<project>-<variant>.mp4` (mkdir `out/` first).
- [ ] `render(action="add_job", params={…})` returns a `job_id`.
      → CONFIRMED param keys (`target_dir` / `custom_name` / real ones): `____`
- [ ] `render(action="start", params={job_ids:[…]})` → renders.
- [ ] `render(action="is_rendering")` / `get_job_status(job_id)` poll works.
- [ ] **`render(action="verify_output", params={job_id, expected_duration_seconds})`
      → `verified:true`.** (Mandatory — Resolve says `Complete` on near-empty
      files.)  → CONFIRMED file real (path/duration/size): `____`

---

## Phase 7 — Close the loop

- [ ] For each `→ CONFIRMED`/`→ WRONG` above, **edit the matching skill**:
      replace the `⚠ VERIFY` line with the real shape; flip `Kind:` from
      `experimental` → `canonical` on skills fully confirmed.
- [ ] **Record lore** (`paradigm_lore_record`, type `agent-session`): the
      real command shapes, any failure modes hit, and — importantly —
      **Resolve-vs-Hyperframes parity notes** (codec quality, caption
      fidelity, effort, wall-clock). That evidence is the whole point of the
      renderer-slot evaluation.
- [ ] If forking: log the two priority hardening items as tasks —
      (1) path-root confinement for agent-supplied paths, (2) `safe_mode`
      default-on.

---

*Origin: audit + skills authored 2026-09-11 (lore `L-2026-09-11-ascend-102819-001`,
decision `TD-2026-09-11-136`). This checklist IS the promotion gate.*
