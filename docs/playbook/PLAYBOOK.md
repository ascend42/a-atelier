# The Atelier design playbook (v0)

Status: proposal, written by Luna with Mika's vetting rules. Nothing in the skill, the notebooks or `tells.yaml` has changed yet. The concrete changes are in [`proposals.md`](./proposals.md).

Companion files:

- [`rules.yaml`](./rules.yaml): 70 usability rules, deduplicated from the four research reports.
- [`research/`](./research/): the four curated source reports (01 hendurhance, 02 awesome-ux, 03 NN/g basics, 04 NN/g topics).
- [`calibration.md`](./calibration.md): Loid's improvement loop (see §9).
- Skill: `~/.claude/skills/atelier-design/SKILL.md` and `reference/` (`tells.yaml`, `question-bank.md`, `redesign.md`, `formats.md`).

## 1. Purpose

The founder's goal is to "globally expand on our UX / UI process and 'eye' of our agents", and to build a playbook that improves the skill over time.

Today Atelier's eye is mostly visual. `tells.yaml` has 32 tells; about 28 of them are about how a design *looks* (type, color, shape, layout, copy slop), and four are about whether it *works* (happy-path-only, placeholder-as-label, contrast-fail, motion-unmotivated). Mika's 59 notebooks are deep on tokens, WCAG numbers, HIG and Material, and thin on interaction, feedback, error recovery and AI/agent behaviour.

This playbook adds the second half of the eye: **will this cost the user?** It also makes Atelier honest about what an agent can and cannot know about usability.

It is for:

- **Luna** (direction): what to look at, how to frame problems and options, and how to record evidence.
- **Mika** (vetting, codifying, building): which checks to run, and how to word what they prove.
- **Any agent** that runs `atelier design critique` or a finish review.

## 2. The eye: how Luna and Mika see

Five habits. Each maps to rules in `rules.yaml`.

1. **Problem statement first.** Before a board, option or finding, name the user problem and how we know it exists. No problem, no option. (`problem-before-solution`)
2. **Evidence tags on every claim.** Every finding, rationale and decision carries one of three tags:
   - `observed`: real users or real usage data (tickets, analytics, sessions, the creator watching someone).
   - `heuristic`: a rule from `rules.yaml` or a tell, applied by an agent.
   - `opinion`: Luna's or Mika's taste, the creator's taste history, or an untested convention.
   A heuristic pass is never reported as "usable". (`evidence-tagged-claims`)
3. **Goal-anchored critique.** Every finding names the goal it serves or violates, plus a rule or tell id. "Feels off" must be rewritten in task terms or dropped. Rank by the cost of the error, note strengths, and keep critique and fixes in separate passes. (`critique-goal-anchored-and-independent`)
4. **Name the trade-off.** Most design questions have two good opposing answers (density vs clarity, convention vs novelty, calm vs alive). An option says which pole it takes; the product's written principles decide. (`principles-arbitrate-tradeoffs`)
5. **Hand off what only users can answer.** Every session ends with the cheapest study that could prove the direction wrong. (`close-with-falsifying-study`)

What the eye looks at, in order, on any screen or flow:

1. **Hierarchy**: what is the one thing, and does the squint test find it?
2. **Cost**: how many steps, choices, keystrokes and waits?
3. **Convention**: does it work the way the platform and the user's other tools work?
4. **Status**: does the user always know where they are, what is happening and what just happened?
5. **Recovery**: can they undo, exit or fix an error without losing work?
6. **Truth** (AI/agent surfaces): is AI involvement disclosed, is confidence honest, are claims sourced, are consequential actions previewed?

### Character is not decoration

NN/g's slogans ("communication, not decoration", "you can't impose joy") are strongly functionalist. Atelier's creators often want expressive, living elements; Luna's notebook records the Elvanti creator going past the calm recommendation on 6 of 11 boards. The playbook reads NN/g as **"decoration must not block the task"**, not "no character". Expressive elements pass when they carry meaning (status, identity, state) and sit below the primary task in the hierarchy. (`decoration-must-communicate`, strength `nng-opinion`)

