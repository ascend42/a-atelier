# Keynote Presentation Plan

> **Presenter:** Matt Canoy (@ascend42)
> **Date:** March 3, 2026
> **Narrative Arc:** Tour the product portfolio → Reveal how Paradigm made it all possible → Crescendo with STAR

---

## Presentation Flow (Apple Keynote Beats)

```
PRE-SHOW: Holding slide + ambient music         (People filing in)
ACT 0: "Welcome"                                (Intro, who am I, what is this)
ACT 1: "The Portfolio"                          (Product-by-product tour)
ACT 2: "The Thread"                             (Paradigm is the common thread)
ACT 3: "The Vision"                             (STAR — everything converges)
ACT 4: "The Conclusion"                         (Thanks, reflections, the ask, the promise)
```

---

## PRE-SHOW: Holding Slide

*(On screen before you start — while people are joining the stream / finding seats)*

**Slide:** Clean, minimal. "a company" logo or wordmark centered. Maybe a subtle tagline: "for the people." No product names, no spoilers. Just the brand.

**Vibe:** Low-key ambient music if the platform supports it. Let people trickle in. Chat with early arrivals casually — "hey, welcome, we'll get started in a few minutes, grab your coffee."

**Duration:** 2-5 min depending on turnout. Don't rush this. Let the room fill.

---

## ACT 0: Welcome

### Beat 0a: The Hello

*(Camera on, energy up, transition from casual to "we're starting")*

> "Alright — I think we've got enough people in here. Welcome, everyone. Thank you for being here. Whether you clicked in on purpose or by accident — you're stuck now."

*(light joke to break ice — adjust to your style)*

> "My name is Matt Canoy. I go by Ascend online. I'm a software engineer, and I run a small LLC called — and yes, this is the real name — 'A Company.'"

*(pause for the name to register — it always gets a reaction)*

> "A Company LLC. That's the actual legal name. I'll explain why later."

---

### Beat 0b: What This Presentation Is

Set expectations clearly so people know what they're in for:

> "Today I'm going to walk you through everything I've been building. Not one product — eleven. Some are further along than others. Some are ambitious. Some are a little unhinged. But they all connect, and by the end of this, you'll see how."

**Frame the structure** (so the audience has a mental map):

> "Here's how this is going to go:
> - First, I'll take you through the products — what they are, why they exist, and what makes them different.
> - Then I'll show you the thing that made building all of them possible.
> - And then I'll show you where it's all going."

> "Think of it like a Marvel movie. The first part is the solo films. Then there's the Avengers moment. And then there's the post-credits scene that sets up the next phase."

*(or whatever pop culture frame feels natural — adjust to audience)*

---

### Beat 0c: Who Am I / Why Should You Care

Keep this tight. Not a resume — a positioning statement:

> "Quick background: I'm a full-stack engineer. I've worked across the stack — Rust, Swift, TypeScript, Python. I've done client work, I've done startups, and for the past year-plus I've been building my own products full-time with heavy AI assistance."

> "I'm not backed by a VC. I don't have a team of 30. Most of what you're about to see was built by me and an AI in a terminal. And I think that's the most interesting part of the story — not just WHAT I built, but HOW."

*(This plants the seed for the Paradigm reveal later)*

> "So let's get into it."

---

### Suggested assets for ACT 0:
- Holding slide: "a company" logo, minimal, clean
- Title slide: "Eleven Products. One Person. One Mission." (or similar)
- Optional: Quick "about me" slide with name, handle, a-company.org — but don't linger on it

---

## ACT 1: The Portfolio

The energy here is: "Look at everything one person built." Each product gets a quick beat — what it is, why it exists, one killer differentiator. Keep it punchy. Save depth for Paradigm and STAR.

---

### Beat 1: LeadSync (Warm-up — "The Client Work")

**What it is:** Conversion tracking dashboard for advertisers, small businesses, and agencies.

**Why I built it:** Built for/with a client. Real-world problem — advertisers losing 20-30% of conversion data to ad blockers and browser privacy restrictions (ITP). Small businesses can't afford enterprise attribution tools.

