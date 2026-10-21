# Formats

Repo footprint:

```
.atelier/
├── design-system.yaml     ← Mika writes (the system; enforced by `atelier check`)
├── DESIGN.md              ← Luna writes (narrative, generated from the yaml + decisions)
├── inventory.html|json    ← `atelier system extract` (what the code uses; regenerate freely)
├── specimen.html          ← `atelier system specimen` (+ specimen-frame.html)
└── sessions/<YYYY-MM-DD>-<slug>/
    ├── session.yaml       ← Luna writes (the decision record)
    └── refs/              ← reference renders (gitignored)
```

A repo with several products declares them, and each gets the same set
of files in its own folder:

```
.atelier/
├── systems.yaml           ← the product index (`atelier system init`)
├── design-system.yaml     ← optional repo-wide base every product inherits
├── DESIGN.md
├── systems/<product>/
│   ├── design-system.yaml ← the product's layer (merged over the base / `extends`)
│   ├── DESIGN.md
│   └── inventory.html, specimen.html
└── sessions/…             ← session.yaml records `product:`
```

```yaml
# systems.yaml
version: 1
products:
  console: { name: Gnomon console, paths: [packages/gnomon-gui] }
  mods:    { name: Mods, paths: [packages/gnomon-mods], extends: console }
  site:    { name: Site, paths: [packages/site], extends: none }   # skips the base
```

A file belongs to the product whose `paths` hold it (longest prefix
wins). Outside every product, the repo-wide base applies. A package can
also carry its own `.atelier/`; the nearest one up from a file wins.
`atelier system which <file>` answers it.

## session.yaml

```yaml
id: 2026-10-06-settings-page
verb: direct              # direct | critique | system (codify = system)
scope: "Settings page (src/app/settings/)"
product: billing          # multi-product repos: the product from .atelier/systems.yaml
depth: quick              # quick | deep
surface: terminal         # terminal | preview
mode: preserve            # greenfield | preserve | overhaul (redesign.md); direct/critique only
read: "Settings for a B2B billing tool, used by finance admins weekly; calm, exact, a little warmer than the rest of the app."
audit:                    # redesign modes only (redesign.md §2)
  dials: { layout: 3, motion: 2, density: 6 }
  keep: ["inline validation on the tax-ID field"]
  retire: [{ tell: radius-drift, where: "src/app/settings/BillingCard.tsx:41" }]
  load_bearing: ["/settings/billing route", "data-track=save-billing"]
started: 2026-10-06T14:02:00Z
boards:
  - id: type-voice
    question: "What should the type voice be?"
    options:
      - id: grotesk-pair
        label: Grotesk display + humanist body
        description: Tight grotesk display, open humanist body for long forms.
        recommended: true
        why: "Matches the home studio's grotesk; the humanist body reads well in dense forms."
        writes: { tokens: { font.display: "Instrument Sans", font.body: "Public Sans" } }
        facets: [display-face, body-face, weight-contrast]
        concerns: []                       # Mika's flags, if any
        tells: []                          # tells.yaml ids this option trips (shown on the option)
      - id: single-family
        label: One family, weight contrast
        description: One variable sans; hierarchy from weight + size.
        writes: { tokens: { font.display: "Public Sans", font.body: "Public Sans" } }
        facets: [display-face, body-face, weight-contrast]
    references_rendered: [grotesk-pair]
    decision:
      kind: mix                            # pick | mix | skip
      choice: { display-face: grotesk-pair, body-face: single-family }
      decided_by: creator                  # creator | recommendation
      notes:
        - "headlines can go tighter than this"
closed: null
summary: null
```

## design-system.yaml

Version 2 adds layers to version 1. Both are read: `foundations` is v2's
name for `tokens`.

