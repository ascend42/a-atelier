# Skill — Resolve an Asset from a Pack

**Owner:** #lux-cinematographer
**Kind:** canonical
**Inputs:** a slot need from the storyboard (category + beat context:
palette, tone, register from merged DESIGN, subject, audio/silence,
adjacent beats), the in-memory pack index from `walk-asset-packs.md`.
**Outputs:** a pack-relative path string Lux drops into STORYBOARD.md
(`pack:<pack-name>/<category>/<file>`) — or, in Explicit mode or
when confidence is split, a category descriptor Lux defers to Iris to
resolve at scaffold time.

## Prompt

> You are Lux. The beat needs an asset of a given category (logo,
> b-roll, grid, transition, etc.). You've already walked the registered
> packs. Match the slot to the best-fitting file by reading each
> pack's `.atelier-pack.yaml` against the beat context. Output a
> pack-relative path you drop into STORYBOARD.md, OR a category
> descriptor if you want Iris to pick at scaffold time.

## Procedure

1. **Gather beat context** from the merged DESIGN and the script beat
   itself:
   - Palette (which colors are dominant in this beat?)
   - Register / tone (from `.atelier-brand.yaml.voice.register`)
   - Subject (what's the beat about?)
   - Adjacency (what came before, what comes next?)
   - Treatment expectations (full-screen reveal? watermark? inline?)

2. **Filter candidate packs by category match.** From your in-memory
   index, narrow to packs that have a category matching the slot need
   (e.g. `category: logo` → packs with a `logos` category key).

3. **Filter by `when` / `when_not` clauses.** For each candidate
   category, check whether the beat context matches its `when` clause
   and is NOT excluded by its `when_not` clause. Example: a `logos`
   category whose `when_not` is "inline with body copy" is wrong for an
   inline overlay beat.

4. **Score by treatment + restrictions compliance.**
   - Treatment match: if the beat needs "dark-bg, monochrome" and the
     category's `treatment` says "monochrome only on photographic
     backgrounds", that's a high-confidence match.
   - Restrictions compliance: cross-check the pack's `restrictions[]`
     against other assets already in the frame. If the pack says
     "never combine logos/ with grids/ in the same frame" and the
     frame already has a grid, exclude logos from this pack.
   - Recency / creator preference: if the creator's notebook records a
     preferred pack for this category, weight it higher.

5. **Pick.** Three outcomes:
   - **One clear winner** (high confidence, single file) → write the
     pack-relative path directly:
     `pack:swiss-grid/logos/primary.svg` (or use the category's
     `primary_file` if specified).
   - **Multiple candidates close in score** → drop a category
     descriptor for Iris to resolve:
     `category: logo, treatment: dark-bg, prefer-pack: swiss-grid`.
   - **No pack satisfies** → don't fabricate. Annotate the beat with
     `> proposed-slot: <slot-name>` and surface to the creator (see
     notebook: `pack-discovery-as-coaching`).

6. **Apply the mode:**
   - **Ambient:** if confidence on the top candidate is above
     threshold, bind silently and move on. Below threshold, drop the
     descriptor form and let Iris/the creator decide.
   - **Explicit:** present the top candidates to the creator and ask
     ("logos: primary.svg from swiss-grid, or mark-only.svg? — both fit
     the `when: full-screen reveal` clause"). Wait for confirmation
     before writing.

## Notes & conventions

- **No MCP tool call.** This procedure is pure filesystem reasoning
  against the sidecars and folder contents you walked in
  `walk-asset-packs.md`. v1's `atelier_mind_map_query` is gone.
- **Output is text, not bytes.** STORYBOARD.md ships pack-relative
  paths or category descriptors. Bytes stay in the pack folder on the
  creator's laptop (TD-271 reframed: pack folder privacy; TD-540
  local-first).
- **Pack-relative path form:** `pack:<pack-name>/<category>/<file>`.
  Iris walks the same sidecars to resolve to an absolute path at
  scaffold time.
- **Category descriptor form:** YAML-ish inline,
  `category: <name>, <key>: <value>, ...`. Common keys: `treatment`,
  `tags`, `prefer-pack`, `duration_s`.

## Failure modes

- **Pack `when_not` matches the beat** → the candidate is out; do not
  override on a hunch. Pick a different candidate or surface the gap.
- **All candidates blocked by restrictions** → the frame is over-
  composed. Revisit the composition (maybe drop the grid so the logo
  can come in) before forcing a binding.
- **Creator's preferred pack is empty in this category** → don't
  silently fall back to a different pack. Surface: "your preferred
  `swiss-grid` has no `b-roll` files — should I pick from
  `street-photo` instead, or is this a gap to fill?"
- **Beat context is too thin to score** → ask Quill to enrich the
  script's `[viz: ...]` cue, or ask the creator for tone/treatment
  hints. Don't guess.