**Value prop:** Universal ad attribution SDK (JS + server-side hybrid) that captures conversions even when ad blockers are active. CNAME proxy makes tracking invisible to blockers. Connects to Meta CAPI, Google Ads, etc.

**Differentiator:** Hybrid client+server approach means <1% data loss vs ~20-30% for client-only solutions. First-party cookie strategy defeats Safari ITP 7-day limits. Built for the little guy — not enterprise pricing.

**Built for:** Client project / with another person. Revenue-generating work that funds everything else.

**Competitors:** Segment ($120/mo+), Plausible (no attribution), PostHog (complex), Triple Whale ($300/mo+)

**Suggested assets:**
- Dashboard screenshot/mockup
- Architecture diagram: JS SDK → Ingestion API → Attribution Engine → Ad Networks
- Data loss comparison chart: Client-only (20-30% loss) vs Hybrid (<1% loss)

---

### Beat 2: Deus ("The Social Platform")

**What it is:** A "for the people" Discord replacement. Full chat platform with P2P architecture, end-to-end encryption, and decentralized server moderation.

**Why I built it:** Discord is a black box. Centralized moderation, no real privacy, dark patterns everywhere. Built this because communication platforms should respect users.

**Value prop:** P2P-first (voice, video, files route directly between users). E2E encrypted DMs. Decentralized moderation — servers self-govern. Full data export, real account deletion. No dark patterns.

**Differentiator:** Discord doesn't do E2E encryption. Slack charges per seat. Element/Matrix is too technical. Deus is the ethical middle ground — modern UX with real privacy.

**Built for:** Myself + community. A philosophical statement as much as a product.

**Tech stack:** Bun + TypeScript, tRPC, Hono, PostgreSQL + Drizzle, Redis, Electron desktop app

**Competitors:** Discord (no E2E, centralized), Slack ($7.25/user/mo), Element/Matrix (too complex), Signal (no servers/communities)

**Suggested assets:**
- App screenshot (chat interface)
- Architecture diagram: P2P connections, E2E encryption flow
- Feature comparison table vs Discord/Slack/Element

---

### Beat 3: Chamber ("The Creative Tool")

**What it is:** Standalone spatial audio production tool. Generate realistic, environmentally-processed audio from dry recordings.

**Why I built it:** Post-production audio is expensive and technically demanding. ADR requires matching acoustic environments. No accessible tool lets you say "make this voice sound like it was recorded in a coffee shop 10 feet away."

**Value prop:** Position sound sources and listeners in 3D space, define acoustic properties, export finished audio that sounds like it was recorded there. No acoustics engineering knowledge needed.

**Differentiator:** Not a DAW plugin — standalone tool. Real impulse response convolution, not synthetic approximation. Foley trigger system for performative sound design. Accessible to non-engineers.

**Built for:** Myself (audio/music interest) + indie filmmakers, podcasters, game audio designers, foley artists.

**Competitors:** DAW plugins (require technical knowledge), Spatial Audio Designer ($299, pro-only), room simulation plugins scattered across different DAWs

**Status:** Concept / early development

**Suggested assets:**
- 3D room mockup with positioned sound sources + listener
- Core flow diagram: Input → Position → Environment → Render → Export
- Use case cards: ADR, Foley, Podcasting, Game Audio

---

### Beat 4: Kamiki ("The Infrastructure")

**What it is:** "Paper Tree" — a "for the people" remote desktop system. Full WebRTC-based screen sharing with VP8 video encoding.

**Why I built it:** Remote desktop solutions are either expensive enterprise tools or janky open-source projects. Built a clean, modern alternative that works across platforms.

**Value prop:** Real-time screen capture + WebRTC streaming. Works on macOS and Windows. Supabase-backed signaling. Browser-based viewer (Niwashi/Gardener).

**Differentiator:** Built in Rust for performance. WebRTC P2P means low latency. No subscription — self-hostable. Simple architecture: agent captures screen → signaling server → browser views.

**Built for:** Myself — personal infrastructure need. "For the people" ethos.

**Tech stack:** Rust (daemon + CLI), WebRTC + VP8, Supabase signaling, React browser client

