# v1 Publish Readiness

> **Status:** prep-only — this is the checklist + command sequence for shipping v1 once the studio-UI bundle lands and end-to-end validation passes. v1 publish is explicitly gated per `L-2026-05-27-ascend-180956-001`.

## Pre-publish gate (all must pass)

- [ ] **Studio-UI bundle delegation completed cleanly** — `a9a7338901aeb98a0` (the workspace-aware UI + drag-drop ingest + whisper auto-resolve bundle). Verify: new files exist (workspace-sidebar, media-preview, markdown-view, transcript-viewer, drop-zone), backend endpoints registered, tests passing across the workspace, compliance clean.
- [ ] **End-to-end creator flow validated by owner:**
  - [ ] Open `atelier studio` at workspace level → workspace tree renders with projects/media/transcripts/artifacts
  - [ ] Drag video file onto studio → progress feedback (uploading → audio-extract → transcribing → composing) → canvas plays the clip with captions appearing on their word boundaries
  - [ ] Click a different project in sidebar → workspace active.yaml updates → that project's canvas loads
  - [ ] Click an artifact (DESIGN/SCRIPT/STORYBOARD) → markdown viewer shows it
  - [ ] Click a media file → preview plays / shows
  - [ ] In Claude Code, `@atelier-quill draft a clip about X` → she authors DESIGN/SCRIPT into the active project → studio reflects the file changes
  - [ ] `@atelier-iris build it` → canvas mutates in real time via WS bridge
- [ ] **Workspace tests green** — `pnpm -r test` across all 12 packages
- [ ] **Compliance clean** — `paradigm compliance-check` reports 0 violations
- [ ] **No half-committed state** — `git status` is empty (or only contains intentional unstaged paradigm state churn)
- [ ] **CHANGELOG [Unreleased] section is complete** — covers everything shipped in the v1 arc

## Version policy

Looking at the package layout:

| Package | Current | Target |
|---|---|---|
| `@a-company/atelier` (CLI) | 0.37.0 | **1.0.0** |
| `@a-company/atelier-mcp` | 0.27.2 | **1.0.0** |
| `@a-company/atelier-studio` | 0.28.0 | **1.0.0** |
| `@a-company/atelier-schema` | 0.28.0 | **1.0.0** |
| `@a-company/atelier-types` | 0.31.0 | **1.0.0** |
| `@a-company/atelier-core` | (TBD) | **1.0.0** |
| `@a-company/atelier-canvas` | (TBD) | **1.0.0** |
| `@a-company/atelier-video` | 0.1.0 | **1.0.0** |
| `@a-company/atelier-svg` | (TBD) | **1.0.0** |
| `@a-company/atelier-lottie` | (TBD) | **1.0.0** |
| `@a-company/atelier-react` | (TBD) | **1.0.0** |
| `@a-company/atelier-math` | (TBD) | **1.0.0** |

**Decision: lockstep 1.0.0 across the workspace.** Justification: this is the v1 milestone of the framework — every package moves to v1 together, signals coherent stability. Internal cross-deps already pin specific versions; bumping all in lockstep avoids resolution mismatches at install.

## CHANGELOG migration

Current `[Unreleased]` heading → `[1.0.0] — YYYY-MM-DD` (insert real date at publish time). Add a v1 introduction paragraph at the top of the section:

```markdown
## [1.0.0] — YYYY-MM-DD

**Atelier v1.** A creator framework where one drag-and-drop of a video into the
studio produces a transcribed, captioned, agent-orchestrated composition —
locally, freely, open-source. Three Paradigm-native agents (Quill the
Showrunner, Lux the Cinematographer, Iris the Composer) author DESIGN /
SCRIPT / STORYBOARD artifacts and compose the live document while the
creator watches. nevr.land hosts inert shared artifacts (skills, recipes,
asset packs); no hosted Studio, no subscriptions, no online dependencies in
the default path.

(rest of [Unreleased] content moves here verbatim)
```

## Publish command sequence

Run from repo root, on a clean working tree at the v1 commit:

```bash
# 1. confirm everything is green
pnpm -r test
paradigm compliance-check

# 2. bump versions across the workspace
# Either via pnpm or by editing package.json files directly.
# pnpm offers `pnpm -r exec npm version major` but won't update internal cross-refs
# correctly. Recommended: a single shared bump via the bump-helper script if it
# exists, otherwise hand-edit each package.json + pnpm-workspace.yaml workspace
# protocol references stay as `workspace:*`.

# 3. rebuild everything from clean
pnpm -r build

# 4. dry-run the publish to verify the tarball contents
pnpm -r publish --dry-run --access public --no-git-checks

# 5. publish for real (topological order — pnpm -r handles this if interdependencies
#    are declared via workspace protocol)
pnpm -r publish --access public --no-git-checks

# 6. tag and push
git tag v1.0.0
git push origin v1.0.0
git push origin feat/creator-flow-v1-prep  # or main, after PR merge

# 7. create GitHub release with the CHANGELOG entry as body
gh release create v1.0.0 --title "Atelier v1.0.0" --notes-from-tag
```

## Plugin update (external repo)

The Claude Code plugin `ascend42/a-atelier-plugin` may pin a specific `@a-company/atelier-mcp` version. Once v1 is published to npm, bump that pin and republish the plugin so users get the v1 surface.

## Post-publish verification

```bash
# fresh install verification
mkdir -p /tmp/atelier-v1-check && cd /tmp/atelier-v1-check
npm install -g @a-company/atelier@1.0.0
atelier --version    # should report 1.0.0
atelier --help       # should include init, studio (context-aware), artifacts, media, reconstruct, transcribe

# fresh creator workspace
mkdir test-workspace && cd test-workspace
atelier studio --new --mode explicit
# → should print the augmentation success lines if paradigm is installed,
#   or just the vanilla workspace creation lines if not
```

## What's NOT in v1 (explicitly deferred)

These were named in the consolidated roadmap as post-v1 work:

- **Full mind-map** with semantic search, SQLite-backed index, ingestion beyond the per-project stub (Phase 4 expansion)
- **Generation seam wrapped provider** — the seam interface lands as part of normal pipeline calls but the actual wrapped MCP tool that auto-generates images is deferred (TD-2026-05-26-088)
- **Style extraction (Imitator hero path)** — Phase 7
- **Headless MCP video export** — browser-only video export is sufficient for v1
- **Cross-machine asset portability + asset-pack publishing on nevr.land** — Phase 6, hosted sharing surface
- **Studio drag-drop polish features** — collaboration cursors, multi-doc editing, etc.

These are roadmap items for v1.1+, tracked via the consolidated roadmap and lore.

## Next session pickup

If a fresh session picks up post-publish:

1. `paradigm session_recover` (or session-checkpoint) — load this checkpoint
2. Read `docs/keynote/paradigm/atelier-creator-roadmap.md` for the post-v1 sequence
3. The roadmap's "Later / explicitly deferred" table names the unlock triggers for each post-v1 item

---

*Authored 2026-05-27 as prep while the studio-UI bundle compiles in the background. References: TD-2026-05-26-* through TD-2026-05-27-723, lore L-2026-05-27-ascend-180956-001 (v1 gating decision).*
