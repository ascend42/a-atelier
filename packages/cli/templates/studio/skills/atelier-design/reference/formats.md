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
started: 2026-10-06T14:02:00Z
boards:
  - id: type-voice
    question: "What should the type voice be?"
    options:
      - id: editorial-serif
        label: Editorial serif + grotesk
        description: High-contrast serif display, neutral grotesk body.
        recommended: true
        why: "Matches the home studio's editorial register."
        writes: { tokens: { font.display: "Fraunces", font.body: "Inter" } }
        facets: [display-face, body-face, weight-contrast]
        concerns: []                       # Mika's flags, if any
      - id: single-family
        label: One family, weight contrast
        description: One variable sans; hierarchy from weight + size.
        writes: { tokens: { font.display: "Inter", font.body: "Inter" } }
        facets: [display-face, body-face, weight-contrast]
    references_rendered: [editorial-serif]
    decision:
      kind: mix                            # pick | mix | skip
      choice: { display-face: editorial-serif, body-face: single-family }
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
tokens:
  color: { ink: "#141414", paper: "#f6f3ee", accent: "#d6451b" }
  font: { display: "Fraunces", body: "Inter" }
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
decisions:
  - session: 2026-10-06-settings-page
    board: type-voice
    choice: { display-face: editorial-serif, body-face: single-family }
    notes: ["headlines can go tighter than this"]
```

Every token and rule must trace to a decision (`from`) or to
`extends: home`. Known `check` ids (enforced by `atelier check` once it
ships): `color-literal-forbidden`, `spacing-off-scale`, `font-forbidden`,
`easing-forbidden`, `type-off-scale`. Rules with no check id are
agent-enforced guidance.
