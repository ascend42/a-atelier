# The `system` verb: define or extract a design system

Use it when the creator asks to create, extract, define, codify or
enforce a design system, or when a repo's UI has drifted far enough that
direction sessions keep re-deciding the same things. Mika leads the
work; Luna owns the taste calls and the narrative. The creator's time is
spent only on the decisions that are theirs. Everything else is drafted,
vetted and shown once for a bulk confirm.

The CLI does the counting (`atelier system …`, `atelier check`). The
agents do the reading, naming and judging.

## 0. Products

Many repos hold more than one product (a console, a marketing site, an
extension, a docs site). Each needs its own system, sometimes on a shared
base.

1. `atelier system list`. If products are declared, pick the ones in
   scope and skip to step 1.
2. Otherwise Mika maps the repo for product candidates: separate apps or
   packages with their own UI entry point, audience or brand. Signals:
   their own `index.html`/app shell, their own stylesheet or theme, a
   different audience in the README or specs.
3. One board, **products**: the proposed map (id, name, paths, and what
   they share). Recommend a shared base when the products share a brand
   (colour, type, voice) and differ in density or components. The creator
   confirms or corrects in one reply.
4. One product: no index needed (`.atelier/design-system.yaml`). Several:
   `atelier system init --product <id> --paths <a,b> [--extends <id>]` for
   each. Shared decisions go in `.atelier/design-system.yaml` (the
   repo-wide base). `extends: none` opts a product out of the base.

From here on, every step runs per product. Sessions record `product:`.

## 1. Extract (no creator time)

1. `atelier system extract --product <id>` (before `init`: `--paths a,b`).
   It writes `inventory.html` and `inventory.json` next to the product's
   system: every colour, family, size, spacing, radius, shadow and motion
   value with counts and `file:line`; tokens defined, unused and undefined;
   near-duplicate groups; components and class families; the copy.
2. Mika reads the code behind the numbers:
   - **Components**: each distinct component and what it is for, its
     variants and sizes, which ones are the same thing built twice (the
     class families with many classes and few uses are the usual
     suspects), and which states exist (default, hover, focus, selected,
     disabled, loading, empty, error).
   - **Zones**: per main screen, the regions (header, toolbar, sidebar,
     notices, settings) and what currently sits in each.
   - **Copy**: the working vocabulary, terms used two ways, retired terms
     still in the UI.
3. Luna reads what is already decided: the product's `DESIGN.md`,
   `design-system.yaml`, past sessions, and any design spec in the repo. A
   recorded decision outranks the majority in the code. A spec the repo
   names as the source of truth is preserved, and the system records
   decisions on top of it.

## 2. Draft (no creator time)

Mika drafts the product's `design-system.yaml` (v2 layers, see
`formats.md`) from the extract:

- In each near-duplicate group, the value with the most uses wins, unless
  a recorded decision or the platform convention says otherwise.
- Values go in three tiers. `foundations` holds the primitives (the
  colours, sizes and spacings the code really uses). `roles` names each
  job (`text.secondary`, `surface.raised`, `status.error`) and points at a
  primitive, with one value per theme: themes are modes of the same role
  names, not separate component sets. Components bind roles, never
  primitives or raw values. Name roles for the job, never the look
  (`gray-text` is a finding).
- Spacing gets a `base` unit (usually 4 or 8 px) and a scale of its
  multiples; the type scale is built from the body size.
- Each component gets a `kind` (input, informational, navigational,
  container), a role in one sentence, a `when_to_use` when another
  component of its kind looks alike, anatomy, variants, sizes, token
  bindings, its source file, and the states it can actually enter. Inputs
  cover default, hover, focus, active, disabled (saying why), loading
  (blocking a second submit), error (what failed and what next) and,
  where the flow has them, success and selected. Each state gets an
  `examples` entry using the real markup from the code.
- Page patterns the product repeats (a pricing table, a settings form, an
  empty state) are recorded with their order and rules, not just their
  components.
- Each zone gets `holds`, `never` and `overflow`.
- `content.vocabulary.use` gets the terms the product relies on, and
  `retired` gets the terms being phased out.
- `specimen.stylesheets` and `specimen.themes` point at the product's
  real CSS and theme switches, so the specimen renders the real thing.

Run `atelier system lint` on the draft and fix what it finds before the
creator sees anything: roles missing a theme, text on surface under
4.5:1 in a theme, references that loop or dangle, spacing off the base
unit, components bound to primitives, missing states.

