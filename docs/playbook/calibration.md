# Calibration: making the design eye measurable

Owner: Loid (learning loop). Companions: `rules.yaml` and `PLAYBOOK.md` (Luna), `tells.yaml` (in the atelier-design skill, `reference/tells.yaml`).

The playbook claims the agents' eye gets better. This file says how we would know, and how the eye keeps improving after launch. It applies the standard used on Paradigm's code learning loop. That loop failed in three ways, and each has a guard here:

- **Popularity loop.** Entries that were used often got more trust, whether or not they were right. Here, use counts (`appliedCount`, citations, how often an agent quotes a rule) never add credit. Only verdicts and outcomes do (section 3).
- **200/200 complementary debates.** Agents "debated" and never disagreed. Here, agreement between agents is measured as a reliability number (section 2). It is never evidence that a rule is correct.
- **5/5 certifications survived.** Every gate passed, so the gates had no teeth. Here, each gate has a stated failure condition, and section 4 says what happens when a gate never fails.

Rule ids in this file use provisional keys taken from the research reports, because `rules.yaml` is being written alongside it. `nng.H1`–`nng.H10`, `nng.V1`–`nng.V9`, `nng.C1`–`nng.C9` and `nng.P1`–`nng.P5` come from `research/03-nng-basics.md` §3. `topics.R1`–`topics.R21` come from `research/04-nng-topics.md` §4. `hend.1`–`hend.30` come from `research/01-hendurhance.md` §4, and `aux.1`–`aux.23` from `research/02-awesome-ux.md` §4. Tell ids are the ids in `tells.yaml`. When `rules.yaml` lands, `bench/design-eye/map.yaml` maps each provisional key to a `rules.yaml` id. A seeded defect that maps to no rule shows a gap in the playbook. Report it as a finding; do not drop the label.

---

## 1. The design-eye benchmark

### 1.1 Composition

28 items: 20 seeded screens and 8 clean controls. The seeded screens carry 43 labelled defects in total. Every item is a real screen or component from the founder's own tools, captured at a pinned commit. These are the surfaces the agents will actually critique, so a stock UI kit is not used.

Rule spaces (each defect belongs to exactly one, and per-space metrics use these):

| Space | Covers | Example keys |
|---|---|---|
| S1 Status and feedback | busy states, progress, accurate status, location | `nng.H1`, `topics.R1`, `aux.1`, `aux.17`, `hend.2` |
| S2 Control, prevention, recovery | exits, undo vs gates, consequence-naming confirms, error anatomy, input survival | `nng.H3`, `nng.H5`, `nng.H9`, `topics.R2`–`R5`, `topics.R19`, `aux.4` |
| S3 Visual hierarchy and system | focal point, type tiers, colour budget, proximity, containers, token drift | `nng.V1`–`V3`, `nng.V6`, `nng.V7`, `hend.10`, `hend.11` |
| S4 Accessibility and perception | contrast, colour-not-alone, focus, names, labels | `nng.V4`, `nng.V5`, `topics.R12`, `topics.R13`, `hend.13`, `hend.14` |
| S5 Language and content | user vocabulary, jargon, scannability, label distinctness | `nng.H2`, `nng.C3`, `nng.C5`, `aux.9` |
| S6 Agent and AI UX | plans before actions, substitutions, citations, anthropomorphic status, clarifier shape, capability disclosure | `hend.16`–`hend.29`, `topics.R5`–`R9`, `topics.R15`, `topics.R17`, `topics.R20` |
| S7 Terminal, TUI, keyboard | glyph labels, keymap collisions, NO_COLOR legibility, palette parity | `topics.R10`, `topics.R11`, `nng.H6`, `nng.H7` |
| T Tells | machine-made or templated looks | `tells.yaml` ids |

Floor: at least 4 defects per space, with S2 and S6 heavier (see the tally below). Per-space numbers on a base this small have wide intervals, and section 2 reports them that way. The pooled numbers are the gate. Grow the benchmark toward 10 or more defects per space before per-space numbers gate anything (section 1.5).

### 1.2 Item list

