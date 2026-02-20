# Atelier Website Page Concept

The Atelier page on a-company.org is a **keynote**, not a README. Big, cinematic, scroll-driven. Every animation on the page is a live `.atelier` document rendered to `<canvas>` by Atelier itself — the product demos the product. Minimal text. Maximum impact. Then funnel to docs/GitHub for depth.

---

## Design Philosophy: "Elegance meets Agentic Tranquility"

- **Dark stage** — `#0A0A0A` to `#1E1E1E` backgrounds, the page IS the canvas
- Atelier palette as accent: Terracotta `#C75B39`, Instructional Blue `#4A7C91`, Sage `#7A8B6F`, Warm Tan `#D4A574`, Paper White `#F5F0EB`
- **Motion proves motion** — no static screenshots, every claim backed by a live animation
- **Progressive reveal** — scroll triggers animations, sections appear with Atelier easing
- Typography: large, editorial, generous whitespace — think Apple's product pages
- **Funnel, don't explain** — the page creates desire, docs satisfy curiosity

---

## Page Flow (Scroll Sequence)

### 1. HERO — Full Viewport Takeover

- Pitch-black canvas, nothing visible
- On load: the word **"Atelier"** fades in with a spring-eased scale (0.8 -> 1.0), Paper White, large serif
- Beneath it, a single line fades up: *"Animation, structured."* in Instructional Blue
- After 1.5s: the Choreography demo begins playing behind the text — 5 elements appearing, spreading, rotating in unison, semi-transparent so text stays readable
- Scroll indicator: subtle down-arrow pulse
- **No buttons yet.** Pure cinema.

### 2. THE REVEAL — "What if animation was data?"

- Scroll triggers: the choreography fades out, replaced by a split view
- Left side: a compact `.atelier` YAML block fades in line by line (typewriter effect, Atelier renders the typing animation itself)
- Right side: a `<canvas>` renders the YAML in real-time as each line appears
- The YAML is the hello-world example — simple enough to read at a glance
- One line of text below: *"Every frame. Every property. Inspectable."*
- This is the "aha" moment — the visitor sees YAML become motion

### 3. THE GALLERY — Big, Cinematic Demos

Full-width alternating sections, each a single demo at hero scale. No grid. One demo per screen. Let them breathe.

| Order | Demo | Caption | Why |
|-------|------|---------|-----|
| 1 | **Easing Race** | *"Seven ways to move."* | Instantly communicates technical depth — 7 easing types racing side-by-side |
| 2 | **Stroke Trim** | *"Draw on. Draw off."* | Visually arresting — outlines appearing and vanishing |
| 3 | **Glow Pulse** | *"Light that breathes."* | Dark-bg showpiece, shadow animation is uncommon and eye-catching |
| 4 | **Stagger Entrance** | *"Orchestrated."* | Classic motion design pattern, universally understood as polish |

- Each demo fills the viewport, plays on scroll-enter, loops
- Caption is 2-4 words max, large type, Terracotta accent
- Small "View source" link in corner -> expands to show the YAML (for the curious)

### 4. THE ENGINE STORY — "Built for everything."

- Scroll transition: demos fade, dark canvas returns
- Center text, large: *"One format. Any renderer."*
- Animated diagram (Atelier-rendered): a single `.atelier` file icon in the center, with lines radiating out to icons representing: Browser, Game Engine, Video Pipeline, Native App
- Each line draws itself (stroke trim animation) as the user scrolls
- Below: *"resolveFrame() returns pure data. No DOM. No canvas dependency. Just math."*
- This is where the game engine story lives — Atelier as the animation layer for your engine

### 5. THE AGENT — "AI that animates."

- The MCP story, but told cinematically
- Show a simulated "conversation" — dark terminal-style panel
- Three tool calls appear one by one (spring-eased slide-in):
  1. `atelier_create` -> document appears
  2. `atelier_add_layer` -> a shape appears on canvas
  3. `atelier_add_delta` -> the shape starts moving
- The canvas on the right renders each step live
- Caption: *"27 tools. Zero code. Full control."*
- This sells the AI-native angle without explaining MCP protocol details

### 6. THE CLOSE — Funnel

- Dark canvas, centered content
- **"Atelier"** (large, same as hero)
- Three buttons, spaced generously, spring-eased appearance:
  - **"Documentation"** -> docs/getting-started.md (Terracotta, primary)
  - **"GitHub"** -> repo (outlined, Paper White)
  - **"AI Agent Guide"** -> docs/ai-agent-guide.md (Instructional Blue)
- Below buttons: the Atelier color palette rendered as a subtle horizontal strip
- Footer: a-company.org branding, minimal

---

## How It Renders (Technical)

- Every animation is a real `.atelier` document built via `DocumentBuilder`
- `@atelier/canvas` renders to `<canvas>` elements embedded in the page
- Scroll triggers use IntersectionObserver -> play/pause state transitions
- The typewriter YAML effect: an Atelier animation where each "line" is a text layer with staggered opacity deltas
- Page-level choreography: the page itself is an Atelier state machine — each section is a "state" that activates on scroll position
- Performance: canvas animations are lightweight; requestAnimationFrame loop with frame counter
- The page is its own best demo — if Atelier can render the keynote, it can render anything

---

## What Makes This Different

- **No feature bullet lists** — motion speaks for itself
- **No code blocks until section 2** — earn attention before teaching
- **No comparison tables** — Atelier doesn't need to be "better than Lottie," it needs to be *interesting*
- **The product demos itself** — every animation on the page is Atelier running live
- **Short copy, big type** — Apple keynote energy, not MDN energy
- **Funnel architecture** — the page creates intrigue, the docs deliver substance
