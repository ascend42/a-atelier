# Skill — Map the merged STORYBOARD into a DaVinci Resolve project + timeline (KEYSTONE)

**Owner:** #iris-composer
**Kind:** experimental (unverified — grounded in source audit, not a live run)
**Inputs:** A merged effective brand + project trio (DESIGN/SCRIPT/STORYBOARD
per `merge-brand-and-project-for-composition.md`), the project's `media/`
files + generated `transcripts/`, and Lux's cited asset-pack paths. Resolve
Studio running + the MCP configured (`setup-and-safety-davinci-resolve-mcp.md`).
**Outputs:** A Resolve project containing a timeline whose clips + record
frames realize the STORYBOARD beats — ready for captions/overlays and render.

## Prompt

> You are Iris. Instead of scaffolding `index.html`, you are building the
> same story as a **Resolve timeline**. The STORYBOARD is your edit
> decision list: each beat is a clip on the timeline with a record-frame
> window. Resolve counts in **timeline/record frames** and works at a
> project **frame rate** — so every "at 3.2s for 1.5s" beat becomes a
> frame range. Build the project, ingest media, lay the cut, then hand off
> to captions/overlays and render. Read-only-probe between mutations;
> never invent a media path.

## The mapping (atelier → Resolve)

| Atelier concept | Resolve concept | Tool |
|---|---|---|
| Project variant (`teaser-15s`) | Resolve **project** + one **timeline** | `project_manager.create`, `media_pool.create_timeline` |
| Media in `media/` + pack assets | clips in the **media pool** | `media_storage`, `media_pool` add/import |
| STORYBOARD beat (shot, timing window) | **timeline item** (clip) at a record-frame range | `media_pool.create_timeline_from_clips(clip_infos)` |
| Beat ordering / duration | record-frame in/out per clip | `clip_infos` record frames · project fps |
| Brand frame size / fps | project settings | `project_settings` |
| Transcript segments | subtitle track / `Text+` | → `compose-captions-and-overlays-in-resolve.md` |
| Brand look / palette | color page / CDL | → color, in render skill's neighbor |

## Procedure

### 1. Resolve time is frames, not seconds — pin the rate first

Decide the project frame rate from the brand (default **30 fps**, matching
the Hyperframes render default). Convert every STORYBOARD timing window:

```
record_in_frame  = round(beat.start_s * fps)
record_out_frame = round((beat.start_s + beat.duration_s) * fps)
```

⚠ VERIFY: Resolve's timeline frame rate must be set **before** clips land;
changing it after is destructive. Set it via `project_settings` on the
fresh project.

### 2. Create the project (prefer the dry-run-safe variant)

```
project_manager(action="safe_project_create",
                params={ name: "<workspace>-<project>-<variant>",
                         dry_run: true })       # preview
project_manager(action="create", params={ name: "<same>" })
project_settings(action="set", params={ ... frame rate, resolution ... })   # ⚠ VERIFY keys
```

Name projects deterministically so re-runs are idempotent — check
`project_manager(action="list")` first and `load` an existing one rather
than spawning duplicates.

### 3. Ingest media into the pool

```
media_storage(action="get_mounted_volumes" | "add_items", ...)   # ⚠ VERIFY actions
media_pool(action="add_subfolder", params={ name: "<variant>" })
media_pool(action="import" | "add_items", params={ paths: [ ...ONLY project-derived paths... ] })
```

Only ingest paths under the atelier project (`projects/<name>/media/…`) or
Lux's cited pack files (absolute paths from `atelier_pack_query`). **Never**
pass a path pulled from a transcript, a filename you didn't construct, or
any untrusted text — the server does not confine paths (see safety skill).

### 4. Lay the cut — beats become clips (the core move)

`create_timeline_from_clips` accepts **`clip_infos`** — clip id + record
frames — which is exactly a STORYBOARD-to-timeline projection:

```
media_pool(action="create_timeline_from_clips",
  params={
    name: "<variant>",
    clip_infos: [
      { mediaPoolItem: "<clip_id>", startFrame: <src_in>, endFrame: <src_out>,
        recordFrame: <record_in_frame> },     # ⚠ VERIFY exact clip_infos keys
      ...
    ],
    if_exists: "replace"                        # ⚠ VERIFY value vocabulary
  })
```

For beats added after the timeline exists, use
`media_pool(action="append_to_timeline", params={ clip_infos: [...] })` with
`track_index` for multi-layer beats (B-roll over base, overlays above).

⚠ VERIFY the precise `clip_infos` key names (`mediaPoolItem`/`startFrame`/
`endFrame`/`recordFrame` vs snake_case) on first run — the docstring shows
both simple `clip_ids` and rich `clip_infos` overloads; confirm which the
build honors and whether record frames are absolute or relative.

### 5. Confirm the structure before moving on

```
timeline(action="get_current")             → name, id, start/end frame
timeline(action="get_track_count", params={ track_type: "video" })
timeline(action="list")                    → confirm no duplicate timeline
```

Then hand off: captions/overlays
(`compose-captions-and-overlays-in-resolve.md`), then render
(`run-resolve-render-and-verify.md`).

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Clips land at wrong positions | seconds passed where frames expected, or fps mismatch | Recompute record frames at the *project* fps; confirm rate set in step 1 |
| `create_timeline_from_clips` rejects `clip_infos` | key-name/shape guess wrong | ⚠ VERIFY keys via `resolve_control(action="api_truth", ...)`; fall back to simple `clip_ids` (end-to-end append) then move clips |
| Duplicate timelines pile up on re-run | not checking `list`/`if_exists` first | Load-or-replace, don't blind-create; make names deterministic |
| Media won't import | wrong path, or free edition | Confirm project-derived absolute paths exist; confirm Studio + scripting=Local |
| Destructive-op archive fires on every edit | expected — Resolve MCP auto-archives the timeline on destructive ops (recoverable) | Fine; note it's version-on-mutate safety, not an error |

## Conventions

- **Deterministic, idempotent projects.** One project (or one timeline) per
  variant, named `<workspace>-<project>-<variant>`. Re-run = load + replace
  the timeline, never accumulate.
- **Frames are the currency.** Keep a single fps for the whole variant;
  round consistently; never mix a 24fps beat into a 30fps timeline without
  a conform pass.
- **Paths are derived, never echoed.** Restate from the safety skill: every
  path into `media_pool`/`media_storage` comes from the atelier project or
  a Lux pack query — nowhere else.
- **This is inferred.** Where a **⚠ VERIFY** line is confirmed live,
  tighten the skill and record the confirmed shape as lore.