The item list, the seeded defects and the labels live only in the bench (`~/.atelier/bench/design-eye/<version>/`), never in a repo. An earlier draft of this section listed the planted defects here. That leaked the answer key into an agent-readable path, so it was removed before the baseline run (see `b0-baseline.md`).

What the list must satisfy:

- Every item is a real screen from a surface the founder is actively designing, captured at a pinned commit (or pinned by sha256 for untracked refs). Stale surfaces are retired, not certified.
- Each seeded item carries 1 to 3 defects, mixing obvious seeds with subtle ones. Pre-existing defects the drafters notice become `found` labels only when the founder adds them.
- Clean controls are cleaned copies the founder certifies as having nothing at warn or above. At least one is an override decoy built from a real recorded override, quoted verbatim.
- Coverage: at least 3 held-out labels per space (S1-S7, T), growing toward 10 (section 1.5).

Bench v1, as frozen on 2026-10-18: 28 items (21 seeded, 7 controls including 1 decoy), 57 certified labels, 42 of them held-out.

### 1.3 How to build it

Layout (outside every agent-readable context path; see 1.4):

```
~/.atelier/bench/design-eye/
  v1/
    items/DE-01/  screen.png  screen@dark.png  markup.html  context.yaml
    items/CC-01/  ...
    labels/       DE-01.yaml ... CC-08.yaml   (never mounted into a run)
    map.yaml      provisional key -> rules.yaml id
    MANIFEST.yaml commit pins, sha256 of every file, canary tokens
  runs/           one dir per run (section 2)
```

1. **Pin.** Record repo, commit and file per item in `MANIFEST.yaml`. Benchmarks drift silently if the base moves.
2. **Capture.** Render each item at 1440×900 and 390×844 in light and dark (HTML/TSX), or at 120×40 and 80×24 cells with and without `NO_COLOR` (TUI refs). Save `screen.png` plus a self-contained `markup.html` (DOM with computed styles inlined), so static checks (contrast, token drift) and visual judgement both have an input. Flow items also get `trace.jsonl`, a timed event log or terminal transcript, because `[trace]` rules cannot be judged from a still.
3. **Seed.** Apply each defect as a minimal, reviewable diff to the copy (`seed.patch`, kept in `labels/`, not `items/`). One defect per diff hunk, so localisation can be scored.
4. **Certify.** The founder reviews each item once. For seeded items, he confirms each seed is a real defect at the stated severity. For controls, he confirms no defect at warn or above. Pre-existing defects found in a base during this step are either fixed in the copy or added as labels marked `origin: found`. Labels he declines are removed. Agents may draft labels; only the founder's certification makes them ground truth.
5. **Label** (`labels/DE-01.yaml`):

```yaml
item: DE-01
version: 1
defects:
  - id: DE-01-a
    space: S6
    key: topics.R19            # mapped via map.yaml
    where: { selector: "[data-card=permission] .prompt", bbox: [412, 288, 980, 340] }
    severity: blocker          # blocker | major | minor | cosmetic
    origin: seeded             # seeded | found
    evidence_kind: static      # static | trace
canary: "atl-cal-7f3e"         # unique per item; see 1.4
certified_by: founder
certified_on: 2026-10-xx
```

### 1.4 Keeping it from leaking

A benchmark the agents have seen measures memory, not the eye. Rules:

- **Physical separation.** The bench lives under `~/.atelier/bench/`, never inside a repo, notebook directory, University content pack or lore path. `labels/` is never passed to an evaluator. A run harness copies only `items/<id>/` into a fresh scratch dir per evaluator.
- **No learning from bench runs.** Bench runs are tagged `mode: bench`. Notebook writes, journal entries, `paradigm_teach`, Classroom submissions, study-hall staging and lore are disabled for that session. A bench run that tries to write any of them fails, and the attempt is logged.
- **Canaries.** Each label file carries a unique canary token. A weekly check greps every notebook, journal, University note, lore entry and `.atelier/` session under the founder's repos for canaries, item ids (`DE-\d\d`, `CC-\d\d`) and near-duplicates of label text (5-gram overlap ≥ 0.5). Any hit marks the bench `contaminated`. Affected items are retired and replaced.
- **Dev / held-out split.** A minority of items are **dev** (v1: 6 seeded items and 3 controls). They may be discussed, used in examples and fed to rule authors. The rest are **held-out**. They are seen only during scored runs, and their labels are never quoted anywhere. Only held-out numbers count toward the falsifiers in section 4.
- **No tuning to the test.** Rules, prompts and notebooks are frozen (content hash recorded) before a scored run. Changes made after looking at held-out results require a new bench version with fresh held-out items before the next scored claim.
- **Rotation.** Each quarter, replace 6 held-out items with new captures from the then-current UI. Retired held-out items move to dev.

