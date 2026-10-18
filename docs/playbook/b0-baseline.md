# B0 baseline and the standing calibration process

Status: first baseline run, 2026-10-18. Owner: Loid. Spec: [`calibration.md`](./calibration.md).

This file records what the design-eye benchmark showed the first time it ran, and the process Atelier follows from now on. It holds aggregate numbers only. Item lists, seeds and labels live in the bench, outside every repo (`~/.atelier/bench/design-eye/`), and are never quoted here.

## What was built

- **Bench v1**, frozen 2026-10-18, fingerprint `8d90784ac2bb36d6`: 28 items from surfaces the founder is actively designing (a-constellation, a-flow, Gnomon / Warpline refs), 21 seeded and 7 clean controls including 1 override decoy. 57 certified labels, 42 held-out, at least 3 held-out labels in every space.
- **Two certification rounds.** Round 1 retired the stale a-paradigm platform screens and one decoy; round 2 replaced them with current screens. Gnomon seeds were checked against the founder's recorded decisions first, so most of them could be certified as "breaks a recorded decision".
- **Harness** (`~/.atelier/bench/design-eye/harness/`): pinned hosts built from `git archive` (no repo writes), per-item capture recipes, a local certification page, the scorer.

## B0, pass 1

One isolated evaluator per item ran `atelier design critique quick` with the current skill, `tells.yaml`, Luna and Mika notebooks and model `claude-opus-5-5` (hashes in the run's `config-pass1.yaml`). A blind judge per item matched findings to labels.

| Metric | Result |
|---|---|
| Held-out recall | **0.88** (90% CI 0.80-0.95) |
| Severity-weighted recall | 0.87 (0.78-0.95) |
| Spaces at 1.0 | S1 status, S4 accessibility, S5 language, S7 terminal, T tells |
| Weakest spaces | S2 control and recovery 0.67, S6 agent UX 0.60 (wide intervals) |
| Dev recall | 0.67 (subtle `found` defects missed more often) |
| Override decoy | respected |
| Severity error on matched findings | +0.09 (slight over-rating) |
| Findings with `file:line` | 100% |
| Findings at warn+ per clean control | **6.4** (provisional: not yet adjudicated) |
| Unmatched findings on seeded items | 119 (not yet adjudicated) |

Contamination audit: no evaluator read outside its own input folder.

## What it means

1. **Recall is near its ceiling.** F3 (held-out recall +0.15) cannot pass from 0.88, however good the playbook is. The seeds were too obvious on average.
2. **The open question is precision.** The eye raises many findings on clean screens. Some are real defects the controls still contain, some are invented. Only adjudication tells which, and that is where the playbook is most likely to help.
3. **Irreversible actions are the blind spot.** The held-out misses cluster on ungated irreversible actions and unapproved agent substitutions.

## The process from here (standing)

Founder ruling, 2026-10-18: this is how Atelier's design eye is measured and improved from now on. Passes 2-5 of B0 are deferred until the measurement is revised.

1. **Bench lives outside repos.** Items, seeds and labels stay under `~/.atelier/bench/`. Repos, notebooks, lore and neurons only ever hold aggregates. Claude Code transcripts (`~/.claude/projects`) join the weekly canary scan.
2. **Only current surfaces.** Benches are built from surfaces under active design. Stale surfaces are retired, not certified.
3. **Founder certifies, agents draft.** Certification uses the local page with a stated premise and question per decision. Seeds on surfaces with recorded decisions are pre-checked against those records.
4. **Freeze, then run.** A bench is hashed and made read-only before any scored run. Any change after that is a new version.
5. **Every scored run is isolated and audited.** Opaque input folders, no learning writes, a transcript audit before scoring, a blind judge for matching.
6. **Revise the gates before the next comparison** (approved by the founder 2026-10-18; now in `calibration.md` §2.2 and §4):
   - Make F4 (false alarms do not rise, precision improves) the primary gate.
   - Keep F3 only where there is headroom (S2, S6), or on bench v2 with harder, subtler seeds.
   - Adjudicate unmatched findings with a blind three-judge panel first; the founder confirms the "real" pile, reviews "unsure" and audits a random sample.
   - Before P1: adjudicate B0's unmatched findings with that protocol, so B0 precision exists to compare against.
7. **Then P1.** Apply the approved playbook items (with the E5, E12 and G1 changes), run P1 on the same bench and model, and compare.

## Config changes since B0

| Date | Change | Effect on design-eye runs |
|---|---|---|
| 2026-10-18 | `tells.yaml` 4cb52df1 → f025a9ce: ten motion tells added (scope `content`); `motion-unmotivated` widened to `content` | None for product-UI critiques: every new or widened entry applies only to content scope. Record the new hash in P1's config and note this row. |