Every entry carries `from:`, either `{ extract: <inventory date> }` or the
decision it came from. Mark each entry `clear` or `contested`. Contested
means the code splits roughly evenly, the majority contradicts a recorded
decision, or the choice changes how the product feels. Vet the draft
with Mika's `ui-build-protocol` and `review-checklist` as if it were
built: contrast in every theme, target sizes, states, narrow widths.

## 3. Reconcile with the creator

This is the only step that needs the creator.

1. **One summary**, in the terminal or on the session surface:
   ```
   Gnomon console — from 52 UI files
   Adopted as-is: 31 tokens, 6 components, 3 zones, 14 vocabulary terms
   Needs you: 5 decisions (below)  ·  Inventory: <path to inventory.html>
   ```
   The creator can open the inventory, but isn't asked to review it.
2. **Boards only for contested entries**, ordered by what they cost users:
   zones and placement first, then component canon ("four chip styles:
   which one is the chip?"), then the type scale, spacing scale, colour
   roles and vocabulary. Each board shows the real instances (`file:line`,
   a capture of where each is used) and the "Now" beside 2–4 options, with
   one recommended. The usual board rules apply (distinctness, Mika vets,
   decisions recorded with provenance).
3. **Depth.** Quick: the top 3 contested decisions. The rest are decided
   by recommendation (`decided_by: recommendation`, revisitable). Deep:
   all of them.
4. **Bulk confirm** for the clear entries: one reply ("yes", or
   corrections as notes). Don't walk the creator through tokens one by
   one.
5. **Shared or product?** When the decision could apply to several
   products (a brand colour, a voice rule), ask once per session where
   such decisions go, not per decision.

## 4. Codify

1. Mika writes the final `design-system.yaml` for the product (and the
   base, for shared decisions). Each change that would alter existing UI
   goes in a `migration:` list: old value or component, new one, uses,
   files.
2. Luna writes the product's `DESIGN.md`: the read, the principles that
   arbitrate trade-offs, the zones in words, and links to the specimen.
3. `atelier system specimen --product <id>`, then open `specimen.html`. It
   shows foundations, every component in every state and theme rendered
   with the product's CSS, zones, content rules and rules. Ask once: "Is
   this your system?" Corrections are notes; re-render. A component state
   without an example is flagged on the page. Fill it before calling the
   component specified.

## 5. Enforce

1. `atelier system lint --product <id>` must pass (no fails), then
   `atelier check --product <id>`: mechanical rules (`type-off-scale`,
   `spacing-off-scale`, `radius-off-scale`, `color-off-palette`,
   `font-off-system`, `spacing-off-base`, the forbidden lists, retired
   words, raw values that equal a token, the mechanical tells). Report the baseline counts. Existing drift is the `migration:`
   list, not a reason to weaken the rules.
2. Offer the migration as its own `direct`-style task, done in batches by
   zone or component. Each batch goes through the UI gate's review. Never
   rewrite the product wholesale without the creator's yes.
3. With the creator's agreement, add a pointer to the repo's agent
   instructions (CLAUDE.md / AGENTS.md): which system governs which paths,
   "run `atelier check` on UI changes", and "new UI uses existing
   components and zones; a new pattern is proposed to the system first".
4. The global UI gate (installed by `atelier setup`) then holds every UI
   change in any session to the product's system through Mika's review.

## 6. Maintain

- **Contribution and retirement.** A new component or pattern is
  proposed to the system (kind, role, states, when to use), reviewed
  against the rules, and published with its specimen entry. A component
  being replaced is marked `status: deprecated` with `replaced_by`, and
  the migration list says where it is still used.
- **Overrides are a signal.** Repeated local overrides, or a component
  rebuilt by hand next to the system one, mean the system doesn't cover a
  real need. Report it to the creator as a gap, not only as a violation.
- **Token changes by risk.** A change to a primitive or role that many
  components use (the brand colour, the body size) needs the creator's
  yes with a rendered before/after specimen. A fix to one component's
  binding doesn't. Every change gets a line in the changelog.

- A review that finds a new pattern proposes it as a system addition
  (`ui-build-protocol` step 8) instead of letting it ship as a one-off.
- Re-run `atelier system extract` after big changes. The inventory's
  drift and near-duplicate counts should fall over time. A rising count
  is a finding for the next session.
- Regenerate the specimen whenever `design-system.yaml` changes.