### 1.5 Growth

Real misses become new items. When a shipped screen draws a complaint that a critique should have caught (section 3.2), capture the pre-fix screen as a new held-out item, labelled from the complaint. The bench then grows from actual failures, not imagined ones. Target for v2: 10 or more defects per space and 12 controls.

---

## 2. Scoring

### 2.1 A run

One evaluator = one isolated agent context (no shared notes, no access to other evaluators' output) running the standard `atelier design critique` on one item, with the pinned model, playbook hash and notebook hash. One scored run = 5 independent evaluators × all 28 items. Record per run: model id and version, prompt hash, `rules.yaml` hash, `tells.yaml` hash, notebook hash, date, seed (R18 in `04`). Output is the normal critique: findings with `where`, rule or tell id, severity.

### 2.2 Matching

A finding **matches** a label when the item is the same, the space is the same (or the mapped rule id is the same), and the location overlaps: the selector matches or contains the labelled node, or the bbox IoU is ≥ 0.3. For trace items, the event window must overlap. Each label matches at most one finding. Extra findings on the same defect count as duplicates: they are reported but are neither true nor false positives.

An unmatched finding on a seeded item is **adjudicated** by the founder, blind to which evaluator produced it. If it is a real defect, it becomes a `found` label in the next bench version and is scored as a true positive from then on, but not retroactively. If not, it is a false positive.

### 2.3 Metrics

The three primary metrics:

1. **Recall per space, on held-out items.** Matched labels / labels, per space and pooled. Also report severity-weighted recall (blocker 4, major 3, minor 2, cosmetic 1), because missing a blocker is worse than missing a cosmetic issue.
2. **False-alarm rate on clean controls.** Findings at warn or above per control item, averaged over evaluators. Report the override decoys separately as an **override-respect rate**: share of evaluators that raised no finding on them.
3. **Inter-evaluator agreement.** Krippendorff's α over the item × label × evaluator matrix (found / not found), plus α over severity (ordinal). Also report **consensus recall**: labels found by ≥ 3 of 5 evaluators. α measures reliability only. High agreement on a wrong answer is still wrong, so α never credits a rule.

Secondary metrics:

- **Precision per space.** Matched / (matched + adjudicated false positives), seeded and control items pooled.
- **Severity calibration.** Weighted κ (quadratic) between predicted and labelled severity on matched findings. **Mean signed severity error** detects inflation: a critic that calls everything a blocker scores positive.
- **Localisation.** Share of matched findings whose `where` resolves to a `file:line` in the base.
- **Evidence honesty.** Share of findings carrying the correct evidence label (`observed` / `heuristic` / `opinion` / `hypothesis`, per `nng.P1`). Any finding that claims a user test fails this outright (section 5).

### 2.4 Uncertainty

28 items is small, so every number gets a 90% interval from a bootstrap over items (10,000 resamples, items as the unit, never findings). Per-space intervals will be wide; print them anyway. A difference counts as improvement only when the interval of the difference (post minus baseline, paired by item) excludes zero.

### 2.5 Baseline, then rerun

1. **Baseline (B0).** Before the playbook is wired in: current Luna and Mika prompts, current `tells.yaml`, current notebooks, pinned model. One scored run. B0 is frozen and stored.
2. **Playbook (P1).** Same model, same items, with `rules.yaml` and `PLAYBOOK.md` loaded. One scored run.
3. **Monthly (P2, P3, …).** One scored run per month, after verdict-driven changes to rules and notebooks (section 3). Each run says which rules and notebook entries changed since the last.
4. **Model changes.** A model upgrade resets the comparison. Rerun B0's configuration on the new model before crediting anything to the playbook, so model gains are not booked as eye gains.

---

## 3. The feedback loop

The benchmark measures the eye at intervals. Verdicts and outcomes are what make it compound between runs. Both act on two kinds of object: **rules** (`rules.yaml`, `tells.yaml`) and **notebook entries** (Luna's and Mika's notebooks).

### 3.1 Founder verdicts on critiques

Every critique finding gets a stable id and records which rule or tell it cites and which notebook entries were in context when it was made (by entry id). The founder's verdict on each finding is one of:

- `keep`: it is right and matters.
- `overrule:wrong`: the claimed defect is not there.
- `overrule:context`: right in general, wrong here. This one needs a one-line reason, which is the raw material for scoping the rule.
- `overrule:severity`: right defect, wrong severity, with the corrected severity.
- `defer`: no verdict yet. It carries no credit and expires after 14 days.

Agents may not record verdicts. A verdict comes only from the founder's own action in the critique surface. Inferring it from silence, from a later commit, or from another agent's agreement is not allowed.

**Anti-anchoring.** The verdict view shows the finding (what, where, why) but hides the rule's strength tier and the agent's confidence until the verdict is in. Otherwise "durable" on the label buys keeps, which is the popularity loop again.

**Probes (opt-in, founder consents once).** One finding in 20 is a planted wrong finding, drawn from dev-split near-misses. Probes measure whether verdicts carry information. A probe kept is recorded and revealed at the weekly review. Probe verdicts never credit or debit any rule.

Credit:

| Event | Rule ledger | Notebook entries in context |
|---|---|---|
| `keep` | +1 precision credit | +1 credit to entries tagged to that rule's space |
| `overrule:wrong` | +1 precision debit | +1 debit to entries in context whose concept matches |
| `overrule:context` | context debit, plus the reason added to the rule's scope candidates | none |
| `overrule:severity` | severity-calibration miss (the sign is recorded) | none |

Entry credit only flows when the entry was actually in context and related to the finding by tag or concept. Being merely present is not enough, and `appliedCount` is never an input.

### 3.2 Outcomes

Outcomes outrank verdicts, because a verdict is an opinion at review time and an outcome is what happened after shipping.

- **Miss.** A shipped screen draws a real complaint: a founder note, an issue, a support message, or a user's words with a link to the source. A critique had covered that screen and raised no matching finding. Debit the recall ledger of the rule that should have caught it. If no rule covers it, open a gap against `rules.yaml`. The pre-fix screen becomes a held-out bench item (1.5).
- **Misfire.** A rule's finding was kept and fixed, and the fix caused a regression or a complaint (an over-applied confirm gate causing confirmation fatigue, say). Debit the rule's precision ledger with weight 2, because a misfire costs more than an ignored finding.
- **Vindication.** An overruled finding later matches a real complaint. Reverse the debit and add a precision credit. Record this on the founder's verdict log too, because the founder's calibration is part of the system.

Every outcome links to its source artifact. An outcome without a link is not recorded.

### 3.3 Decay

- A notebook entry's confidence decays toward its floor with a 90-day half-life of **no verdict-bearing use**. An entry that is in context but never touches a judged finding is not being tested, and untested confidence shrinks.
- Below confidence 0.4, an entry goes **dormant**: it is not injected into critique prompts but is kept for audit. A credit revives it.
- A rule's ledger counts are time-weighted: events older than 180 days count half. A rule cannot coast on last year's keeps.
- Bundled-canonical entries (`provenance.source: bundled-canonical`, e.g. Luna's current 0.9 entries) start at their stated confidence but decay like any other. Bundling is not evidence.

### 3.4 Contested rules

A rule is **contested** when it has ≥ 10 verdicts in the window and its overrule share is between 35% and 65%, or when its `overrule:context` reasons cluster on one surface (e.g. every overrule is on TUI screens).

A contested rule:

- is capped at `warn` and cannot block;
- is shown in critiques as contested, after the verdict is in;
- must be resolved within 30 days by **scoping** (splitting it, e.g. into a web version and a TUI version, using the context reasons) or by **retiring** it. Each resolution is a recorded decision with the verdict counts attached.

A contested rule is not resolved by re-wording it until the verdicts look better. A rewrite resets its ledger to zero, and the new wording earns its standing from scratch.

### 3.5 How strength is earned or lost

Strength has two parts. **Provenance** is fixed by the source, and **standing** is earned locally from evidence. The tier is the lower of the two.

- **Provenance ceiling** (set when the rule is written, from the research):
  - `durable`: grounded in perception or cognition research, or stable over decades (Gestalt proximity, recognition over recall, contrast for legibility, colour-not-alone; see `03` §4).
  - `expert-heuristic`: practitioner consensus with a clear mechanism (most of the 10 heuristics as checks, Tog's rules, platform conventions).
  - `nng-opinion`: house style, numeric budgets, contested items (the type and colour budgets, "5 users", "communication not decoration"; see `03` §4).
- **Standing** (earned only from held-out bench precision and recall, founder verdicts and outcomes):

| Standing | Entry criteria | Effect |
|---|---|---|
| provisional | new rule, or ledger reset | warn only |
| trusted | ≥ 10 kept verdicts over ≥ 3 distinct surfaces (web, TUI, agent card); keep share ≥ 80%; held-out precision ≥ 0.75 on ≥ 4 labels; no unreversed misfire in 60 days | may block, if the provenance ceiling allows |
| contested | section 3.4 | warn only, resolve within 30 days |
| retired | resolution decision, or held-out precision < 0.4 over two consecutive scored runs | not injected; kept for audit |

What each tier may do:

- **durable + trusted**: may block (severity `fail`).
- **expert-heuristic + trusted**: may block when the scope's design system lists the rule as enforced. Otherwise it is a warning.
- **nng-opinion, any standing**: warns only. Local evidence can make an opinion rule *trusted for this founder's tools*, recorded as `standing: trusted, scope: local`, but it cannot raise its provenance to durable. Evidence from one person's tools does not turn house style into perception science.
- **Losing tier.** A durable rule that misfires repeatedly on one surface is scoped, not demoted globally. The perception claim may hold while our wording of it fails on that surface. A durable rule with held-out precision under 0.4 across surfaces means the wording, not the science, is wrong. It is retired and rewritten with a reset ledger.

**Inputs that never move strength:** use counts, citation counts, how many agents endorsed a rule, agreement between evaluators (α), how often a rule appears in debates, its source's reputation after provenance is set, and the founder's stated liking for a rule outside a verdict on a finding.

---

### 3.6 Root cause of a recurring tell

When the same tell or rule failure shows up in two or more critiques or renders, record its root cause before changing anything:

- **prescribed**: Atelier's own wording (a skill, reference, template, notebook or board) led the agent there. Edit that wording. Agents read instructions literally.
- **ignored**: a clear rule existed and the agent broke it with a justification. Tighten the rule to "delete it; do not justify it".
- **missing**: no rule covered it. Write one, with a source, and route it through the founder like any new rule.

The fix for a tell is often an edit to Atelier, not a note to the agent. (Adapted from motionmaxxing's slop autopsy, `docs/HOW-IT-WAS-BUILT.md`.)

## 4. Liveness falsifiers for the first month

These are written before the first run so that they can fail. Each states the condition that counts as failure. The month starts at P1.

| # | Falsifier | Pass | Fail means |
|---|---|---|---|
| F1 | Verdict throughput | ≥ 15 findings with a founder verdict (not `defer`) per week, from ≥ 3 distinct critiques | Fewer than 8 for two consecutive weeks: the loop has no input, so nothing compounds. Fix the verdict surface before tuning anything else |
| F2 | Verdicts carry information | Over ≥ 30 verdicts, the overrule share is 10%–60%; if probes are on, ≥ 75% of probes are overruled | Keep share ≥ 95% is rubber-stamping (the 5/5-certification failure). Overrule share > 60% means the critic is noise |
| F3 | Recall improves | Pooled held-out recall P1 (or P2) minus B0 ≥ +0.15 absolute, with the 90% CI of the paired difference above 0; severity-weighted recall also up; no space drops by more than 0.05 | The playbook is decoration. Report it as such, and do not re-weight the benchmark until it passes |
| F4 | False alarms do not rise | Control false-alarm rate ≤ B0 + 0.1 findings per item; pooled precision not below B0; override-respect on decoys ≥ 0.8 | Recall was bought by flagging everything. Treat it as a fail for F3 as well |
| F5 | The eye is reliable | Krippendorff's α (found / not found) ≥ 0.6 at P1 and not below B0; consensus recall ≥ 0.5 | Gains are run-to-run luck; no single critique can be trusted |
| F6 | Weights actually move | By day 30, ≥ 5 notebook entries have changed confidence from verdicts, and ≥ 1 rule has changed standing (any direction) or been scoped | With ≥ 60 verdicts and nothing moved, the credit path is not wired. This is the 200/200 failure: the loop agrees with itself |
| F7 | Something loses | Over the month, ≥ 1 rule or notebook entry is debited to a lower standing or to dormant | A month of verdicts in which nothing loses means the gates have no teeth. Audit the ledger code before trusting any promotion |
| F8 | No leakage | Zero canary or item-id hits in the weekly grep | The bench is contaminated: retire the affected items, and void any run that used them |
| F9 | Honesty holds | Zero findings or session outputs claiming real-user testing without a study record (section 5) | A hard fail regardless of all other numbers |
| F10 | Severity is calibrated | Weighted κ (severity) ≥ 0.5 at P1; mean signed severity error within ±0.5 tier | The critic inflates or deflates severity; ranking findings by impact cannot be trusted |

At day 30, Loid writes one review: each falsifier's value, its interval, and pass or fail. A failed falsifier is not re-defined after the fact. If a threshold proves badly set, the change applies from the next month and is recorded as a decision with its reasoning.

---

## 5. What must never be faked

The playbook's agents run inspection methods. They do not run user research. The difference has to show in every output.

**Never claimed by an agent:**

- That a usability test, interview, field study, diary study, card sort, tree test or A/B test was run with real users, unless a study record exists with participants (count and recruitment source), date, method, tasks and raw notes or recordings, linked from the claim.
- That a screen is "usable", "intuitive", "validated", "user-tested" or "users found…". A heuristic pass is reported as "passes heuristic review", never as usable (`nng.P1`). An automated a11y pass is reported as "technically conformant", never as accessible (`nng.P3`).
- Quantitative usability scores (SUS, SEQ, task success, time on task) from anything other than real participants, and never from fewer than about 20 (`aux.21`).
- A founder verdict, an outcome or a complaint that did not happen. Each must link to its source.

**Synthetic user methods produce hypotheses only.** Synthetic personas, LLM-simulated participants, synthetic card sorts and simulated think-alouds may be run to generate questions and pre-structure a real study (`04` §5; `hend.29`). Their outputs:

- carry the evidence label `hypothesis`, with the method named;
- never credit or debit a rule or notebook entry;
- never count toward a falsifier;
- are always paired with the cheapest real study that would test them (P4 sizing: about 5 users per qualitative round per segment).

**Allowed, with stated limits.** Isolated multi-agent heuristic evaluation, cognitive walkthroughs, rubric scoring, rule linting and N × K output evals are legitimate inspection methods, reported as inspection. Internal engineers, the founder included, may serve as early testers for developer tools (NN/g, `04` §5). Their findings are labelled `observed: internal` with that limit stated, and they do not stand in for end users.

**Enforcement.** A pattern check over critique and session output flags the banned phrasings above when no study-record link is attached. Each flag counts against F9. When unsure, an agent writes "this needs a real-user test: <task>, <method>, <size>" rather than reporting a result.