**Competitors:** TeamViewer ($50/mo), AnyDesk ($15/mo), Parsec (gaming-focused), RustDesk (closest — also Rust, open source)

**Suggested assets:**
- Architecture diagram: Garden Agent → Signaling → Gardener (browser)
- Screenshot of remote session in browser
- Tech stack callout: Rust + WebRTC + Supabase

---

### Beat 5: Essence ("The Dating App")

**What it is:** ESSNC — "Resonate Real." A dating/connection platform that replaces internet-shopping dating with peer-reviewed authenticity. Cyber Mystic aesthetic.

**Why I built it:** Modern dating apps reduce people to shopping carts. Swipe culture incentivizes superficiality. Essence flips the model — your character traits are verified by real people who know you (Witnesses), not self-reported.

**Value prop:**
- **Soulprints** instead of profiles — vertical, interactive landing pages
- **Runes** — deep character traits verified by Witnesses (real people)
- **The Throw** — physics-based gesture replaces swiping
- **Globe** — world heat map of active broadcasts (not infinite scroll)
- **Lineage** — trust graph of who vouched for whom

**Differentiator:** Peer verification is the killer feature. You can't fake your character when your friends have to vouch for it. No other dating app has a trust graph. The aesthetic (Cyber Mystic) is a brand moat.

**Built for:** Myself and others — the frustration with dating apps is universal. Built with a co-founder/partner vision.

**Tech stack:** Swift/SwiftUI (iOS-first), Kotlin Multiplatform (shared logic), Supabase, Mapbox

**Competitors:** Hinge ("designed to be deleted"), Bumble, Tinder — none have peer verification or trust graphs

**Suggested assets:**
- Soulprint mockup (vertical interactive profile)
- The lexicon table (standard terms → ESSNC terms)
- Globe heat map concept
- Trust graph / Lineage visualization

---

### Beat 6: Trace / Project Review ("The Learning Tool")

**What it is:** An art + movement learning app. Drawings are captured as scrubbable timelapses. Video practice mode for dancers/choreographers with segment looping, speed control, and mirror mode. Social feed for sharing.

**Why I built it:** Artists and dancers learn by repetition and review. No tool captures the full creation process as a scrubbable timeline. Video practice tools don't have segment looping or annotation.

**Value prop:** Draw → every stroke recorded with pressure/tilt/timing → scrub through like a video. Import dance videos → create segments → loop at variable speeds → mirror mode. Publish to social feed.

**Differentiator:** Full stroke-level recording (not just screen recording). Apple Watch integration for remote control during dance practice. Cross-platform: iOS (create), Watch (remote), Web + Android (view). Social layer for sharing timelapses.

**Built for:** Myself (artist + movement practitioner). Personal learning tool that became a product.

**Tech stack:** SwiftUI + PencilKit (iOS), WatchOS, Next.js (web), Kotlin Compose (Android), Supabase

**Competitors:** Procreate (has timelapse but no scrubbing), YouTube (no interactivity), dance apps (no annotation/segment tools)

**Suggested assets:**
- Platform overview diagram (iOS → Watch → Web → Android)
- Timelapse scrubber UI mockup
- Feature matrix table
- Video practice mode: segments + looping + mirror

---

### Beat 7: Pretend ("The Game Engine")

**What it is:** A declarative game scripting engine designed agent-first. The file format IS the product. AI agents author games in structured YAML, output is playable browser arcade games.

**Why I built it:** Game engines are designed for human programmers. When AI generates Unity/Godot code, it's fragile and opaque. Pretend is designed so AI can read, understand, and modify games structurally — like how Paradigm makes codebases legible to AI.

**Value prop:** `.pretend` YAML files describe entire games declaratively — entities, rules, animations, state, input, scenes. AI can generate a complete game from a natural language description because the target is structured data, not imperative code.

**Differentiator:**
- "Lua was for human game devs. Pretend is for AI game devs."
- Uses Atelier for all visual representation (no duplicate animation system)
- PICO-8-style creative constraints → better output
- Part of a stack: Paradigm (context) → Atelier (visuals) → Pretend (games) → Arcade (distribution)

