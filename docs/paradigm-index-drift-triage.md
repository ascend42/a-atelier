# Paradigm Index Drift — Triage Document

> **Status:** Open for triage
> **Origin:** Atelier project, Milestone 2 implementation
> **Date:** 2026-02-14
> **Reporter:** Claude Opus (builder session)
> **For:** Separate Opus instance to triage and propose fixes

---

## What Happened

During the Atelier project build (an AI-native animation engine using Paradigm for structured development), we completed Milestones 0-2 across 4 commits:

| Commit | Milestone | What |
|--------|-----------|------|
| `9096d69` | M0: Scaffold | Monorepo setup, all package stubs |
| `cde5cf9` | M1: Format Spec | types (44 types), math (easing/spring/lerp), schema (Zod + YAML) |
| `ea19bb9` | M2: Engine | core (resolveFrame, builder, overlap validation) |
| `9428e47` | Fix | Manual rebuild of scan-index.json and navigator.yaml |

At each milestone, the builder agent:
- Created/updated `.purpose` files in each package (the source of truth for symbols)
- Called `paradigm_history_record` to log the implementation
- Called `paradigm_wisdom_record` for architectural decisions

**What was missed** (caught by the human after M2):
- `scan-index.json` was never rebuilt — still had the empty initial scaffold state
- `navigator.yaml` was never rebuilt — still had empty structure/symbols maps
- `paradigm_history_validate` was not called after M1 or M2
- `paradigm_pm_postflight` was run but its output was full of false positives, so its results were effectively ignored

The human had to prompt the agent to check whether paradigm files were properly updated. The agent then had to manually rewrite `scan-index.json` (282 lines) and `navigator.yaml` (91 lines) by hand.

---

## The Issues

### 1. Scan Index is a Manually-Maintained Derived Artifact

**Current state:** `.purpose` files are the source of truth for symbol definitions. But `scan-index.json` and `navigator.yaml` are separate files that must be independently maintained. Nothing auto-generates them from `.purpose` files.

**The `paradigm scan auto` CLI** only performs code analysis (detecting patterns in source files). It does NOT parse `.purpose` files to rebuild the index. Running it on the Atelier project returned "No symbols detected" despite 32 symbols being defined across 5 `.purpose` files.

**Impact:** The index will always drift from the source of truth unless someone remembers to manually update it. In this case, the agent wrote correct `.purpose` files at every milestone but the index was stale for the entire session.

### 2. Postflight Validates Against the Stale Index

**Current behavior:** `paradigm_pm_postflight` checks whether touched symbols are "registered" — but it checks `scan-index.json`, not the actual `.purpose` files.

**Result:** Every postflight run returned "unregistered-symbol" errors for symbols that WERE registered in `.purpose` files, because the index hadn't been rebuilt. Example output:

```
"Symbol \"#frame-resolver\" is not registered in any .purpose file"
```

But `#frame-resolver` IS defined in `packages/core/.purpose`. The postflight was lying.

**Impact:** The agent learns to ignore postflight output because it's unreliable. False positives erode trust in the compliance check, which defeats its purpose.

### 3. Conceptual Gates Trigger Portal.yaml Warnings

**Current behavior:** Postflight flags any `^gate` symbol as requiring a `portal.yaml` entry.

**But:** Not all gates are HTTP auth gates. In Atelier, `^no-overlap` and `^valid-document` are conceptual validation gates — they represent invariants enforced in code, not route-level authorization. The project explicitly decided that `portal.yaml` is not needed for v1 (no HTTP API, runs locally).

**Impact:** More false positives. The agent sees "missing-portal-gate" errors for gates that intentionally don't belong in portal.yaml.

### 4. No Enforcement Mechanism

The entire paradigm compliance workflow depends on the AI agent voluntarily running the right tools in the right order. The CLAUDE.md checklist says:

> **After completing each milestone:**
> 1. Update/create `.purpose` files
> 2. `paradigm_history_record`
> 3. `paradigm_history_validate` after tests pass
> 4. `paradigm_pm_postflight`
> 5. Record antipatterns via `paradigm_wisdom_record`

But there's no automated enforcement:
- No pre-commit hook that runs postflight
- No CI step that validates index freshness
- No MCP tool that auto-rebuilds the index
- No warning when `.purpose` files are newer than `scan-index.json`

The agent did steps 1-2 and skipped 3-5 without anything catching it until the human asked.

### 5. No `reindex` Command Exists

There is no:
- `paradigm reindex` (rebuild scan-index.json from .purpose files)
- `paradigm scan reindex` (same)
- MCP tool `paradigm_reindex` (same)

The only way to update the index is to manually rewrite the JSON/YAML files, which is error-prone and token-expensive.

---

## Proposed Solutions

### Tier 1: Quick Process Fix (agent-side)

Add a pre-commit checklist to the agent's memory so it never skips paradigm steps. This is a band-aid — it doesn't fix the framework, but it prevents the immediate failure mode.

### Tier 2: Add `paradigm reindex` Command

Create a CLI command (and matching MCP tool) that:
1. Finds all `.purpose` files in the project
2. Parses them (they're YAML)
3. Extracts all components, flows, gates, signals, aspects
4. Writes a fresh `scan-index.json`
5. Writes a fresh `navigator.yaml`

This eliminates the manual maintenance burden entirely. The index becomes a generated artifact that can be rebuilt at any time.

### Tier 3: Make Postflight Read `.purpose` Files Directly

Instead of checking `scan-index.json`, have `paradigm_pm_postflight`:
1. Read all `.purpose` files in the project
2. Build an in-memory symbol registry
3. Validate touched symbols against that registry

This eliminates the false positive problem entirely. The postflight becomes reliable regardless of index state.

### Tier 4: Distinguish Gate Types

Add a concept of gate scope/type so that:
- `^authenticated` (scope: "route") → requires portal.yaml
- `^no-overlap` (scope: "validation") → does NOT require portal.yaml

The `.purpose` file could specify this: `gates: { ^no-overlap: { scope: validation } }`. Postflight would only flag route-scoped gates for portal.yaml registration.

### Tier 5: Automated Enforcement

- **Pre-commit hook:** Runs `paradigm reindex` (Tier 2) automatically before every commit
- **Freshness check:** MCP tool that compares `.purpose` file mtimes against `scan-index.json` mtime and warns if stale
- **CI validation:** GitHub Action that runs postflight and fails the build on real violations

---

## Questions for Triage

1. **Is the scan index even necessary?** If MCP tools and postflight read `.purpose` files directly, does the index serve any purpose beyond caching/performance?
2. **Should the index be `.gitignore`d?** If it's a generated artifact, it arguably shouldn't be committed — just regenerated on demand.
3. **What's the right scope for gates?** Is "route vs validation" the right distinction, or should it be more granular?
4. **Should paradigm steps be blocking?** Should the MCP server refuse to let an agent proceed to the next milestone without completing paradigm compliance?
5. **Is this a Paradigm framework issue or an Atelier-specific issue?** Would other Paradigm projects hit the same problem, or is this unique to monorepos with many packages?

---

## Files Referenced

| File | Role |
|------|------|
| `.paradigm/scan-index.json` | Symbol index (the stale artifact) |
| `.paradigm/navigator.yaml` | Structure map (also stale) |
| `.purpose` | Root project symbols |
| `packages/types/.purpose` | Types package symbols |
| `packages/math/.purpose` | Math package symbols |
| `packages/schema/.purpose` | Schema package symbols |
| `packages/core/.purpose` | Core package symbols |
| `.paradigm/config.yaml` | Project configuration |
| `CLAUDE.md` | Agent instructions (includes milestone checklist) |