## 3. The process loop

The session loop already in the skill, with the new checkpoints marked **new**.

| Step | Who | What happens | Rules applied |
|---|---|---|---|
| 1. Design Read | Luna | One-line read: what it is, for whom, how often, register. **New:** a second line with the problem and its evidence tag, and the surface (web, app, TUI, agent, voice, dashboard). | `problem-before-solution`, `users-framed-as-grounded-jobs` |
| 2. Mika's brief | Mika | Inventory of what exists. **New:** a rules pre-scan of the current UI (screen-only rules for the surface) so redesign audits list usability debt next to tells. | screen-only rules for the surface |
| 3. Boards | Luna | Intent, then **new** structure boards (IA, status and feedback, recovery, autonomy where relevant), then the visual levers. Options name their trade-off pole. | `content-and-ia-before-layout`, `principles-arbitrate-tradeoffs` |
| 4. Vetting | Mika | Existing checks (contrast, targets, tokens, dials, preserve, tells). **New:** the rules that apply to an option at board stage (for example `reversible-or-gated-proportionally` on a deletion flow), with concerns shown on the option. | per board |
| 5. References | Mika builds, Luna presents | Only on request. **New:** each reference states its fidelity and what it can't answer, and is stressed with real, long, empty and error content. | `prototype-fidelity-stated`, `stress-with-real-content` |
| 6. Decisions | creator | Pick, mix, note, skip. **New:** each recorded decision carries an evidence tag. | `evidence-tagged-claims` |
| 7. Direction | Luna, Mika | The rendered direction. **New:** a cold-reader check of the direction and DESIGN.md. | `deliverables-pass-sketch-test` |
| 8. Finish review | Luna, Mika | Drift against decisions, preserve, tells. **New:** every in-scope rule for the surface; findings cite rule ids; accessibility wording is "technically conformant"; a closing "next study" line. | all applicable; `conformance-is-not-accessibility`, `close-with-falsifying-study` |

For `critique`, steps 1, 2 and 8 run without boards.

## 4. Rules and tells

They are two different detectors and stay in two files.