**Built for:** Myself + the ecosystem. Pretend is where Atelier and Paradigm converge into playable experiences.

**Competitors:** PICO-8 (human-only), Bitsy (too limited), RPG Maker (not AI-native), no direct competitor for AI-first game scripting

**Suggested assets:**
- The ecosystem stack diagram: Paradigm → Atelier → Pretend → Arcade
- `.pretend` file format example (Space Invaders YAML)
- "Human vs AI authoring" comparison
- Constraint philosophy slide (PICO-8 comparison)

---

### Beat 8: Badgermole ("The Privacy Tool")

**What it is:** Not a VPN — a personal network policy engine. Sits between you and the internet, making intelligent per-connection routing decisions. WireGuard + Tor + split tunneling + self-hosted exit nodes.

**Why I built it:** VPNs are dumb pipes with predatory pricing. They lock you into 2-year contracts, do renewal price shocks, and offer zero routing intelligence. Badgermole is what a VPN should be.

**Value prop:** $3/month, no lock-in, no renewal shock. Per-domain + per-app + per-category split tunneling. 5 routing modes (Standard, Tor, Paranoid, Direct, Regional). Built-in tracker blocking for all apps. Browser extension with per-tab routing. Local API + CLI. Self-hosted exit option.

**Differentiator:** No competitor does domain-level split tunneling. No competitor has a local API. No competitor lets you bring your own server. No competitor offers per-tab browser routing. $3/month with zero lock-in vs $12.99/month for NordVPN.

**Built for:** Myself — privacy-conscious developer. "For the people" pricing philosophy.

**Tech stack:** Rust daemon + CLI, Tauri + React desktop app, Manifest V3 browser extension, SQLite metrics

**Competitors:** NordVPN ($3.39/mo locked 2yr), Proton VPN ($2.99/mo locked 2yr), Mullvad ($5.88/mo), Tailscale (different category)

**Suggested assets:**
- Pricing comparison table (the $3/month thesis)
- Feature depth comparison (routing intelligence, privacy, UX)
- Mode diagram: 5 routing modes
- Architecture: daemon → tray app → browser extension → CLI
- "No competitor has..." callout list

---

### Beat 9: Atelier ("The Animation Engine")

**What it is:** AI-native animation engine. Complete toolchain for declarative animations — YAML-based format, 52 MCP tools, multi-platform export (Canvas, SVG, Lottie, MP4/WebM/GIF, React).

**Why I built it:** No open animation interchange format exists. Lottie is an After Effects export format. Rive is binary and closed. AI agents can't easily author animations. Atelier fills the gap — open, human and AI-readable, full pipeline.

**Value prop:** Define animations in YAML → author via AI (52 MCP tools) or browser studio → export to any format. State machines, transitions, templates, presets, interactions. Not just timeline playback — stateful, interactive animations.

**Differentiator:**
- AI-native from the ground up (52 purpose-built MCP tools)
- Open format, not proprietary (YAML, versionable in git)
- Full pipeline in one system (authoring → export, no format translation)
- 11 npm packages, 27 animatable properties, 5 easing types
- Used by Pretend for game visuals (ecosystem integration)

**Built for:** Myself + the ecosystem. Atelier is infrastructure that powers Pretend, and potentially any AI-generated visual content.

**Tech stack:** TypeScript, pnpm + Turborepo monorepo, 11 npm packages (@a-company/atelier-*)

**Competitors:** Lottie (After Effects dependent), Rive (proprietary binary), CSS animations (no structure), GSAP (code-only)

**Suggested assets:**
- MCP tool count infographic (52 tools across 16 groups)
- Format comparison: YAML (Atelier) vs JSON (Lottie) vs Binary (Rive)
- Browser studio screenshot
- Export pipeline: YAML → Canvas/SVG/Lottie/MP4/React
- Package architecture diagram (11 packages)

---

## ACT 2: The Thread — Paradigm

