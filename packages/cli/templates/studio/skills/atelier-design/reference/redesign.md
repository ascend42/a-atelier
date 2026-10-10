# Redesign mode

Used by `direct` (and by `critique` when it hands off to `direct`) whenever
the scope already exists as working UI. Misreading the mode is the most
expensive mistake a redesign can make, so it's settled before any board.

Adapted from taste-skill's redesign protocol (github.com/leonxlnx/taste-skill,
MIT); the boards, provenance and preserve list are Atelier's.

## 1. Mode

| Mode | When | What boards may change |
|---|---|---|
| `greenfield` | Nothing exists yet, or the brand itself is changing | Everything |
| `preserve` | IA, content and brand are sound; the look is dated or inconsistent | Type, spacing, color calibration, motion. Structure only on request |
| `overhaul` | Structural visual debt (no system, broken mobile, incoherent pages) but the content and IA stay | Visual language freely; IA, routes and copy voice stay |

Infer it from Mika's brief and the request. If it's genuinely unclear, it
is the **one** scoping question: "Keep the current brand and evolve it, or
start the visual language fresh on the same content?" Record it as
`mode:` in `session.yaml`.

## 2. Audit (before options)

Mika's brief gets a redesign section. Show the creator only what changes
the conversation; keep the rest in `session.yaml` under `audit:`.

- **Tokens in use** — colors, type stack, radii, spacing, motion, logo
  treatment, as actually rendered (not as the config claims).
- **Current dials** — read the existing scope's layout, motion and density
  dials. They become the starting values for the dials board.
- **Keep** — what's doing work: signature interactions, a recognisable
  hero, copy voice, accessibility wins (focus states, alt text, keyboard
  nav, contrast).
- **Retire** — tells from `tells.yaml` found in the scope, broken layouts,
  dead links, generic imagery, performance traps. Each with `file:line`.
- **Load-bearing names** — route slugs, anchor ids, nav labels, form field
  names, analytics event names and the ids/classes they hook into. Find
  them in code (router config, analytics calls, `data-*` attributes).
- **SEO surface** (public pages) — titles, meta descriptions, OG cards,
  structured data, H1s on ranking pages.

## 3. Never change silently

These are written into `design-system.yaml` as `preserve:` entries at
session open and hold for every later build in the repo:

- URL structure and route slugs
- Primary navigation labels
- Form field names and order
- Analytics event names and the selectors they depend on
- Logo and wordmark
- Legal, consent and cookie copy
- Public-page titles, meta and structured data

Changing one needs an explicit board answer, recorded with provenance like
any other decision. A finish review reports any unapproved change to a
`preserve:` entry as drift.

## 4. Board order by risk

In `preserve` mode, run the boards in this order and offer to stop after
each step ("that may be enough"):

1. **Type** (`type-voice`, `type-scale`): the biggest visible lift for the least risk.
2. **Spacing and rhythm** (`density`)
3. **Color calibration** (`color-temperature`, `color-accent`): keep the brand accent; unify neutrals.
4. **Motion** (`motion-personality`): only what the motion dial allows.
5. **Recomposition** (`layout-structure`): key sections only.
6. **Replacement**: a whole block replaced only when it can't be saved, and named as such on the option.

In `overhaul` mode, the order is the normal one, but every option shows
what it keeps from the `preserve:` list. In `greenfield` mode this file
doesn't apply.

## 5. References in redesign mode

"See reference" always shows **now vs. each option** on the same real
screen, so the creator judges the change, not just the new look.