```yaml
version: 2
read: "Control room for an agent armada's source control; calm, exact."
foundations:                 # = v1 tokens
  color: { ink: "#16150f", paper: "#ede8dc", accent: "#44577c" }
  font: { chrome: "Inter", bytes: "JetBrains Mono" }
  type: { sizes: [10.5, 12, 14, 18] }      # or { base, scale }
  space: { scale: [2, 4, 6, 8, 12, 16, 24] }
  radius: { sm: 2, pill: 999 }
components:
  chip:
    role: "Compact status or fact in the header and tool rows; never a button."
    anatomy: [dot, label]
    variants: { status: "connected / not connected", fact: "one live fact" }
    sizes: { compact: { height: 18, font: 10.5 } }
    states: [default, warning, disabled]
    tokens: { border: "--rule", text: "--sec" }
    source: packages/gnomon-gui/static/styles.css
    examples:                # state → real markup; rendered on the specimen
      default: '<span class="chip">connected</span>'
    from: { session: 2026-10-21-system, board: component-canon }
zones:
  header:
    surface: main window
    holds: ["⌘K palette", "voice indicator"]
    never: [notices, settings, layout controls]
    overflow: "Everything else lives in the palette; nothing wraps."
content:
  vocabulary:
    use: { run: "one agent working on one task" }
    retired: { job: run }    # `atelier check` fails retired words in UI copy
  voice: ["Name the state plus one live fact.", "No emoji in labels."]
specimen:
  stylesheets: [packages/gnomon-gui/static/styles.css]
  themes: { day: { html_attrs: 'data-theme="day"' }, night: { html_attrs: 'data-theme="night"' } }
migration:                   # drift the system decided to remove
  - { from: "font-size 11px", to: "10.5", uses: 42, files: [packages/gnomon-gui/static/styles.css] }
# rules, preserve, tells, overrides, decisions: as in v1 below
```

Version 1 (still valid):

```yaml
version: 1
extends: home                # inherit the home studio cascade; omit for repo-only
read: "Settings for a B2B billing tool, used by finance admins weekly; calm, exact, a little warmer than the rest of the app."
dials: { layout: 3, motion: 2, density: 6, from: { session: 2026-10-06-settings-page, board: intent-dials } }
tokens:
  color: { ink: "#17191c", paper: "#f5f6f7", accent: "#2457d6" }
  font: { display: "Instrument Sans", body: "Public Sans" }
  type: { base: 16, scale: 1.25 }
  space: { scale: [4, 8, 12, 16, 24, 32, 48, 64] }
  radius: { sm: 4, md: 8 }
  motion: { ease.standard: "cubic-bezier(.2,.7,.2,1)", duration.base: 180 }
rules:
  - id: no-pure-black
    check: color-literal-forbidden
    args: { values: ["#000", "#000000"] }
    from: { session: 2026-10-06-settings-page, board: color-temperature, note: "never pure black" }
  - id: spacing-on-scale
    check: spacing-off-scale
    from: { session: 2026-10-06-settings-page, board: density }
preserve:                    # never changed silently (redesign.md §3)
  - { what: route, value: "/settings/billing" }
  - { what: analytics, value: "data-track=save-billing" }
  - { what: form-fields, value: "billing form field names + order" }
tells:
  severity: { em-dash: fail }  # per-repo severity changes
overrides:                   # tells deliberately allowed here
  - tell: default-neutral-sans
    scope: product
    reason: "Product UI stays neutral; brand voice lives in marketing."
    from: { session: 2026-10-06-settings-page, board: type-voice }
decisions:
  - session: 2026-10-06-settings-page
    board: type-voice
    choice: { display-face: grotesk-pair, body-face: single-family }
    notes: ["headlines can go tighter than this"]
```

Every token, component, zone, rule, preserve entry and override must
trace to a decision (`from`), to the extract (`from: { extract: <date> }`,
confirmed by the creator), or to `extends: home`. `check` ids enforced by
`atelier check`: `color-literal-forbidden`, `color-off-palette`,
`font-forbidden`, `font-off-system`, `type-off-scale`,
`spacing-off-scale`, `radius-off-scale`, `easing-forbidden` (retired
words are always checked). Off-system checks default to `warn`, forbidden
ones to `fail`; set `severity:` to change it. Rules with no check id are
agent-enforced guidance.

Tells (`tells.yaml`) apply to every repo without being listed here; this
file only records changes to them: `tells.severity` raises or lowers one,
`overrides` switches one off for a scope with a reason. `atelier check`
runs the mechanical tells (detect kind `count`, `literal`, `pattern`)
alongside the rules; the rest are checked by Mika in vetting and finish
reviews.

Example values above are illustrations, not defaults. Never copy them
into a real system without a decision behind them.