**Transition beat:** "Every one of these projects was built with AI assistance. But here's the thing — AI doesn't remember. It doesn't understand your codebase. It reads thousands of tokens and misses the forest for the trees. That's the problem I solved first."

---

### Beat 10: Paradigm ("The Enabler")

**What it is:** Structure for AI-native development. A developer tools ecosystem that brings structured context, authorization topology, and on-demand intelligence to software projects.

**Why I built it:** The context problem. AI agents work blind. Authorization is scattered. New team members (human or AI) can't orient. I needed a system that makes any codebase legible — to humans AND to AI.

**Value prop — The Three Pillars:**
1. **Purpose** — `.purpose` files define what things are and why they exist
2. **Portal** — `portal.yaml` defines who can access what
3. **Premise** — Queryable knowledge graph aggregating everything

**The numbers (show the study):**
| Metric | Traditional | Paradigm | Difference |
|--------|-------------|----------|------------|
| Time to complete | ~12 min | ~7 min | **42% faster** |
| Context per task | ~14,000 tokens | ~1,500 tokens | **8.5x less context** |
| Token cost | $0.50/task | $0.06/task | **88% cheaper** |

**The symbol system:**
| Symbol | Meaning | Example |
|--------|---------|---------|
| `#` | Component | `#checkout` |
| `$` | Flow | `$checkout-flow` |
| `^` | Gate | `^authenticated` |
| `!` | Signal | `!login-failed` |
| `~` | Aspect | `~audit-required` |

**Key features:**
- 50+ MCP tools for AI agents to query context on-demand
- Sentinel (incident tracking, failure patterns)
- University (interactive courses, PLSAT certification)
- Multi-agent orchestration (architect, builder, reviewer, tester, security)
- Symbol-based navigation, ripple analysis, flow validation

**Differentiator:** Nothing else exists in this category. Cursor/Copilot give AI access to code. Paradigm gives AI understanding of what the code means.

**The proof:** "I built 11 products. Every one of them uses Paradigm. That's the proof it works."

**Built for:** Myself first — then every developer working with AI.

**Competitors:** None directly. Cursor rules files (basic), .github/copilot-instructions.md (basic), Architecture Decision Records (manual). Paradigm is the category creator.

**Suggested assets:**
- The three pillars diagram (Purpose / Portal / Premise)
- Efficiency study results (bar charts)
- Symbol system visual reference
- "Every project uses Paradigm" ecosystem map
- MCP tool architecture diagram
- Before/after: AI without Paradigm vs with Paradigm

---

## ACT 3: The Vision — STAR

**Transition beat:** "Paradigm taught AI to understand code. But what if AI could understand YOU? Your patterns, your goals, your life — across every domain? That's STAR."

---

### Beat 11: STAR ("The Crescendo")

**What it is:** A personal AI operating system. Your own Luma — an AI companion that lives on your machine, observes your life 24/7, and helps you be your best self across every domain.

**Why I built it:** Every AI tool today is stateless. It forgets you the moment the conversation ends. STAR remembers everything, learns continuously, and finds connections across your entire life.

**The evolution story:** STAR emerged from merging two needs — personal habit tracking and content intelligence monitoring. The realization: these are the same problem. Both are personal optimization through pattern recognition. Both benefit from persistent AI memory. Why separate them?

**The brain-inspired architecture:**
```
Instinct Layer  → Local Llama (fast, free — 90% of tasks)
Reasoning Layer → Claude API (strategic, paid — 10% of tasks)
Memory Layer    → Paradigm (persistent knowledge graph)
```

**Cross-domain intelligence example:**
```
Great climbing session (Athlete)
  → High energy state
    → Better content ideas (Creator)
      → Higher engagement on posts
        → "Schedule creative work after climbing sessions"
```

**The roadmap:**
```
v1   Personal Luma      → 1 machine, your AI workspace          ← COMPLETE
v1.5 The Hive           → Your machines, LAN-networked compute  ← IN PROGRESS
v2   The Constellation   → Other people's machines, DUST economy
v3   The Network         → Global skill marketplace, autonomous agents
```

**The PULSE Protocol:**
> "MCP answers 'how does an AI talk to tools.' PULSE answers 'how do AI agents talk to each other.'"

