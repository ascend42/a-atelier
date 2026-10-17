# Playbook v0: proposed changes

Status: proposals only. Nothing below has been applied. Each item gives the change, its rationale and its source. Rule ids refer to [`rules.yaml`](./rules.yaml), and the reasoning behind them is in [`PLAYBOOK.md`](./PLAYBOOK.md).

Sections:

- a. New usability tells for `tells.yaml`
- b. Notebook entries for Luna and Mika
- c. Changes to `SKILL.md` (plus `formats.md` and Mika's agent file)
- d. New question-bank boards
- e. Second-round reading list, ranked
- f. Pushback on the research

---

## a. New usability tells for `tells.yaml`

**Rationale.** 28 of the 32 current tells are about how a design looks. These 16 are mechanical or near-mechanical detectors for usability failures. Each one is the detector for a rule in `rules.yaml`. The tell flags the pattern, and the rule explains why it costs the user.

**Schema changes needed:**

1. Add two `scope` values: `agent` (AI and agent surfaces) and `terminal` (CLI and TUI).
2. Add one optional field, `rule`: the `rules.yaml` id this tell detects. Existing tells that overlap a rule should get it too:

| Existing tell | `rule` |
|---|---|
| `happy-path-only` | `components-cover-all-states` |
| `placeholder-as-label` | `persistent-visible-labels` |
| `contrast-fail` | `text-contrast-both-themes` |
| `motion-unmotivated` | `reduced-motion-honored` |
| `duplicate-cta-intent` | `consistent-and-changes-look-changed` |

**Source:** every tell cites the source of its rule. See `rules.yaml`.

```yaml
  # ── Usability: feedback, errors, recovery ───────────────────────────
  - id: generic-error-copy
    name: Generic error message
    scope: [product, agent, terminal]
    detect: { kind: pattern, regex: "(Something went wrong|An (unexpected )?error (has )?occurred|Unknown error|[Cc]ontact (your )?administrator|^Error\\.?$)", where: "user-visible strings" }
    why: Says that it failed but not what, why or how to fix it; a dead end.
    severity: fail
    override: none. A fallback string may exist only behind a specific message.
    rule: errors-say-what-why-fix

  - id: are-you-sure
    name: Consequence-free confirmation
    scope: [product, agent, terminal]
    detect: { kind: pattern, regex: "\\b[Aa]re you sure\\??", where: "user-visible strings" }
    why: A generic gate trains people to click through; it should name what will happen and to what.
    severity: warn
    override: The surrounding dialog names the consequence and scope in its body.
    rule: reversible-or-gated-proportionally

  - id: toast-for-error
    name: Error in a toast
    scope: [product, agent]
    detect: { kind: review, hint: "error or validation messages rendered in auto-dismissing toasts or snackbars" }
    why: Errors fade before they're read and sit far from their cause.
    severity: fail
    override: none
    rule: notification-matches-urgency

  - id: disabled-without-reason
    name: Disabled control with no reason
    scope: [product, landing]
    detect: { kind: structure, what: "disabled buttons or inputs with no adjacent or tooltip explanation of what enables them" }
    why: The user can see they're blocked but not why.
    severity: warn
    override: The reason is obvious from an adjacent empty required field that is itself marked.
    rule: prevent-errors-with-constraints

  - id: opaque-long-wait
    name: Opaque long wait
    scope: [product, agent, terminal]
    detect: { kind: review, hint: "operations over 10 s showing only a spinner or 'Processing…'/'Loading…', with no steps, count or stop key" }
    why: Past 10 s attention breaks; a bare spinner gives no reason to stay and no way out.
    severity: warn
    override: none
    rule: waits-show-honest-progress

  - id: no-exit
    name: State with no visible exit
    scope: [product, agent, terminal]
    detect: { kind: structure, what: "modals, wizards, overlays or TUI modes without a visible close, cancel, back or documented quit key" }
    why: Users trapped in a state abandon or force-quit.
    severity: fail
    override: none
    rule: every-state-has-an-exit

  # ── Usability: consistency, labels, encoding ───────────────────────
  - id: synonym-actions
    name: One action, several verbs
    scope: [product, agent, terminal]
    detect: { kind: review, hint: "the same operation labelled with different verbs across views (Remove / Delete / Trash; Save / Apply / Update)" }
    why: Users read different words as different actions.
    severity: warn
    override: The verbs really are different operations; then make them look different too.
    rule: consistent-and-changes-look-changed

  - id: icon-only-control
    name: Unlabelled icon control
    scope: [product, agent, landing]
    detect: { kind: structure, what: "interactive elements with an icon and no visible text, tooltip or accessible name" }
    why: Glyph meaning is guessed by people and is invisible to screen readers and driving agents.
    severity: fail
    override: Universal glyphs (close ×, search) that have an accessible name.
    rule: semantic-structure-for-machines

  - id: internal-jargon
    name: Internal names in user copy
    scope: [product, agent, terminal]
    detect: { kind: pattern, regex: "\\b(null|undefined|NaN|payload|entity|enum|uuid)\\b|\\b[a-z]+_[a-z_]+\\b|#[a-z]+(-[a-z]+)+", where: "user-visible strings" }
    why: Schema keys, null values and symbol IDs leak the implementation into the user's language.
    severity: warn
    override: Developer-facing surfaces where the identifier is the user's vocabulary (a CLI that takes the id as input).
    rule: speak-the-users-language

  - id: color-only-state
    name: State shown by color alone
    scope: [product, agent, terminal, landing]
    detect: { kind: structure, what: "a status, category or pass/fail state that becomes indistinguishable in a grayscale or NO_COLOR render" }
    why: Fails color-vision-deficient users, monochrome terminals and screenshots.
    severity: fail
    override: none
    rule: color-never-sole-signal

  - id: area-or-angle-chart
    name: Quantity as area or angle
    scope: [product]
    detect: { kind: pattern, regex: "\\b(PieChart|Pie|DonutChart|Doughnut|Gauge|RadarChart|Radar|Treemap)\\b", where: "chart components in source" }
    why: People compare lengths and positions accurately and areas and angles poorly.
    severity: warn
    override: Part-to-whole with two or three slices where precision doesn't matter.
    rule: quantities-by-length-or-position

  # ── Usability: AI and agent surfaces ───────────────────────────────
  - id: blank-prompt-box
    name: Blank prompt box
    scope: [agent]
    detect: { kind: structure, what: "an AI input whose empty state has no suggestions, examples, capability list or task menu" }
    why: The user has to guess what the system can do; articulation is the hardest part of prompting.
    severity: warn
    override: An expert-only surface whose users are known to arrive with a task.
    rule: capabilities-and-limits-up-front

  - id: generic-source-label
    name: Citations labelled "Source"
    scope: [agent]
    detect: { kind: pattern, regex: "\\[?\\b(Source|Ref|Citation)\\s*\\d*\\b\\]?", where: "rendered citation labels" }
    why: An unlabelled citation inflates trust without telling the reader what backs the claim.
    severity: warn
    override: none
    rule: citations-beside-claims

  - id: approve-default-focus
    name: Approve has default focus
    scope: [agent, terminal, product]
    detect: { kind: structure, what: "approval, permission or destructive dialogs where initial focus or Enter maps to Approve/Allow/Delete" }
    why: One keystroke commits; this trains rubber-stamping.
    severity: fail
    override: none
    rule: decision-card-anatomy

  - id: anthropomorphic-status
    name: Capability-inflating status copy
    scope: [agent]
    detect: { kind: pattern, regex: "\\b(I thought about|I understand|I('ve| have) (considered|reflected)|Pondering|Contemplating)\\b", where: "status and progress strings" }
    why: Claims of thought inflate trust in what the system did; say what it did instead ("read 4 files").
    severity: warn
    override: A persona voice the brand chose, as long as status lines also state the factual action.
    rule: explain-by-sources-not-narration

  - id: stream-autoscroll
    name: Streaming yanks the scroll
    scope: [agent]
    detect: { kind: review, hint: "while a response streams, the view scrolls to the end even when the user has scrolled up or is reading the start" }
    why: The reader loses their place in the answer they're reading.
    severity: warn
    override: none
    rule: streaming-holds-reading-position
```

Note on `anthropomorphic-status`: the regex leaves out "Thinking…" on purpose. See pushback f2.

---

## b. Notebook entries

Same schema as the existing notebooks. The proposed `provenance.source: research` value is new. It means curated from `docs/playbook/research/`, with `ref` pointing at the rule.

### Luna: new entries

```yaml
# ~/.paradigm/notebooks/luna/nb-luna-problem-before-options.yaml
id: nb-luna-problem-before-options-001
context: When opening any board, option set or critique
snippet: |
  Name the user problem and how we know it before any option. The
  Design Read gets a second line: "Problem: <what costs the user> —
  <observed | heuristic | assumed>". If I can't state a problem, the
  first board is intent-problem, not type or color.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#problem-before-solution
  originProject: a-atelier
  createdBy: luna
confidence: 0.85
concepts: [session-flow, evidence]
tags: [atelier, luna, playbook, process]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/luna/nb-luna-evidence-tags.yaml
id: nb-luna-evidence-tags-001
context: When writing a recommendation, a finding or a decision record
snippet: |
  Tag every claim observed, heuristic or opinion. My recommendation is
  opinion unless a rule or user data backs it; a rule pass is heuristic.
  Never write "usable", "users will prefer" or "validated" without
  observed evidence.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#evidence-tagged-claims
  originProject: a-atelier
  createdBy: luna
confidence: 0.9
concepts: [evidence, decisions]
tags: [atelier, luna, playbook, process]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/luna/nb-luna-name-the-pole.yaml
id: nb-luna-name-the-pole-001
context: When a board's options trade off against each other
snippet: |
  On a real trade-off (density vs clarity, convention vs novelty, calm
  vs alive) each option says which pole it takes, and the recommendation
  cites the product principle that decides it. If the product has no
  principles yet, propose 3–7 on a principles board before the visual
  boards.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#principles-arbitrate-tradeoffs
  originProject: a-atelier
  createdBy: luna
confidence: 0.8
concepts: [option-generation, direction]
tags: [atelier, luna, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/luna/nb-luna-close-with-next-study.yaml
id: nb-luna-close-with-next-study-001
context: When closing a session or a critique
snippet: |
  End with the cheapest study that could prove the direction wrong,
  typed and sized (e.g. "5-user think-aloud on invoice entry;
  behavioural, qualitative, formative"). Until it runs, the direction
  is heuristic. I can say a design fails a rule; I can't say it works.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#close-with-falsifying-study
  originProject: a-atelier
  createdBy: luna
confidence: 0.85
concepts: [session-flow, evidence]
tags: [atelier, luna, playbook, process]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/luna/nb-luna-convention-is-default.yaml
id: nb-luna-convention-is-default-001
context: When an option breaks a platform or web convention
snippet: |
  Convention is the default for standard jobs (navigation, search,
  settings, quit, links). An option that breaks one carries, on the
  card, why it's clearly better and the mental-model risk. "It looks
  fresher" is not a reason.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#follow-platform-conventions
  originProject: a-atelier
  createdBy: luna
confidence: 0.85
concepts: [option-generation]
tags: [atelier, luna, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/luna/nb-luna-structure-before-look.yaml
id: nb-luna-structure-before-look-001
context: When ordering boards for any scope with real content or actions
snippet: |
  Before visual boards, list the scope's content in priority order and
  settle sections, grouping and who sees what. Pick navigation to fit
  the hierarchy's depth, not its looks. (The Elvanti creator asked for
  this explicitly; the research says it's the general rule.)
provenance:
  source: research
  ref: docs/playbook/rules.yaml#content-and-ia-before-layout
  originProject: a-atelier
  createdBy: luna
confidence: 0.8
concepts: [session-flow, ia]
tags: [atelier, luna, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/luna/nb-luna-character-is-not-decoration.yaml
id: nb-luna-character-is-not-decoration-001
context: When an expressive option meets a "minimal / no decoration" check
snippet: |
  Character passes when it carries meaning (status, identity, state) and
  sits below the primary task in the squint test. Decoration fails only
  when it competes with the task. Don't flatten a living element to
  satisfy NN/g's functionalism; do move it down the hierarchy.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#decoration-must-communicate
  originProject: a-atelier
  createdBy: luna
confidence: 0.75
concepts: [direction, creator-taste]
tags: [atelier, luna, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

**Change to an existing Luna entry.** Keep `nb-luna-elvanti-structure-before-look-001` as it is; it is creator-specific taste. Add `related: [nb-luna-structure-before-look-001]` so the general and the creator-specific versions link.

### Mika: new entries

```yaml
# ~/.paradigm/notebooks/designer/nb-usability-rules-lint.yaml
id: nb-usability-rules-lint-001
context: When vetting options, running critique, or doing a finish review
snippet: |
  Run rules.yaml for the session's surface after the tells. screen-only
  rules on every pass; walkthrough rules when I can drive the primary
  task (dev server, TUI, script); real-users rules are listed as open,
  never passed. Severity: durable = fail; expert-heuristic = fail if it
  blocks the primary task, else warn; nng-opinion = warn, overridable.
  Every finding cites the rule id and file:line.
provenance:
  source: research
  ref: docs/playbook/PLAYBOOK.md#4-rules-and-tells
  originProject: a-atelier
  createdBy: designer
confidence: 0.85
concepts: [review, usability, process]
tags: [atelier, playbook, review]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/designer/nb-a11y-technically-conformant.yaml
id: nb-a11y-technically-conformant-001
context: When reporting the result of any accessibility check
snippet: |
  Automated or checklist passes are "technically conformant", never
  "accessible". Always add the open item: task completion with
  assistive tech (screen reader, keyboard-only, zoom) by real users.
  Passing rules don't say whether the alt text communicates what the
  task needs.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#conformance-is-not-accessibility
  originProject: a-atelier
  createdBy: designer
confidence: 0.95
concepts: [accessibility, wording]
tags: [accessibility, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/designer/nb-state-matrix.yaml
id: nb-state-matrix-001
context: When codifying a component or vetting a build
snippet: |
  Every component ships a state matrix: default, hover, focus, active,
  disabled-with-reason, loading, empty, error. "Disabled" without a
  visible reason is incomplete. Flag one-off components that duplicate
  a library component as consistency failures.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#components-cover-all-states
  originProject: a-atelier
  createdBy: designer
confidence: 0.9
concepts: [design-system, states]
tags: [design-system, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/designer/nb-error-component-slots.yaml
id: nb-error-component-slots-001
context: When codifying error, validation or failure components
snippet: |
  The error component requires three slots (what happened, why or
  where, how to fix + action) so a bare "Error" can't render. Inline at
  the source for validation; never a toast for errors; input preserved
  on re-render; a non-color indicator. Score copy on NN/g's 12-criterion
  rubric and aim for ≥3.3.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#errors-say-what-why-fix
  originProject: a-atelier
  createdBy: designer
confidence: 0.85
concepts: [errors, design-system, content]
tags: [design-system, content, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/designer/nb-response-time-limits.yaml
id: nb-response-time-limits-001
context: When designing or vetting loading, progress and agent-run states
snippet: |
  0.1 s feels instant (acknowledge at the trigger). 1 s keeps flow
  (show busy). 2–10 s: a changing indicator. >10 s: steps done/remaining
  or items as they complete, plus a labelled stop key; after a long wait,
  a re-orientation summary. Progress must be honest; no stalled 99%.
  Animate on clock time, not processing speed.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#waits-show-honest-progress
  originProject: a-atelier
  createdBy: designer
confidence: 0.9
concepts: [feedback, motion, performance]
tags: [interaction, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/designer/nb-decision-card-anatomy.yaml
id: nb-decision-card-anatomy-001
context: When building approval, permission or agent-plan cards
snippet: |
  Card = what will happen + exact scope (files, counts, env) +
  decision-critical facts first + source beside each claim + any
  substitution stated + Edit / Take over / Approve. Initial focus is
  never Approve. Gate only irreversible or external actions and
  constraint swaps; everything reversible gets undo instead.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#decision-card-anatomy
  originProject: a-atelier
  createdBy: designer
confidence: 0.8
concepts: [ai-agent, approval, design-system]
tags: [agent-ux, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

```yaml
# ~/.paradigm/notebooks/designer/nb-tui-heuristic-translation.yaml
id: nb-tui-heuristic-translation-001
context: When vetting a CLI, TUI or terminal-hosted agent surface
snippet: |
  Status line = system status (mode, path, what's running). Esc / q /
  Ctrl-C = exits, never rebound. Key-hint footer + command palette =
  recognition over recall. Flags and keybindings = accelerators that
  duplicate a visible path. Render-check with NO_COLOR=1, 16 colors,
  80 columns and piped output; color is never the only signal. Errors
  to stderr with what/why/fix and a non-zero exit.
provenance:
  source: research
  ref: docs/playbook/PLAYBOOK.md#tui-and-terminal-paradigm-cli-claude-code-surfaces-gnomon
  originProject: a-atelier
  createdBy: designer
confidence: 0.7
concepts: [tui, cli, terminal]
tags: [tui, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

Confidence is 0.7 because this is our extrapolation of NN/g; raise it after the clig.dev read.

```yaml
# ~/.paradigm/notebooks/designer/nb-stress-real-content.yaml
id: nb-stress-real-content-001
context: Before signing off any option, reference or build
snippet: |
  Render with real entity names at their longest, plus empty, error and
  many-items data. Check that the hierarchy still holds (squint test)
  and that no image or long name takes it over. State the reference's
  fidelity (interactivity / visuals / content) and what it can't answer.
provenance:
  source: research
  ref: docs/playbook/rules.yaml#stress-with-real-content
  originProject: a-atelier
  createdBy: designer
confidence: 0.85
concepts: [review, references]
tags: [review, playbook]
appliedCount: 0
created: '2026-10-16T00:00:00Z'
updated: '2026-10-16T00:00:00Z'
```

### Mika: changes to existing entries

1. **`nb-color-psychology-001`.** Lower `confidence` from 0.85 to 0.5 and add this to the snippet: "Weak, culture-bound evidence. Never use as the sole rationale on an option; tag as opinion." Source: 01 §2 SKIP (color-psychology pieces judged weak evidence).
2. **`designer.agent` `review-checklist` item 2** (agent file, not a notebook). Replace "Touch targets >= 44x44px with >= 8px gaps" with "Targets ≥ 24×24 CSS px or equivalent spacing (WCAG 2.2 AA, 2.5.8); 44×44 on touch platforms (Apple HIG; WCAG 2.5.5 AAA)". Mika's own `nb-wcag-target-size-u7v8` already says this; the checklist contradicts it. Source: https://www.w3.org/WAI/WCAG22/quickref/
3. **`designer.agent` `review-checklist` item 11** (new): "Usability rules for the surface pass (rules.yaml); accessibility reported as technically conformant."
4. **`designer.agent` `anti-patterns`.** Tag "Dev tools: no light-only themes" and "Healthcare: no red as primary" as opinion. The research found no source for either. Keep them as warnings, not vetting failures.

---

## c. Changes to `SKILL.md`

Proposed text, by section. The copy-step: on adoption, `rules.yaml` is copied to `~/.claude/skills/atelier-design/reference/rules.yaml`, so the skill stays self-contained.

**c1. Header reference line.** Rationale: the skill must load the new file.

```
Formats: `reference/formats.md`. Question bank: `reference/question-bank.md`.
Tells: `reference/tells.yaml`. Rules: `reference/rules.yaml`. Redesign mode: `reference/redesign.md`.
```

**c2. §2 Load context, new item 6.** Rationale: rules load by surface, the same way tells load by scope.

```
6. **Rules** — load `reference/rules.yaml`. Keep the spaces for the
   session's platform (web/app: ia, interaction, visual, content,
   accessibility; tui: tui, interaction, content, accessibility;
   agent: ai-agent, interaction, content; voice: voice, ai-agent;
   dashboards: visual, accessibility, interaction, content), plus
   process and research always. Apply repo overrides from
   `design-system.yaml` (only `nng-opinion` rules can be overridden).
```

**c3. §2b Design Read, a second line.** Rationale: the problem comes first, and the problem carries an evidence tag (`problem-before-solution`).

```
Reading this as: <what it is> for <who>, <how often/where they use it>; <the register in a few words>.
Problem: <what costs the user today> — <observed | heuristic | assumed>. Platform: <web | app | tui | agent | voice | dashboard>.
```

Add: "If the problem is `assumed`, say so. That is fine, and the close will name the study that checks it."

**c4. §4 Boards, option rules.** Add one bullet:

```
- on a genuine trade-off, the option names the pole it takes ("leans
  dense") and the recommendation cites the principle that decides it.
```

**c5. §4 "Mika vets before publishing".** Rationale: usability concerns surface at board time, not only at finish.

```
**Mika vets before publishing:** contrast (WCAG AA unless configured
otherwise), targets (24 px AA / 44 pt touch), feasibility in this stack,
token-first, the decided dials, the `preserve:` list, the in-scope tells,
and the in-scope rules that an option at this stage can already fail
(e.g. `reversible-or-gated-proportionally` on a deletion flow).
```

**c6. §4 Decisions.** Add: "Each recorded decision gets `evidence: observed | heuristic | opinion`. A skip-to-recommendation is `opinion`."

**c7. §5 Close.** Replace step 5's `direct` bullet and add a step. Rationale: the finish review cites rule ids, and the boundary of what agents know is stated (`close-with-falsifying-study`).

```
   - `direct` → continue the original task under the new system. Mika
     implements; afterwards Luna runs a finish review against the
     session's decisions, the direction render, the `preserve:` list,
     the in-scope tells and the in-scope rules. Each finding gives
     `file:line` and the decision, tell or rule id. Walkthrough rules
     run if the build can be driven; real-users rules are listed as open.
6. **Next study.** One line: the cheapest study that could prove this
   direction wrong, typed and sized (rules.yaml `method-fits-question`).
   Never call the direction usable or validated.
```

**c8. Critique section, rewritten.**

```
## Critique

No boards up front. State the Design Read (with the Problem line).

1. **Mika's pass (mechanical):** tells in scope, then rules in scope
   by `runnable_by` — every `screen-only` rule; `walkthrough` rules if
   she can drive the primary task; `real-users` rules listed as open.
2. **Luna's pass (judgement), independent of Mika's notes:** hierarchy
   (squint test), interaction cost, convention, status, recovery, and
   for agent surfaces truth (disclosure, sources, previews). Plus
   rhythm, voice, on-brand-ness, and the scope's current dials.
3. **Consolidate.** Findings ranked by cost of the error (blocks the
   primary task > causes errors > slows > looks off). Each finding:
   what, where (`file:line`), the goal it violates, the rule, tell or
   decision id, and an evidence tag. A finding with no id is tagged
   opinion. Overridden tells and rules are not findings. List
   strengths too.
4. **Fixes in a separate section** from the findings.
5. Accessibility results read "technically conformant", never
   "accessible"; add the assistive-tech task test as an open item.
6. Close with the next study, and offer to turn the top findings into
   a `direct` session. Offer "show me" references (now vs proposed)
   on request.
```

**c9. Rules section (bottom of the skill).** Add:

```
- Rules are usability checks, tells are slop detectors. Durable rules
  aren't overridden by taste; nng-opinion rules can be, with a reason.
- Never claim "usable", "accessible" or "validated" without real users.
  Say "fails/passes <rule-id>", "technically conformant", "heuristic".
- Synthetic users are hypotheses, never evidence.
```

**c10. `formats.md` session.yaml.** Rationale: the record must be able to hold the new fields. There is also a naming collision: the existing `surface: terminal | preview` field describes the board surface, so the product surface uses a new key, `platform:`.

```yaml
platform: web             # web | app | tui | agent | voice | dashboard (which rules.yaml spaces load)
problem: "Admins re-enter the tax ID on every invoice"
problem_evidence: observed  # observed | heuristic | assumed
...
    decision:
      kind: pick
      evidence: opinion   # observed | heuristic | opinion
findings:                 # critique and finish review
  - rule: errors-say-what-why-fix   # or tell: <id> or decision: <board>
    where: "src/app/settings/BillingForm.tsx:88"
    goal: "finish billing setup without support"
    severity: fail
    evidence: heuristic
open_questions:           # real-users rules and the next study
  - "Screen-reader task test of billing setup"
next_study: "5-user think-aloud, invoice entry; behavioural · qualitative · formative"
```

**c11. `redesign.md` §2 Audit.** Add a bullet: "**Usability debt**: screen-only rule failures for the platform, each with `file:line` and rule id, next to the tells under Retire."

---

## d. New question-bank boards

These use the same format as `question-bank.md`. **Proposed order:** intent → `intent-problem` → `principles` (when trade-offs are live) → structure boards (`ia-structure`, `status-feedback`, `recovery`, and `autonomy-approval` / `ai-transparency` on agent surfaces) → `intent-dials` → the visual levers → detail. This puts structure before look, which is what the Elvanti creator asked for and what NN/g recommends.

### intent-problem
- **Asks:** What's costing the user today, and how do we know?
- **Applies:** always, unless the conversation already has an evidenced problem (then it is stated in the Design Read and skipped).
- **Facets:** problem statement · evidence class (observed / heuristic / assumed) · who it hurts most (Learner / Legend / Legacy)
- **Writes:** `intent.problem`, `intent.problem_evidence`
- **Reference:** none
- **Source:** https://www.nngroup.com/videos/stop-solutioneering/, https://www.nngroup.com/articles/complex-apps-users/

### principles
- **Asks:** When these goals conflict, which wins?
- **Applies:** a product-level or long-lived scope, or any session with live trade-offs.
- **Facets:** 3–7 statements, each naming a pole ("status over silence", "convention over novelty", "dense over airy for experts")
- **Options:** 2–3 principle sets that differ on at least two poles.
- **Writes:** `principles:` (cited later by recommendations)
- **Reference:** none
- **Source:** https://www.nngroup.com/videos/design-principles-101/, https://www.nngroup.com/articles/design-guidance/

### ia-structure
- **Asks:** What are the sections, how are information and actions grouped, and who sees what?
- **Applies:** page, app or TUI scope with more than one view or role.
- **Facets:** section model (task-led / object-led / role-led) · action placement (inline / toolbar / palette / drawer) · access (roles, minimum necessary) · nav pattern for the depth
- **Writes:** `ia.sections`, `ia.grouping`, `ia.access`, `tokens.layout.nav`
- **Reference:** quick clickable wireframe per option · deep clickable build with real labels
- **Source:** https://www.nngroup.com/articles/ia-vs-navigation/, Luna notebook `nb-luna-elvanti-structure-before-look-001`

### status-feedback
- **Asks:** How does the system tell the user what it's doing?
- **Applies:** any operation over 1 s, agent runs, background work, multi-pane views.
- **Facets:** acknowledgement style · long-wait pattern (counter / step checklist / items-as-completed) · stop affordance · return summary · indicator vs notification policy
- **Writes:** rules `status-at-trigger`, `long-wait-pattern`, `notification-policy`
- **Reference:** quick a timed demo of the slowest real operation in each pattern · deep interactive with a stop key
- **Source:** https://www.nngroup.com/articles/response-times-3-important-limits/, https://www.nngroup.com/articles/indicators-validations-notifications/

### recovery
- **Asks:** When something goes wrong or gets undone, what happens?
- **Applies:** any scope with destructive actions, forms or failures.
- **Facets:** undo vs confirm policy · undo window · error placement (inline / summary + inline) · error voice (terse / guiding) · draft persistence
- **Writes:** rules `undo-over-confirm`, `error-anatomy`, `preserve-input`; `voice.errors`
- **Reference:** quick the real form's error state written three ways · deep live delete-with-undo
- **Source:** https://www.nngroup.com/articles/user-control-and-freedom/, https://www.nngroup.com/articles/error-messages-scoring-rubric/

### autonomy-approval
- **Asks:** What may the agent do on its own, and where does it stop to ask?
- **Applies:** agent surfaces that act (write files, call APIs, spend, deploy).
- **Facets:** autonomy per task class (read / write local / external / irreversible) · gate placement · card anatomy density · default focus · substitution policy
- **Writes:** `agent.autonomy`, rules `decision-card-anatomy`, `no-silent-substitution`
- **Reference:** quick a real pending decision as a card in each option · deep interactive card with Edit / Take over
- **Source:** https://www.nngroup.com/articles/designing-ai-agents/, https://www.nngroup.com/articles/impressions-chatgpt-agent/, https://developer.apple.com/design/human-interface-guidelines/generative-ai

### ai-transparency
- **Asks:** How visible should the AI's involvement, sources and work be?
- **Applies:** any surface showing generated content.
- **Facets:** AI label style · citation density (inline chips / footnotes) · show-the-work (collapsed / expanded / on demand) · confidence display · status voice (factual / persona-in-tone)
- **Writes:** `agent.disclosure`, `agent.citations`, `voice.status`
- **Reference:** quick a real answer rendered three ways
- **Source:** https://www.nngroup.com/articles/explainable-ai/, IBM Carbon AI label guidelines, Luke Wroblewski's Durable Patterns

### terminal-chrome
- **Asks:** What's always on screen in the terminal?
- **Applies:** CLI or TUI scope.
- **Facets:** status line content · key-hint footer (always / on `?` / contextual) · color strategy under 16 colors and NO_COLOR · glyph set (ASCII-safe / Unicode / Nerd Font) · width target (80 / 100 / fluid)
- **Writes:** `tokens.tui.*`, rules `tui-status-line`, `no-color-legible`
- **Reference:** quick a real view rendered as text at 80 columns, color and NO_COLOR · deep a recorded asciicast
- **Source:** rules.yaml `tui` space. Pending: clig.dev.

### accelerators
- **Asks:** How do experts go fast without stranding newcomers?
- **Applies:** tools used daily (TUI, dashboards, editors).
- **Facets:** palette (yes / no) · shortcut reveal (inline hints / after slow-path use / cheat sheet) · customisation · slash commands
- **Writes:** `keymap`, rule `accelerators-duplicate-a-visible-path`
- **Reference:** quick a real menu with shortcuts shown each way
- **Source:** https://www.nngroup.com/articles/ui-accelerators/

### data-encoding
- **Asks:** Is this dashboard for glancing or for studying, and how are numbers drawn?
- **Applies:** dashboards and analytics views.
- **Facets:** operational vs analytical · chart vocabulary (bars / lines / sparklines / tables) · alert encoding (glyph + color) · density
- **Writes:** `dashboard.kind`, rule `quantities-by-length-or-position`
- **Reference:** quick the real metrics in each vocabulary
- **Source:** https://www.nngroup.com/articles/dashboards-preattentive/

### voice-commands
- **Asks:** Which few things must voice do perfectly at launch?
- **Applies:** voice scope.
- **Facets:** command set (5–8) · confirm pattern for irreversible actions · answer length · screen echo
- **Writes:** `voice.commands`, rule `voice-confirm-and-echo-irreversible`
- **Reference:** quick a scripted transcript per option
- **Source:** https://www.nngroup.com/articles/intelligent-assistants-poor-usability-high-adoption/

**Change to `microcopy`:** add the facet "error and empty-state anatomy" and point it at `errors-say-what-why-fix`.

---

## e. Second-round reading list, ranked

Ranked by (gap size × how much of Atelier's real work it touches) ÷ effort. Each entry names the rules it would firm up.

1. **clig.dev (Command Line Interface Guidelines)**, plus no-color.org and the Charm / Bubble Tea / Lip Gloss conventions. This is the biggest gap. Paradigm, Gnomon and Claude Code are terminal-first, and all four `tui` rules are currently NN/g extrapolations. Firms up: `tui-*`, `cli-*`, `terminal-standard-keys-preserved`. Effort: small (one site).
2. **WCAG 2.2 quick reference and the WAI-ARIA Authoring Practices Guide.** Turns the accessibility rules from report summaries into primary-source checks, and gives keyboard patterns for composite widgets (menus, tabs, grids, comboboxes) that no report covered. Mika has WCAG notebooks but no APG. Firms up: `keyboard-focus-and-names`, `semantic-structure-for-machines`, `targets-sized-and-placed`. Effort: medium.
3. **Microsoft HAX: the 18 guidelines and the HAX playbook** (Amershi et al., CHI 2019). This is the evidence-based backbone for the `ai-agent` space; 01 read only the landing page. Expect 3–5 new rules (for example "make clear how well the system can do what it can do", "remember recent interactions", "notify users about changes"). Effort: small.
4. **Google PAIR Guidebook, all chapters.** Only "Errors + Graceful Failure" was read. Mental models, explainability and trust, and feedback and control map onto `capabilities-and-limits-up-front`, `explain-by-sources-not-narration` and `generated-output-is-correctable`. Effort: medium.
5. **Content design: GOV.UK content design manual and GOV.UK Design System patterns (forms, errors, validation); NN/g UX-writing study guide; Podmajersky, *Strategic Writing for UX*.** The `content` space is the thinnest (4 rules) and is research-backed in GOV.UK's case. Firms up: `errors-say-what-why-fix`, `speak-the-users-language`, `write-for-scanning`; likely adds empty-state and button-label rules. Effort: medium.
6. **IBM Carbon, Carbon for AI (AI label, explainability), plus its data-visualisation and content guidance.** Primary source for `disclose-ai-involvement` (01 cited it secondhand), and a production-grade data-viz system. Effort: small to medium.
7. ***Refactoring UI*** (Wathan & Schoger, book). Practical visual rules on spacing, hierarchy without size, and color for UI. This deepens the visual eye where NN/g is generic and where Atelier's creators actually push. Firms up: `group-by-space-before-boxes`, `limited-type-scale`, `one-dominant-focal-point`. Effort: small.
8. **Apple HIG, full: interaction sections** (navigation, modality, feedback, onboarding, entering data). Mika's HIG notebooks cover visual and platform tokens, not flows. Firms up: `every-state-has-an-exit`, `follow-platform-conventions` for app. Effort: medium.
9. **Material 3: interaction and states** (state layers, navigation, dialogs, snackbars). The same gap as HIG; Mika's M3 notebooks are token-heavy. Effort: medium.
10. **Data visualisation: Tufte, *The Visual Display of Quantitative Information*; Few, *Information Dashboard Design*; Datawrapper's chart guides.** Needed before Atelier does more dashboards (the Elvanti ops and KPI sessions already did). Effort: medium.
11. **NN/g sub-study guides: psychology, design-pattern guidelines, visual design.** Recommended by 03. Diminishing returns after items 1–10, since NN/g already dominates the rulebook. Effort: medium.

Out of scope for now: XR, career and portfolio material, the bootcamp article layer, and anything reachable only through the hendurhance mirrors.

---

## f. Pushback on the research

1. **Same-model "independent evaluators" (04 §5).** NN/g's 3–5 evaluators work because humans miss different things. Isolated subagents from one model share blind spots. The playbook allows independent agent passes but never counts them as the 3–5, and prefers different models or personas. Calibration (Loid) should measure the overlap.
2. **Banned status verbs (04:R7).** Grepping for "thinking" is too blunt for an agent-harness product. Claude Code itself shows "Thinking", and Gnomon has a persona. The durable part is Turpin et al.: don't present reasoning traces as faithful. The verb ban is NN/g opinion. I kept it as a `warn`, aimed at capability claims ("I understand"), not at "Thinking…".
3. **The clarifier cap of 4 (04:R9) is circular evidence.** NN/g endorsed it because Claude's AskUserQuestion has that cap. It is a fine default, but it is not independent support for our own tool's design. It is tagged `nng-opinion`.
4. **Numeric visual budgets (03:V2, V3).** "3 type sizes, 2+2 colors" are teaching heuristics. Luna's notebooks show the Elvanti creator choosing livelier and more expressive options repeatedly. These rules are `warn` and overridable, never `fail`.
5. **NN/g functionalism vs the creator's taste.** "You can't impose joy" undervalues aesthetic-usability effects and emotional design, which Norman himself wrote about. The reconciliation is in `decoration-must-communicate` and the new `nb-luna-character-is-not-decoration` notebook.
6. **Factual errors to correct before citing.** 01#6 calls 44 px "WCAG 2.5.5"; that is AAA, and AA is 2.5.8 (24 px). Mika's review-checklist repeats the 44 px figure as the floor (see b, Mika change 2). 01#7's "~7 options" threshold is itself Miller-flavoured; I kept the check and dropped the number.
7. **Tog's 50 ms (02#1).** An agent can't measure it from a screen recording, and it conflicts with NN/g's 0.1 s. Standardise on 0.1 s.
8. **Yocco's thresholds** (85% accept, 5% revert → disable) are unsourced. They are hypotheses for the calibration loop, not rules. 01 already flagged this; I agree.
9. **Context-architecture rules (04:R16, R17)** are partly Workshop product requirements rather than general UX. I kept one merged rule (`context-and-memory-legible`) because it is genuinely IA, but its line-budget detail belongs in the Gnomon spec, not the global rulebook.
10. **Several sources lack deep URLs.** The reports named about 15 pages (Tog, NN/g Sketch Test, Design Critiques, Microinteractions, Carbon AI label, LukeW, Wattenberger, Yocco, MeasuringU, digital.gov) without recording the URL. `rules.yaml` marks each as "deep URL not captured". Verify them before adoption rather than guess them.
