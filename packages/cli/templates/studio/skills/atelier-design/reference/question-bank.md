# Question bank

Boards Luna can ask. Pick only what matters for the scope; options are
written per repo — the hints below are axes, not a menu.

Each board lists: **asks**, **applies when**, **facets** (mix & match
units), **writes** (what lands in `design-system.yaml`), **reference**
(quick / deep).

## Intent

### intent-audience
- **Asks:** Who is this for, and what should they feel in the first five seconds?
- **Applies:** always (first board; skip if the conversation already answered it)
- **Facets:** audience · primary feeling · expertise level
- **Writes:** `intent.audience`, `intent.feeling`
- **Reference:** none

### intent-register
- **Asks:** What register — calm utility, confident editorial, playful, technical, luxurious…?
- **Applies:** always
- **Facets:** energy · formality · warmth
- **Writes:** `intent.register`
- **Reference:** quick restyle of the scope's main screen · deep three-up comparison

### intent-dials
- **Asks:** Where should this sit on layout, motion and density?
- **Applies:** always (right after intent; in Quick mode it can replace `intent-register`)
- **Facets:** layout (1 strict grid → 10 expressive/asymmetric) · motion (1 static → 10 cinematic) · density (1 airy gallery → 10 cockpit)
- **Options:** 2–3 named dial sets, not raw numbers, e.g. "Calm utility 3·2·6", "Confident editorial 6·4·3". Start from the Design Read; in redesign mode start from the audited current dials and say which way each option moves them.
- **Writes:** `dials: { layout, motion, density }`
- **Constrains later boards:** layout ≤ 3 → no asymmetric or broken-grid options; motion ≤ 2 → motion boards offer only state transitions; density ≥ 7 → no decorative card containers around data. Options that break a decided dial are dropped or say so on the option.
- **Reference:** quick the scope's main screen at each dial set · deep interactive, motion live

## Typography

### type-voice
- **Asks:** What should the type voice be?
- **Applies:** has UI
- **Facets:** display face · body face · weight contrast · case/tracking
- **Writes:** `tokens.font.*`
- **Reference:** quick restyle headings + body · deep full specimen with real copy

### type-scale
- **Asks:** How dramatic is the hierarchy?
- **Applies:** has UI
- **Facets:** scale ratio · base size · line-height
- **Writes:** `tokens.type.scale`, `tokens.type.base`, rule `type-on-scale`
- **Reference:** quick restyle · deep type ladder

## Color

### color-temperature
- **Asks:** What temperature and contrast should the palette carry?
- **Applies:** has UI
- **Facets:** neutrals temperature · contrast level · ink (pure black or not)
- **Writes:** `tokens.color.ink`, `tokens.color.paper`, neutral scale
- **Reference:** quick same screen recolored · deep palette-in-context sheet

### color-accent
- **Asks:** How is accent color used — where, how much, how loud?
- **Applies:** has UI
- **Facets:** hue · saturation · usage budget (actions only / brand moments / data)
- **Writes:** `tokens.color.accent*`, rule `accent-budget`
- **Reference:** quick · deep

### color-mode
- **Asks:** Light, dark, both — and which is primary?
- **Applies:** has UI and no committed answer
- **Facets:** primary mode · dark-mode strategy (separate token layer)
- **Writes:** `tokens.color.modes`
- **Reference:** quick side-by-side

## Space & layout

### density
- **Asks:** How dense should this feel?
- **Applies:** has lists, tables, forms, or dashboards
- **Facets:** spacing scale · row height · padding rhythm
- **Writes:** `tokens.space.scale`, rule `spacing-on-scale`
- **Reference:** quick real view at 3 densities · deep interactive

### layout-structure
- **Asks:** How is the page organized?
- **Applies:** page-level scope
- **Facets:** grid · max width · alignment · navigation placement
- **Writes:** `tokens.layout.*`
- **Reference:** quick wireframe restyle · deep built page

## Shape & depth

### shape
- **Asks:** What's the shape language?
- **Applies:** has UI
- **Facets:** corner radius · borders vs. fills · elevation (flat / soft / layered)
- **Writes:** `tokens.radius.*`, `tokens.shadow.*`
- **Reference:** quick component restyle · deep component sheet

## Motion

### motion-personality
- **Asks:** How should things move?
- **Applies:** has interactive UI
- **Facets:** easing family · duration base · what animates (transform/opacity only)
- **Writes:** `tokens.motion.*`, rules `easing-forbidden`, reduced-motion
- **Reference:** quick CSS-transition demo on a real component · deep motion sheet / clip
- **Note:** shares vocabulary with Lux's video motion — keep them consistent.

## Imagery & iconography

### imagery
- **Asks:** What role do images and illustration play?
- **Applies:** marketing / content surfaces
- **Facets:** photo vs. illustration vs. none · treatment · crop
- **Writes:** `rules` (imagery treatment)
- **Reference:** quick · deep

### icons
- **Asks:** What icon style?
- **Applies:** has icons
- **Facets:** stroke vs. fill · weight · library
- **Writes:** `tokens.icon.*`
- **Reference:** quick row of real icons restyled

## Voice

### microcopy
- **Asks:** How does the interface talk?
- **Applies:** has UI copy
- **Facets:** formality · brevity · personality in empty/error states
- **Writes:** `voice.*` rules (inherits home `voice` block)
- **Reference:** quick real strings rewritten three ways

## Video (owned by Lux)

### captions · transitions · pacing
- **Applies:** video / motion-content scope
- **Reference:** Hyperframes snippet renders (Lux)