Open standard for agentic discovery, delegation, and composition. If STAR defines the standard for agent-to-agent communication, STAR becomes the reference implementation. The protocol outlives any single product — like HTTP outlives any single website.

**The DUST economy:** Flat 1 DUST fee ($0.01) per transaction. No percentage-based rent-seeking. "For the people" isn't just a slogan — the economics back it up.

**The philosophy:**
> "Most people building AI tools are building wrappers. You're building infrastructure for personal AI sovereignty."
> — Claude (Opus)

**Key features (v1 — complete):**
- Canvas engine with 4-layer rendering, pan/zoom, lasso select
- 8 unit types: Note, Chat, Checklist, Feed, Agent, Metric, Embed, Pipeline
- Pipeline DAG execution with 12 node types
- Brain knowledge graph (auto-sync, timeline, search, self-healing)
- Space templates (fitness, nutrition, athlete, builder)
- Connection data flow between units
- 7 MCP tools for Claude Desktop integration

**Built for:** Myself first — then everyone. "If AI can help me get there ethically, I will help the people by being for the people."

**Competitors:** Notion AI (no persistent memory), Rewind.ai (passive capture, no intelligence), Personal AI (chatbot wrapper), Obsidian + AI plugins (manual). Nothing combines persistent memory + cross-domain intelligence + open protocol + token economy.

**Suggested assets:**
- The Luma visual identity / mascot
- Brain architecture diagram (Instinct + Reasoning + Memory)
- Cross-domain intelligence flow visualization
- Roadmap timeline: v1 → v1.5 → v2 → v3
- PULSE protocol layer diagram (5 layers)
- Canvas workspace screenshot with connected units
- Pipeline execution visualization
- "For the people" philosophy quote card
- The integration vision: STAR ↔ MCP Adapters ↔ Everything

---

## ACT 4: The Conclusion

### Beat 12: The Story Arc (Recap)

> "I started with a client project (LeadSync). I built tools I needed (Deus, Kamiki, Chamber, Badgermole). I built creative tools (Essence, Trace, Pretend, Atelier). I built the system that made it all possible (Paradigm). And now I'm building the thing that ties it all together — an AI that knows me, remembers everything, and helps me across every part of my life. That's STAR."

---

### Beat 13: Thank You, Mom

> "Before anything else — thank you to my mom, for being mom. None of this exists without her."

Keep it short. Keep it real. Let it land.

---

### Beat 14: The Agentic Development Journey

Reflect on what this process has actually been like — building 11 products with AI as a co-pilot:

- What agentic development actually looks like day-to-day (not the Twitter hype — the reality)
- The learning curve: from prompting an autocomplete to orchestrating multi-agent workflows
- What works, what doesn't, where the friction still lives
- How the relationship with AI shifted from "tool I use" to "partner I build with"
- The compounding effect: each project taught me how to build the next one faster

---

### Beat 15: Claude — My Favorite Tool in the AI Space

> "I've used every major AI development tool out there. Claude is my favorite, and it's not close."

Be specific about why:
- The depth of reasoning — it doesn't just generate code, it understands architecture
- The context window — actually useful for real codebases, not just toy examples
- Claude Code as a development environment — this presentation plan was built in it
- The MCP ecosystem — Paradigm's 50+ tools exist because Claude made that integration possible
- Anthropic's approach to safety and capability feels like the right balance

---

### Beat 16: Words of Caution

> "AI is moving fast. That's exciting. It's also dangerous if we're not honest about it."

- The hype cycle is real — not everything labeled "AI" is meaningful
- Agentic development is powerful but it amplifies both good judgment and bad judgment
- If you don't understand what your AI is building, you don't understand what you're shipping
- The centralization risk: a handful of companies controlling the intelligence layer for everyone
- Build things that give people control, not things that take it away
- "For the people" isn't just my slogan — it should be the industry's north star

---

### Beat 17: The Ask

**Looking to build:**

> "I'm always looking for the next problem worth solving. If you have one — let's talk."

**Looking for investors:**

