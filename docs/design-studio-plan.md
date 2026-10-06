# Atelier Design Studio — Plan

> **Status:** Draft — owner-approved direction 2026-10-06
> **Scope:** Turn Atelier into a portable design studio that can be invoked in *any* repo to critique, revise, and codify design — with a direction process that is entirely Atelier's own.

## Why

Atelier v2 already owns design direction for video (DESIGN.md / brand cascade / Quill · Lux · Iris). The same knowledge — taste, references, rules — should apply to product UI in any repo.

The Impeccable skill is the inspiration and the foil. What we keep and what we change:

| | Impeccable | Atelier |
|---|---|---|
| Questions | Many, answered in prose | Many — each one can be backed by a rendered reference |
| What you react to | Adjectives, named "worlds" | Your own UI, assets, plan, and footage |
| Answer shape | Pick one | Pick · mix & match · annotate with notes |
| Design system | Documented *after* the build | Written *as you decide*, then enforced |
| Taste memory | Starts from zero per repo | Inherits the creator's Atelier brand cascade |
| Surface | Terminal | Local preview server (browser) + terminal |

## The three verbs

| Verb | What it does | Output |
|---|---|---|
| **critique** | Reviews existing UI (code, routes, screenshots) against the repo's design system — or flags that none exists. | Ranked findings, each with a reference render on demand |
| **direct** (default) | Runs a direction session, then drives a revision: decide → (comp) → build → finish review. | Decisions + draft system + implemented revision |
| **codify** | Creates or extracts the design system and installs enforcement. | `.atelier/design-system.yaml`, `DESIGN.md`, checks |

`direct` and `codify` share the same session engine; `codify` simply stops once the system is written and enforcement is installed.

## The crew

All design work runs through a pair: **Luna** directs, **Mika** engineers.

| | Luna — Design Director (new, Atelier) | Mika — Design Engineer (existing, `~/.paradigm/agents/designer.agent`) |
|---|---|---|
| Owns | The `atelier design` session: scoping, which boards to ask, generating per-repo options, composing mix & match results, interpreting notes | `.atelier/design-system.yaml`: tokens, rules, checks, component contracts |
| Taste source | Home studio brand cascade + reference library; the creator's past sessions | The repo's actual code, tokens, and platform guidelines (HIG, Material, WCAG) |
| Produces | Boards, options, reference renders, the decision record | The codified system, enforcement, implemented revisions |
| In critique | Judgment: hierarchy, rhythm, voice, whether it *feels* on-brand | Rule checks + craft: contrast, spacing scale, a11y, token drift |

**Handoffs:**

1. Before a session, **Mika briefs Luna** on what exists — current tokens, components, actual vs. aspirational patterns — so options are grounded in the repo's reality.
2. During a session, **Mika vets Luna's options** for feasibility and accessibility before they're published (an option that fails contrast never reaches a board, or ships flagged).
3. After each decision, **Mika writes it into the system** — tokens, rules, provenance.
4. On build (`direct`), **Mika implements; Luna runs the finish review** against the decisions.
5. **Disagreements** (e.g. Luna wants a thin display weight Mika flags for legibility) surface to the creator as an annotated choice — never silently resolved.

**Video:** Luna coordinates with **Lux** (Cinematographer) on caption / transition / pacing boards; Lux owns those options and their Hyperframes references.

Luna gets a canonical definition at `~/.paradigm/agents/luna.agent` (+ notebook) and an `atelier-luna` agent file shipped with the `atelier-design` skill, mirroring how Quill / Lux / Iris are set up.

## Invocation in any repo

Everything lives under one umbrella: **`atelier design`**.

```sh
atelier design                      # start a direction session in the current repo
atelier design --deep               # skip the depth prompt
atelier design critique [path|url]  # design review
atelier design codify               # build/extract the design system + enforcement
```

### Natural-language kickoff (primary entry point)

The CLI is the plumbing; the expected way in is just asking the agent:

```
can we use atelier design for this?
let's atelier design the settings page
run an atelier design critique on the dashboard
```

This works through an **`atelier-design` skill** installed at user level (`~/.claude/skills/`, or via the Atelier plugin), so it's available in every repo without per-repo setup. Its description triggers on "atelier design" and close variants.

When triggered, the skill kicks off the session properly:

1. **Resolve the verb** from the request and conversation — critique, direct (default), or codify. "For this" binds the session's scope to whatever the conversation was working on (a page, component, feature, or plan).
2. **Load context** — home studio cascade, repo `.atelier/` (if any), existing UI/tokens, and the in-flight plan or spec.
3. **Ask depth** — Quick or Deep (a single question in the terminal; skipped if the user already said "deep" / "quick").
4. **Start the preview server** in the background (`atelier design --serve`, reusing a running one) and give the user the URL.
5. **Publish the first boards** for the scoped area and wait for decisions over MCP.
6. **Hand back** — when the session closes, summarize decisions, update `.atelier/design-system.yaml`, and continue the original task under the new system.

`atelier setup` installs (or updates) the skill and the MCP server registration once per machine.

**Terminal mode (until the preview server ships):** the skill runs the same flow in the terminal — boards via AskUserQuestion with all options listed and the recommendation first, references written as local HTML under `.atelier/sessions/<id>/refs/` only when the creator says "show me". When `atelier design --serve` exists, the skill switches to the preview server automatically.

**Home studio:** `~/.atelier/config.yaml` points at the creator's Atelier workspace. Its `_brand/` cascade is the base layer for every repo; the repo's own system overlays it using the existing cascade-merge rules (scalars override, lists extend, maps override-at-key).

**Repo footprint:**

```
<any-repo>/
└── .atelier/
    ├── design-system.yaml     ← machine-readable tokens + rules (enforced)
    ├── DESIGN.md              ← human-readable, generated from the yaml + decisions
    ├── sessions/
    │   └── 2026-10-06-design/
    │       ├── session.yaml   ← depth, questions asked, decisions, notes
    │       └── refs/          ← cached reference renders (gitignored)
    └── checks.yaml            ← which enforcement checks are on
```

## Session model

### 1. Depth — chosen per session

- **Quick** — references are light: static restyles of existing screens/components.
- **Deep** — references are rich: built prototype components, interactive states, rendered motion clips, video snippets.

Depth can be changed mid-session; it only changes *what a reference render contains*, never the flow.

### 2. Boards — options always visible, references on demand

Each question is a **board**. A board always shows **all of its options immediately** as cards: name, short description, the tokens/rules it would write. Nothing is rendered yet.

Each board has a **See reference** button. Only when pressed does Atelier render the specimens for that board's options. This keeps the session decision-led: you read the options, and look only when you need to see them.

Renders are cached per session, so toggling back costs nothing.

### 3. Decision shape

For every board the creator can:

1. **Pick** one option.
2. **Mix & match** — take facets from several options ("A's type scale, C's weight contrast"). Atelier composes a merged option, shows it as a new card (renderable like any other), and asks for confirmation.
3. **Annotate** — free-text notes on the board or on a specific option ("warmer than this", "never pure black"). Notes are preserved verbatim and compiled into rules where they're rule-shaped.
4. **Skip / defer** — leave it to the agent's recommendation (marked as such in the system, so it's revisitable).

### 4. Live system panel

A side panel shows the draft design system filling in as decisions land — every token/rule links back to the board + decision (and note) that produced it.

### 5. Agent sync

Decisions stream over the existing studio WebSocket to the MCP surface. The Claude session reads structured decisions, not a paraphrase of what the creator typed.

## Question bank

Boards come from a question bank, filtered to what's relevant for the repo (a CLI-only repo never sees "hero layout"; a video project gets caption/transition boards).

```yaml
# packages/studio-direction/bank/typography.yaml (sketch)
id: type-pairing
group: typography
asks: "What should the type voice be?"
applies_when: [has-ui]
options:
  - id: editorial-serif
    label: Editorial serif + grotesk
    description: High-contrast serif display, neutral grotesk body.
    writes:
      tokens: { font.display: "<serif candidate>", font.body: "<grotesk candidate>" }
  - id: single-family
    label: One family, weight contrast
    description: One variable sans; hierarchy from weight + size only.
    writes:
      tokens: { font.display: "<sans>", font.body: "<sans>" }
reference:
  quick: restyle          # re-render existing headings/body with the option's tokens
  deep: specimen-page     # build a full type specimen using real copy from the repo
facets: [display-face, body-face, scale-ratio, weight-contrast]   # mix & match units
```

Initial groups: **intent & audience · typography · color · density & spacing · layout · shape & depth · motion · iconography & imagery · voice & microcopy · (video) captions · transitions · pacing**.

Options are **generated per repo**, seeded by the bank but adapted to what the agent has read (existing tokens, brand cascade, references) — the bank defines *what to ask and how to render it*, not a fixed menu of worlds.

## Reference (specimen) pipeline

When **See reference** is pressed:

1. **Source material**, in priority order:
   1. **Existing UI** — real routes/components in the repo, run or rendered in isolation.
   2. **Planned UI** — components described in specs/plans, built as throwaway prototypes.
   3. **Synthesized UI** — a representative component built from the tokens decided so far.
   4. **Studio taste** — brand cascade + reference library from the home studio.