| | Tells (`tells.yaml`) | Rules (`rules.yaml`) |
|---|---|---|
| Question | Does this read as machine-made or templated? | Will this cost the user time, errors, trust or access? |
| Origin | Pattern-spotting in generated UI (taste-skill lineage, Atelier's own) | Usability research and standards (NN/g, WCAG, HIG, PAIR, HAX, Carbon) |
| Override | Freely, with a recorded reason ("it's the brand") | Rarely. `durable` rules can't be overridden by taste; `nng-opinion` budgets can |
| Output | "trips `eyebrow-everywhere`" | "fails `errors-say-what-why-fix` at `BillingForm.tsx:88`: what is missing" |

How they are applied:

1. **Filter by surface.** Each rule has a `space`. A session loads the spaces that match its surface (§6). Tells keep filtering by `scope`.
2. **Filter by what we can run.** `screen-only` rules run on every critique and finish review. `walkthrough` rules run when an agent can drive the primary task (a dev server, a TUI, a script). `real-users` rules are never marked as passed; they appear as open items.
3. **Severity from strength.** `durable` failures are `fail`. `expert-heuristic` failures are `fail` when they block the primary task, otherwise `warn`. `nng-opinion` failures are `warn` and can be overridden like tells.
4. **Cite the id.** A finding without a rule id, tell id or decision id is opinion and is tagged as such.
5. **Where they overlap,** the tell is the detector and the rule is the reason. `rules.yaml` lists `related_tells`. Report the tell id; add the rule id when the finding is about cost to the user rather than look.

## 5. Methods: what agents can run, and what needs real users

This is the honest boundary. Atelier agents are inspectors, not users.

**Agents can run these credibly** (all are inspection methods, and none replaces user research):

- **Rule lint** over screenshots, DOM, source, transcripts and theme tokens: contrast, type-size count, accent count, label proximity, glyph uniqueness, keymap collisions, clarifier schema, error strings, banned status verbs, NO_COLOR and 80-column renders.
- **Heuristic evaluation** with independent passes: isolated contexts, ideally different models or personas, no shared notes, consolidated afterwards. Same-model agents share blind spots, so this never counts as the 3–5 human evaluators NN/g describes.
- **Cognitive walkthrough** on new interaction models (Gnomon, decision cards). Use a defined user type (NN/g's Legacy, Legend and Learner fit complex tools) and ask four questions at each step: will they try to do this; will they notice the right action; will they connect it to their goal; will they see progress afterwards? Any "no" fails the step. (https://www.nngroup.com/articles/cognitive-walkthroughs/)
- **Error-message rubric scoring** (12 criteria, NN/g). (https://www.nngroup.com/articles/error-messages-scoring-rubric/)
- **Timed walkthroughs** against the response-time limits (0.1 s, 1 s, 10 s).
- **AI output evaluation**: N inputs × K runs with a confidence interval. (`ai-quality-measured-not-demoed`)
- **Cold-reader checks** of Atelier's own deliverables (Sketch Test).
- **Research logistics**: writing task scripts and screeners, transcription, first-pass theming of real sessions.

**Agents can only generate hypotheses with these:**

- Synthetic users, synthetic personas, synthetic card sorts or interviews. Expect mode collapse: the long tail and subgroup differences disappear. Always tagged directional. (`synthetic-users-are-hypotheses`)

**These need real users:**

- Think-aloud usability testing (the single highest-value method if only one is run).
- Task completion with assistive tech (anything beyond "technically conformant").
- Card sorting and tree testing at scale, quantitative benchmarks (SUS, SEQ, time on task; about 20 or more users), A/B tests.
- Field and diary studies, including voice retention over weeks.
- For developer tools, internal engineers are acceptable first testers if the limit is stated, then validated with real end users.

Agents may say "this fails a heuristic" with confidence. They may never say "this is usable", "users will prefer" or "accessible".

## 6. Surfaces

Each surface lists the rule spaces to load, what matters most there, and the known gaps.

### Web

- Load: `ia`, `interaction`, `visual`, `content`, `accessibility`, plus `process` and `research`.
- Most important: `show-where-user-is`, `sibling-labels-distinct`, `decision-critical-facts-first`, `follow-platform-conventions` (links look like links), `text-contrast-both-themes`, `keyboard-focus-and-names`, `write-for-scanning`.
- Tells scope: `landing` or `content` for marketing pages; `product` for apps in a browser.
- TODO: performance as UX (Core Web Vitals, skeletons vs spinners, optimistic UI); forms research (Baymard, GOV.UK patterns); i18n and RTL.

### Native app (iOS, macOS, Android)

- Load: as web, plus Mika's HIG and Material notebooks (safe areas, Dynamic Type, haptics, navigation patterns).
- Most important: `targets-sized-and-placed` (44 pt on touch), `follow-platform-conventions` (platform navigation and gestures), `components-cover-all-states`, `never-lose-user-work`.
- TODO: a full HIG and Material 3 pass for interaction patterns (Mika's notebooks cover visual tokens, not flows); offline and sync states.

### TUI and terminal (Paradigm CLI, Claude Code surfaces, Gnomon)

- Load: `tui`, `interaction`, `content`, `accessibility` (color rules), `ai-agent` where an agent runs in it.
- NN/g translated to the terminal (an extrapolation; 03 §5 says so):
  - status line = visibility of system status;
  - Esc, q and Ctrl-C = user control and freedom;
  - key-hint footer and command palette = recognition over recall;
  - flags, aliases and keybindings = accelerators;
  - the command tree = the IA.
- Most important: `tui-chrome-shows-state-and-keys`, `terminal-standard-keys-preserved`, `cli-degrades-without-color-or-tty`, `waits-show-honest-progress` (long agent runs are where the 10-second limit bites), `color-never-sole-signal`.
- In a terminal, weight, color, indentation and whitespace are the only hierarchy tools, so the color budget and not-color-alone rules matter more than on the web.
- TODO, highest-priority gap: none of the four reports read a terminal-native source. clig.dev, Charm (Bubble Tea, Lip Gloss) conventions, no-color.org, the Heroku and GitHub CLI style guides, ANSI 16-color contrast, monospace grid and box-drawing rhythm, spinner etiquette, exit codes. Until then, every `tui` rule is `expert-heuristic`.

### Agent and AI UX (chat, tool-using agents, decision cards)

- Load: `ai-agent`, `interaction`, `content`, plus `tui` or web depending on the host.
- The six questions: disclosed? correctable? capabilities and limits stated? consequential actions previewed? failures honest? work auditable?
- Decision and approval cards, from `decision-card-anatomy`, `reversible-or-gated-proportionally`, `autonomy-scoped-by-risk` and `no-silent-substitution`:
  - what will happen and its exact scope;
  - decision-critical facts first;
  - a source next to each claim;
  - any substitution stated;
  - Proceed, Edit and Take over;
  - default focus never on Approve;
  - gates only at high-stakes moments, and undo for everything else.
- Status copy is factual ("read 4 files"). Personality lives in tone, not in claims about thinking. See the pushback in `proposals.md`.
- Context and memory are IA: global, local and ambient layers are visible and separate, and memory is listable with provenance. (`context-and-memory-legible`)
- TODO: multi-agent orchestration views (who is doing what, handoffs, attribution); cost and token visibility; interruptibility mid-run; permission fatigue measured, not assumed; HAX's 18 guidelines in full; the PAIR guidebook beyond the errors chapter.

### Voice

- Load: `voice`, plus `ai-agent`.
- Most important: a small command set that works reliably; one-sentence answers with detail on screen; a confirm step and screen echo for irreversible approvals. Users rarely retry a capability once it has failed, so launch narrow.
- TODO: earcons and audible state; turn-taking and barge-in; multi-language; Pearl's *Designing Voice User Interfaces* is the only source on file and it is dated.

### Dashboards

- Load: `visual`, `accessibility`, `interaction`, `content`.
- First, declare the dashboard **operational** (glanceable live status, for example an agent fleet) or **analytical** (reflective review).
- Encode quantities with length and position; never color alone; no pies, gauges or radar for quantities. (`quantities-by-length-or-position`)
- High density is allowed, but containers stay off data (the existing `density ≥ 7` dial constraint).
- TODO: Tufte, Few, and Datawrapper and Observable chart guidance; table design (sorting, alignment, numeric type); alert thresholds and alarm fatigue.

## 7. Source trust tiers

What a rule may cite, and how much weight it carries.

| Tier | What | Examples | Use |
|---|---|---|---|
| T1: standards and primary research | Standards bodies, peer-reviewed HCI, laws | WCAG 2.2, WAI-ARIA APG, Cleveland & McGill, Fitts, Gestalt, Turpin et al. 2023, Amershi et al. (HAX, CHI 2019), EU AI Act Art. 50 | `durable` rules; not overridable by taste |
| T2: research-led practitioners and major design systems | Organisations that publish method and rationale | NN/g articles with studies behind them, Google PAIR, Apple HIG, Material 3, IBM Carbon, GOV.UK Design System, MeasuringU | `expert-heuristic` rules |
| T3: expert opinion and canon books | Single experts, house positions, numeric budgets | NN/g slogans and budgets, Tognazzini, Laws of UX (only via its primary sources), LukeW, Wattenberger, Shape of AI, Yocco (thresholds unsourced), *Refactoring UI*, Norman, Krug, Saffer | `nng-opinion` rules or `notes`; overridable |
| T4: do not cite | SEO explainers, bootcamp funnels, prompt tables, dead or redirected links, **pirated mirrors** | CareerFoundry, uxplanet, Toptal, generic Medium "what is X", the hendurhance MEGA and Drive mirrors | Never. Books are cited by title only. |

Two corrections from the research to remember:

- Do not cite Miller's 7±2 for menu length.
- WCAG 2.5.5 (44 px) is AAA. The AA target-size criterion in WCAG 2.2 is 2.5.8 (24 px).

## 8. Gaps (what the four reports did not cover)

Ranked by how much each matters to Atelier's actual surfaces. The reading list in `proposals.md` §e closes them in this order.

1. TUI and CLI design (Paradigm, Gnomon and Claude Code are the main surfaces).
2. WCAG 2.2 and ARIA patterns as primary sources, beyond Mika's notebook summaries.
3. Agent and multi-agent UX beyond single-agent chat (HAX in full, PAIR in full, permission UX).
4. Content design and error copy (GOV.UK content design, NN/g UX-writing study guide).
5. Data visualisation and dashboards.
6. Developer-tool UX: compiler-style error messages (Elm, Rust), docs IA (Diátaxis), defaults then flags then config.
7. Motion specs as usability (Mika has the tokens; the research has nothing on when motion helps comprehension).
8. Performance as UX.

## 9. How the playbook improves

Stub. Loid owns the calibration loop in [`calibration.md`](./calibration.md): the design-eye benchmark (§1), scoring (§2), founder verdicts and outcomes (§3, including how strength is earned or lost in §3.5), and liveness falsifiers (§4). This section stays a pointer. The loop is Loid's to define.

**Key mapping for Loid's `bench/design-eye/map.yaml`.** Every rule's `merged_from` uses the research reports' own numbering, which lines up with calibration.md's provisional keys like this:

| `merged_from` | calibration key |
|---|---|
| `01#n` | `hend.n` |
| `02#n` | `aux.n` |
| `03:Hn`, `03:Vn`, `03:Cn`, `03:Pn` | `nng.Hn`, `nng.Vn`, `nng.Cn`, `nng.Pn` |
| `04:Rn` | `topics.Rn` |

So the map can be generated from `rules.yaml`, not written by hand. Calibration.md's spaces S1–S7 are coarser than `rules.yaml` spaces; reconciling the two is an open item between Luna and Loid.

What the loop should be able to consume from this playbook:

- **Per-rule outcomes.** For each rule id, how often it fired, how often the creator accepted the finding, how often it was overridden and why, and whether a later real-user study confirmed or contradicted it.
- **Strength promotion and demotion.** An `nng-opinion` rule that keeps being confirmed in this creator's work can be promoted; a `durable` rule is never demoted by taste, only by a better source.
- **Taste vs usability separation.** Creator overrides on tells feed Luna's taste notebooks. Overrides on rules feed calibration and need a reason that names the trade-off.
- **New rules from sessions.** A creator note that is rule-shaped and usability-related ("never make me hunt for the stop key") becomes a candidate rule with `strength: opinion` and provenance, not a tell.
- **Open questions.** Who owns rule promotion (Luna, Mika or Loid)? Is calibration per creator, per repo or global? How are real-user findings recorded so they can outrank heuristics?

TODO (Loid, Luna): confirm that calibration.md §3.5 covers promotion for `nng-opinion` rules, and decide who signs off a strength change.

## 10. Versioning

- `rules.yaml` and this playbook are v0 proposals. Rule ids are stable once adopted; changes go through `proposals.md`-style entries with rationale and source.
- Every rule cites a source. A rule with no T1–T3 source is a candidate, not a rule.