> "Everything you saw today was bootstrapped. Imagine what it looks like with resources behind it."

**Looking for team members:**

> "Especially on the design side. If my AI-generated designs weren't a clear enough sign that I need help — I don't know what is."

*(pause for laughs)*

**Contact:**
- **Email:** contact@a-company.org
- **Website:** a-company.org (all products, documentation, everything)

**Suggested asset:** Contact slide with QR code to a-company.org

---

### Beat 18: Final Line

*(slow down, let the room settle)*

> "A Company's mission is to always be for the people, and I will fight to uphold that promise."

*(beat)*

> "And in case I don't see you later — good afternoon, good evening, and good night."

*(Truman Show bow. Lights. End card.)*

**End card:** "For the people." — a-company.org

---

## Presentation Order Summary

| # | Product | Status | Beat Type | Time Est. |
|---|---------|--------|-----------|-----------|
| — | *Pre-show / holding slide* | — | Casual | 2-5 min |
| 0a | The Hello | — | Warm | 1 min |
| 0b | What this presentation is | — | Framing | 1 min |
| 0c | Who am I | — | Positioning | 1 min |
| | | | | |
| | **ACT 1: The Products** | | | |
| 1 | Deal Oracle | LIVE | Quick | 2 min |
| 2 | Kamiki | Alpha | Quick | 1.5 min |
| 3 | Badgermole | Alpha | Medium | 2.5 min |
| 4 | Essence | Alpha | Medium | 2.5 min |
| 5 | Deus | Beta | Medium | 2 min |
| 6 | Chamber | POC | Quick | 1.5 min |
| 7 | Project Review | Alpha | Medium | 2 min |
| | | | | |
| | **ACT 2: The Frameworks** | | | |
| 8a | Pretend | Alpha | Medium | 2 min |
| 8b | Atelier | LIVE | Medium | 2.5 min |
| — | *Transition: "The Thread"* | — | — | 0.5 min |
| 8c | Paradigm | LIVE | Deep | 4 min |
| | | | | |
| | **ACT 3: The Vision** | | | |
| — | *Transition: "What if AI understood YOU?"* | — | — | 0.5 min |
| 9 | STAR | Beta | Deep | 5 min |
| | | | | |
| | **ACT 4: The Conclusion** | | | |
| — | *Story arc recap* | — | — | 0.5 min |
| 10 | Thank you, Mom | — | Heart | 0.5 min |
| 11 | Agentic journey | — | Reflective | 2 min |
| 12 | Claude appreciation | — | Genuine | 1 min |
| 13 | Words of caution | — | Serious | 1.5 min |
| 14 | The Ask (build/invest/team) | — | Direct | 1.5 min |
| 15 | Final line | — | Mic drop | 0.5 min |
| | **Total** | | | **~38 min** (+ pre-show) |

---

## Master Asset List

All assets are `.atelier` files in `docs/keynote/` subfolders.

### Deal Oracle (4 assets) — `docs/keynote/deal-oracle/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `conversion-tracking.atelier` | What Is Conversion Tracking? | Sequence → hold |
| 2 | `offline-problem.atelier` | The Offline Problem | Sequence → loop |
| 3 | `how-it-works.atelier` | How Deal Oracle Works | Sequence → hold |
| 4 | `pricing-tiers.atelier` | Pricing Tiers | Reveal staggered |

### Kamiki (3 assets) — `docs/keynote/kamiki/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `hero.atelier` | What Is Kamiki? | Reveal → hold |
| 2 | `how-it-works.atelier` | How It Works (P2P) | Sequence → hold |
| 3 | `cross-platform.atelier` | Cross-Platform Vision | Reveal → hold |

### Badgermole (5 assets) — `docs/keynote/badgermole/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `not-a-vpn.atelier` | Not a VPN | Sequence → hold |
| 2 | `five-modes.atelier` | The 5 Modes | Sequence → loop |
| 3 | `pricing-thesis.atelier` | The $3/Month Thesis | Reveal staggered |
| 4 | `unique-features.atelier` | What No One Else Does | Reveal staggered |
| 5 | `the-stack.atelier` | The Stack | Reveal → hold |

