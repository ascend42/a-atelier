# Skill — Walk Asset Packs (build the pack index)

**Owner:** #lux-cinematographer
**Kind:** canonical
**Inputs:** workspace root (cwd or inferred), `workspace.atelier`
config (for external pack pointers).
**Outputs:** an in-memory mental index of every pack visible to the
active project — categories, when-clauses, treatments, restrictions,
and the actual files on disk. Lux re-runs this at the start of every
storyboard task; she does not cache between sessions.

## Prompt

> You are Lux. Before you can compose, you need to know what's actually
> in the creator's pack library. Walk every registered asset pack and
> build a mental index of categories, intent rules, treatments, and
> available files. Don't trust memory between sessions — the creator
> may have dropped files in or registered new packs since you last
> looked.

## Pack visibility rules (per `_shared/cascade-merge.md`)

A pack is visible to the active project if it lives in any of these
locations:

1. `<workspace-root>/_packs/<pack-name>/` — workspace-tier packs,
   visible to every project.
2. `<workspace-root>/projects/<active>/_packs/<pack-name>/` —
   project-tier packs, visible only to this project. Additive on top of
   workspace packs.
3. External directories (Dropbox, iCloud, local) registered via
   pointers in `<workspace-root>/workspace.atelier`. The pointer
   carries the pack name and absolute path.

Name collisions: project-tier wins over workspace-tier; explicit
register wins over implicit walk.

## Procedure

For each visible pack:

1. **Read the sidecar.** Open `<pack-root>/.atelier-pack.yaml`. If it's
   missing, the folder is not yet a registered pack — surface it as a
   coaching moment ("I see `<dir>` — want me to treat it as a pack?
   Run `atelier pack register <dir>`.").
2. **Parse the schema** (see "Sidecar schema" below). Hold in mind:
   - `name`, `vibe` — pack identity, tone of the contents.
   - `categories.<cat>.when` — when in a beat is this category
     appropriate?
   - `categories.<cat>.when_not` — when is it explicitly wrong?
   - `categories.<cat>.treatment` — how to treat assets from this
     category (monochrome / full color / etc.).
   - `categories.<cat>.primary_file` (optional) — the default pick.
   - `categories.<cat>.duration_s` (optional) — for time-bound
     categories like transitions.
   - `restrictions[]` — cross-cutting rules (e.g. "never combine logos
     with grids in the same frame").
3. **Walk the folder.** List actual files under each category subdir
   (or per category convention if the sidecar doesn't use subdirs).
   What's on disk is the truth; the sidecar describes intent.
4. **Build the index** — a mental map of `pack -> category -> {when,
   when_not, treatment, restrictions, files[]}`. This is what
   `resolve-asset-from-pack.md` consumes.

## Sidecar schema — worked example

The canonical example from `docs/v2-hyperframes-migration.md`:

```yaml
name: swiss-grid
owner: ascend
vibe: editorial, clinical, generous whitespace, primary palette restraint

# Categorization of what's in the folder. Atelier walks the folder to find
# the actual files; this block describes the categories + their intent.
categories:
  logos:
    when: full-screen reveals, watermarks (subtle bottom-right)
    when_not: inline with body copy, on busy backgrounds without scrim
    treatment: monochrome only on photographic backgrounds; full color on solid paper
  grids:
    when: 2-up or 3-up comparison shots, before/after, multi-product hero
    when_not: single-subject focus, motion-heavy shots
    primary_file: 12-col-1080.svg
  transitions:
    when: scene change between distinct beats; never within a beat
    duration_s: 0.4

# Cross-cutting rules that apply to combinations within this pack.
restrictions:
  - never combine logos/ with grids/ in the same frame
  - never apply tint() to product photos in this pack
```

After walking this pack, your index entry should be roughly:

- **swiss-grid** (vibe: editorial / clinical / restraint)
  - **logos** — when: full-screen reveal or watermark; when_not:
    inline / busy bg; treatment: monochrome on photo, full color on
    paper. Files: `primary.svg`, `mark-only.svg`, ...
  - **grids** — when: 2-up/3-up comparisons; when_not: single subject
    or motion-heavy; primary: `12-col-1080.svg`. Files:
    `12-col-1080.svg`, `6-col-1080.svg`, ...
  - **transitions** — when: between beats; duration: 0.4s. Files:
    `swiss-wipe.svg`, ...
  - **restrictions:** no logos + grids in same frame; no tint on
    product photos.

## Notes & conventions

- The folder is the truth. If the sidecar lists a category but no files
  exist, treat the category as empty (and surface the gap if the
  creator's storyboard reaches for it).
- The sidecar's `when` / `when_not` clauses are intent — match them
  against beat context (palette, register, tone, subject) when you run
  `resolve-asset-from-pack.md`.
- External packs (Dropbox/iCloud) work the same way as local
  workspace packs — you walk the folder and read the sidecar. No
  network calls.
- Re-walk per session. Don't trust a cached index — the creator may
  have dropped files in mid-day.

## Failure modes

- **Folder without sidecar** → not a pack yet; surface as coaching
  moment, do not pretend it's registered.
- **Sidecar without folder contents** → category is empty; the
  storyboard cannot ground a slot here. Don't fake it.
- **Restrictions conflict with the merged brand** → brand wins (e.g.
  if the pack says "never tint" but the brand says "always tint product
  photos", the pack is the wrong pack — surface to creator).
- **Two packs claim the same name** → project-tier wins. Note the
  shadowing in your index so you can surface it if the creator asks
  why a workspace pack isn't showing up.
