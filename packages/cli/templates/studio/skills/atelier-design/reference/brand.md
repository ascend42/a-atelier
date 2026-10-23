# The `brand` verb: a mark and its logo system

Use it when the creator asks for a logo, brand mark, rebrand, logo fix
or brand identity, for a product, a project or their home studio. The
process is distilled from Allan Peters's practice (neurons
`n:brand-noun-list`, `n:logo-exploration-funnel`,
`n:mark-from-brand-strategy`, `n:mark-quality-tests`,
`n:reduce-to-the-edge`, `n:hidden-second-read`,
`n:redraw-type-for-optical-balance`,
`n:keep-equity-when-redesigning-a-mark`, `n:logo-system-by-media-size`,
`n:test-marks-for-misreadings`).

Luna runs the conversation and the rounds; Mika draws, vectorizes and
builds the system. The creator's time goes to three things only: the
noun list, picking in each round, and the final yes.

## Where it lives

| Brand of | Folder |
|---|---|
| a repo (one product) | `.atelier/brand/` |
| a product in a multi-product repo | `.atelier/systems/<product>/brand/` |
| the home studio (inherited by every project) | `<workspace>/_brand/` |

Each holds `brand.yaml` (see `formats.md`), `marks/` (SVG preferred) and
`brand.html` (`atelier brand sheet`). Exploration rounds live in the
session: `.atelier/sessions/<id>/refs/round-<n>/`. The kit feeds the
design system: `foundations.color` and `foundations.font` take the
brand's colour and type, and a home-studio brand's voice and palette
also go in `_brand/.atelier-brand.yaml` for Produce.

## 0. Scope

One line back to the creator: whose brand, and which kind.

- **new**: no mark yet.
- **refresh**: keep the mark's idea; fix drawing, balance, type.
- **redesign**: a new mark that keeps the old one's equity. List the
  equity first (what people already recognise: a shape, a colour, an
  angle) in `equity:`.

## 1. Strategy (no creator time unless it's missing)

Read the repo, README, product docs and the design system. Write
`strategy.truths`: 2–4 things that set the brand apart, each with its
evidence (a doc, the product itself, the creator's words). Add the
audience and 3–5 personality adjectives. Marks are derived from these
truths, not from the name's first letter (`n:mark-from-brand-strategy`).
If the truths can't be found, ask the creator one question for them.

## 2. Noun list (one exchange with the creator)

Luna proposes a long **brand noun list**: concrete subject matter drawn
from the truths, the name, the craft, the place and the people (for a
bear-and-houses equity firm: campanile, bear silhouette, gold-rush
sparkle, five-pointed star, rising sun, G+B, roofline). The creator adds
theirs and strikes what they don't want to see. Record `nouns.kept` and
`nouns.struck` (with reasons when given). From here on, every option
draws only from kept nouns, so nothing in a round surprises the creator.

## 3. Round 1: wide

**The width depends on the tools** (founder ruling, `s:note-cfabe7cb37`):

- **An image-generation tool is available** (an MCP tool that generates
  images): use it for volume. Generate many rough explorations from the
  kept nouns and their combinations (the bear *and* the house), on plain
  white, flat, single colour. Curate to about 12–15.
- **No image model**: Mika draws **6–9 deliberate SVG mocks**, each from
  a different noun or noun combination, flat and single colour. Don't
  pad the round to look wide; each option must be a different idea
  (the distinctness gate applies).

Before the creator sees anything:

1. **Misreading test** (`n:test-marks-for-misreadings`): render each
   option to PNG and show it to 2–3 fresh agents with only the image and
   the question "what does this look like? name everything you see".
   Record the answers in `rounds[].misreadings`. Drop or rework options
   that read as something harmful or embarrassing (Sherwin-Williams's
   drop-and-globe read as garlic, a grenade and a hot-air balloon).
2. **The four tests** (`n:mark-quality-tests`): simple, unique,
   memorable, ownable. Cut options that are only the brand's initial
   (tell `initial-only-mark`), a stock symbol (tell `stock-symbol-mark`)
   or an illustration that dies at 16 px (tell `illustration-as-mark`).
3. `atelier brand board <round folder> --title "Round 1"` lays the
   options out labelled A, B, C…, each large, at 64/32/16 px, on dark
   and in one colour.

Show the board. The creator replies with the letters to develop (and
notes). Record `rounds[]`: method, shown, picked.

## 4. Round 2: refine

For each picked option (usually 2–4):

- **Reduce to the edge** (`n:reduce-to-the-edge`): remove parts until it
  stops communicating, then step back one. Fewer brush strokes.
- **Find the second read** (`n:hidden-second-read`): can negative space
  or one small added detail carry a second image (FedEx's arrow, the C
  in Clune's arrow, the knife in Bistro 71's serifs)? Earn it from the
  shapes already there; never paste the literal object on top.
- **Redraw the type** (`n:redraw-type-for-optical-balance`) if letters
  are part of the mark: balance widths optically, share curves.
- Vectorize cleanly: whole-pixel geometry, consistent stroke and corner
  radii, a viewBox, no stray points.

Misreading test again, then a board. The creator picks **two**.

## 5. Round 3: two full systems

For each finalist, build the **logo system by media size**
(`n:logo-system-by-media-size`): small media tell a short story, large
media a long one.

- `mark`: the bare mark, roughly square, for favicon, avatar and app
  icon (works at 16 px).
- `horizontal`: mark + name, for headers and docs.
- `vertical`: mark over name.
- `badge`: mark + name + one line (tagline, est. date, place), for
  stickers, merch and signage.
- Each in full colour, one colour, and reversed on dark.
- Colour (ink, paper, one accent, roles named for the job) and type
  (a display and a text face; the name set by hand, not just typed).

Show both systems side by side (`atelier brand sheet` on each, or one
board). Two directions the creator loves can be **merged** (Golden
Bear's monogram and bear became one badge). The creator picks one.

## 6. Codify

1. Mika writes the final `brand.yaml` and `marks/` (one file per lockup
   and variant), then `atelier brand check` (fix fails) and
   `atelier brand sheet`.
2. The creator's yes is recorded as a decision (problem, trade-off).
3. Feed the design system: brand colours and type become foundations
   primitives; roles point at them. For a home-studio brand, update
   `_brand/DESIGN.md` and `.atelier-brand.yaml` too, so every project's
   cascade inherits it.

## Rules

- Strategy and nouns come before any drawing. No option uses a struck
  noun.
- Each round is a board, shown once; the creator picks, Atelier refines.
  Iterations between rounds aren't shown (the founder's standing
  preference).
- Every option has passed the misreading test and the four tests before
  it's shown.
- The mark is designed for its smallest use first.
- A redesign keeps its listed equity unless the creator says otherwise.
