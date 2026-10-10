# Formats

Repo footprint:

```
.atelier/
├── design-system.yaml     ← Mika writes (tokens + rules, enforced)
├── DESIGN.md              ← Luna writes (narrative, generated from the yaml + decisions)
└── sessions/<YYYY-MM-DD>-<slug>/
    ├── session.yaml       ← Luna writes (the decision record)
    └── refs/              ← reference renders (gitignored)
```

## session.yaml

```yaml
id: 2026-10-06-settings-page
verb: direct              # direct | critique | codify
scope: "Settings page (src/app/settings/)"
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

Every token, rule, preserve entry and override must trace to a decision
(`from`) or to `extends: home`. Known `check` ids (enforced by `atelier
check` once it ships): `color-literal-forbidden`, `spacing-off-scale`,
`font-forbidden`, `easing-forbidden`, `type-off-scale`. Rules with no
check id are agent-enforced guidance.

Tells (`tells.yaml`) apply to every repo without being listed here; this
file only records changes to them: `tells.severity` raises or lowers one,
`overrides` switches one off for a scope with a reason. `atelier check`
runs the mechanical tells (detect kind `count`, `literal`, `pattern`)
alongside the rules; the rest are checked by Mika in vetting and finish
reviews.

Example values above are illustrations, not defaults. Never copy them
into a real system without a decision behind them.