2. **Render kind** (by board + depth):
   - `restyle` — existing screen with the option's tokens applied (CSS variable override in an isolated frame).
   - `component` — a generated prototype component, interactive.
   - `specimen-page` — a composed sheet (type specimen, palette-in-context, spacing ladder).
   - `motion` — a 2–3 s clip of real UI moving with the option's motion tokens.
   - `video` — a short Hyperframes render using the creator's footage + cascade.
3. **Isolation** — references never modify repo source. They render in sandboxed iframes from `.atelier/sessions/<id>/refs/`.
4. **Cache** — keyed by (board, option, tokens-hash, depth).

## Design system format

`.atelier/design-system.yaml` is the source of truth; `DESIGN.md` is generated from it plus the session's decisions and notes.

```yaml
version: 1
extends: home            # inherit the home studio brand cascade
tokens:
  color:
    ink: "#141414"
    paper: "#f6f3ee"
    accent: "#d6451b"
  font:
    display: "..."
    body: "..."
  space: { scale: [4, 8, 12, 16, 24, 32, 48, 64] }
  radius: { sm: 4, md: 8 }
  motion: { ease.standard: "cubic-bezier(.2,.7,.2,1)", duration.base: 180 }
rules:
  - id: no-pure-black
    from: { session: 2026-10-06-design, board: color-temperature, note: "never pure black" }
    check: color-literal-forbidden
    args: { values: ["#000", "#000000"] }
  - id: spacing-on-scale
    check: spacing-off-scale
  - id: no-bounce
    check: easing-forbidden
    args: { patterns: ["bounce", "elastic"] }
decisions:              # provenance — every token/rule traces back here
  - board: type-pairing
    choice: { mix: { display-face: editorial-serif, scale-ratio: single-family } }
    notes: ["headlines can go tighter than this"]
```

## Enforcement

The system only matters if agents follow it.

- **`atelier check`** — runs the enabled checks (`checks.yaml`) against changed files: off-palette color literals, off-scale spacing, forbidden fonts, forbidden easings, ad-hoc components that duplicate system ones. Each finding cites the rule and its originating decision.
- **Hook** — installed by `codify`: a Claude Code Stop / post-write hook runs `atelier check` on touched files (advisory first; blocking opt-in).
- **Agent context** — the plugin skill loads the effective system (home cascade + repo overlay) into the agent's context before any UI work.
- **critique** uses the same checks plus agent judgment for things checks can't catch (hierarchy, rhythm, clarity).

## Preview server

Extend `atelier studio` (Vite + WebSocket + MCP transport already in `packages/cli/src/commands/studio.ts`) with a **Direction** mode rather than a new server.

- Route: `/direction/<session-id>`
- WS messages: `board.publish`, `reference.request`, `reference.ready`, `decision.submit`, `note.add`, `system.update`, `depth.set`
- MCP tools (new): `atelier_session_start`, `atelier_board_publish`, `atelier_reference_render`, `atelier_decisions_get`, `atelier_system_get`, `atelier_system_write`

The agent publishes boards; the browser renders cards; reference requests round-trip to the agent (or a local render worker for `restyle`); decisions flow back.

## Milestones

1. **Session engine + Quick mode** — Luna persona (`luna.agent` + `atelier-luna`) wired to Mika, `atelier-design` skill + `atelier setup` install, question bank format, board UI with options visible, pick / mix & match / notes, `session.yaml`, live system panel. References: `restyle` only.
2. **Design system + codify** — `design-system.yaml` schema, DESIGN.md generation, cascade from home studio.
3. **Enforcement** — `atelier check` with the first checks (color literals, spacing scale, fonts, easing) + hook installer.
4. **Deep mode references** — `component`, `specimen-page`, `motion`; reference cache.
5. **critique** — findings with on-demand references.
6. **direct → build** — revision execution + finish review against the system.
7. **Video boards** — captions / transitions / pacing with Hyperframes `video` references.
8. **Plugin packaging** — Atelier plugin bundling skills, agents, and MCP registration (the user-level `atelier-design` skill lands in milestone 1).

## Open questions

- ~~Command naming~~ — resolved: `atelier design` umbrella + natural-language skill trigger.
- Where the home studio pointer lives, and what happens in a repo when no home studio is configured.
- Enforcement default: advisory vs blocking out of the box.
- ~~UI direction persona~~ — resolved: new persona **Luna**, paired with **Mika**.
- Coexistence with Impeccable during the transition (import an existing Impeccable DESIGN.md as a starting system?).