### Essence (5 assets) — `docs/keynote/essence/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `the-problem.atelier` | The Problem with Dating Apps | Sequence → hold |
| 2 | `lexicon.atelier` | The Lexicon | Reveal staggered |
| 3 | `trust-graph.atelier` | The Trust Graph | Sequence → loop |
| 4 | `globe.atelier` | The Globe | Loop |
| 5 | `the-throw.atelier` | The Throw | Sequence → loop |

### Deus (4 assets) — `docs/keynote/deus/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `state-of-chat.atelier` | The State of Chat | Sequence → hold |
| 2 | `p2p-architecture.atelier` | P2P Architecture (Signal Protocol) | Sequence → hold |
| 3 | `principles.atelier` | The Principles | Reveal staggered |
| 4 | `the-stack.atelier` | The Stack | Reveal → hold |

### Chamber (3 assets) — `docs/keynote/chamber/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `the-concept.atelier` | The Concept | Sequence → hold |
| 2 | `core-flow.atelier` | The Core Flow | Sequence → hold |
| 3 | `who-its-for.atelier` | Who It's For | Reveal staggered |

### Project Review (3 assets) — `docs/keynote/project-review/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `two-modes.atelier` | Two Modes | Sequence → hold |
| 2 | `the-platform.atelier` | The Platform | Sequence → hold |
| 3 | `social-layer.atelier` | The Social Layer | Loop |

### Pretend (3 assets) — `docs/keynote/pretend/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `the-thesis.atelier` | The Thesis | Sequence → hold |
| 2 | `the-stack.atelier` | The Stack (Paradigm → Atelier → Pretend → Arcade) | Sequence → hold |
| 3 | `pretend-file.atelier` | A .pretend File | Reveal → hold |

### Atelier (4 assets) — `docs/keynote/atelier/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `format-gap.atelier` | The Format Gap | Sequence → hold |
| 2 | `the-pipeline.atelier` | The Pipeline | Sequence → hold |
| 3 | `whats-inside.atelier` | What's Inside | Reveal staggered |
| 4 | `the-numbers.atelier` | The Numbers | Reveal → hold |

### Paradigm (11 assets) — `docs/keynote/paradigm/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `core-philosophy.atelier` | Core Philosophy | Reveal → hold |
| 2 | `the-problem.atelier` | The Problem | Sequence → hold |
| 3 | `value-prop.atelier` | The Value Prop | Sequence → hold |
| 4 | `five-symbols.atelier` | Five Symbols | Reveal staggered |
| 5 | `mcp-tools.atelier` | MCP — The Tool Ecosystem | Sequence → hold |
| 6 | `lore.atelier` | Lore — Project Memory | Sequence → loop |
| 7 | `sentinel.atelier` | Sentinel — Observability | Loop |
| 8 | `university.atelier` | University | Reveal → hold |
| 9 | `paradigm-shift.atelier` | paradigm shift | Sequence → hold |
| 10 | `gate-save.atelier` | The Gate Save | Sequence → hold |
| 11 | `ripple-save.atelier` | The Ripple Save | Sequence → hold |

### STAR (5 assets) — `docs/keynote/star/`

| # | File | Name | Animation Type |
|---|------|------|----------------|
| 1 | `the-realization.atelier` | The Realization | Sequence → hold |
| 2 | `the-brain.atelier` | The Brain | Sequence → hold |
| 3 | `cross-domain.atelier` | Cross-Domain Intelligence | Sequence → hold |
| 4 | `the-luma.atelier` | The Luma | Reveal → hold |
| 5 | `roadmap.atelier` | The Roadmap | Reveal staggered |

### Logo Assets Needed

| Product | Logo file needed |
|---------|:----------------:|
| Deal Oracle | yes |
| Kamiki | yes |
| Badgermole | yes |
| Essence | yes |
| Deus | yes |
| Chamber | yes |
| Project Review | yes |
| Pretend | yes |
| Atelier | yes |
| Paradigm | yes |
| STAR | yes |
| A Company | yes |

**Total: 50 atelier assets across 11 products.**
