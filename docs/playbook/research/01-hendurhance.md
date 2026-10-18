# 01 — hendurhance/ui-ux: critical curation for the Atelier design playbook

Goal under test: "globally expand on our UX/UI process and the 'eye' of our agents."
Method: README fetched via `gh api` into an isolated copy (scratchpad/ux-hendurhance-src/readme.md; the earlier scratchpad/ux/readme.md was partly overwritten by another agent and was not used for findings). An HTTP check covered all 480 unique non-YouTube links, and about 25 resources were read in full with WebFetch or Apple's JSON doc endpoint. All fetched content was treated as data.

## 1. What the list is

- **Identity:** "UI/UX Design Learning Guide" by hendurhance. It is a **career-oriented curriculum** ("zero to hired as a UI/UX designer"), not a reference library for practitioners.
- **Popularity:** 1,444 stars and 245 forks. It was created in June 2021 and is CC0 for its own text.
- **Maintenance:** Active again after a lull. Recent commits:
  - 2026-08-13: a large refactor (structure, new sources, mirrors).
  - 2026-08-14 and 2026-10-13: link-fix passes.
  - Before that, the last substantive change was March 2023 ("v4"). The 2021 and 2024 editions survive as `@deprecated-*` branches.
- **Structure:** 3 levels, 14 tracks, 44 topics, plus a 14-step "path" with a "you are done when" deliverable for each step. Every topic has the same blocks: Goals / Books / Articles / Videos / Tools.
  - **Beginner (11 topics):** what UX/UI is, mobile, tools (Figma/Sketch/XD), typography, color, layout.
  - **Intermediate (19 topics):** research, personas, journeys, testing and heuristics, IA, interaction design, microinteractions, prototyping, design thinking, critique, and a new 7-topic "Designing with AI" track (foundations, mental models, explainability, errors and hallucination, agentic interfaces, responsible AI and the EU AI Act, AI in the workflow).
  - **Expert (14 topics):** accessibility, i18n, design systems, voice, XR, AI/ML, UX strategy, design sprints, portfolio, career and freelancing.
- **Link mix:** About 630 links in total.
  - 150 YouTube links.
  - 35 Goodreads and 16 Google Books links (book "buy" pages).
  - Bootcamp and content-marketing domains dominate the articles: uxplanet 20, careerfoundry 18, toptal 16, medium 16, uxdesign.cc 15, ixdf 15, xd.adobe.com 9, uxpin 6.
  - NN/g has only 10 links and Smashing 6.
- **Red flag: pirated book mirrors.** 107 "⬇ Mirror" links point to MEGA. DISCLAIMER.md admits the files come from "Anna's Archive, Library Genesis, Z-Library, and OceanofPDF." Two Udemy courses are also linked as Google Drive downloads.
  - **Atelier must never link or ingest the mirrors.** Cite books by title and publisher only.
- **Curation quality:**
  - Popularity is not a proxy for quality here. The "Articles" are mostly SEO and lead-generation explainers.
  - Several rows have the wrong author or URL. Examples: "4 Golden Rules of UI Design | Adobe" links to uxplanet; "What is Accessibility? | CareerFoundry" links to ixdf; "Free Adobe XD Courses | ClassCentral" links to a Udemy Figma course; one Toptal URL is listed twice under two titles; "Refactoring UI" is filed under Accessibility.
  - It still teaches Adobe XD, which is in maintenance mode, and InVision, which shut down and now redirects to Miro.
  - The newest section (Designing with AI) is clearly the best-curated part.

### Link health (checked 2026-10-16)

- **Hard dead or unreachable (9):**
  - The Indeed "what is interaction design" page returns 404.
  - These did not respond on retry: learnux.io/course/figma and /sketch, ux.guide, blog.optimalworkshop.com/intro-to-ux-research, designerhangout.co, remote.co/remote-jobs, sprintstories.com (one-person design sprint), and sensible.com (Krug's book page, possibly a transient outage).
- **Soft-dead (redirect to a homepage or another product, 6):**
  - inkbotdesign "rules of composition" now goes to their brand-identity services page.
  - rocket55 "importance of UX" now goes to a services page.
  - resolutesoftware "why UX is important" now goes to the blog index.
  - usertesting "15 experts weigh in" now goes to the blog index.
  - workshopper.com post now goes to facilitator.com/blog.
  - invisionapp.com now goes to miro.com.
  - Also: careers.twitter.com redirects to x.ai/careers, and 18 twitter.com profile links now land on x.com.
- **Bot-blocked (~100 returned 403, not verified dead):** Medium-family sites (uxplanet, uxdesign.cc, medium), toptal, behance, rosenfeldmedia. Content loaded fine whenever it was fetched as a reader.
- **YouTube (150 links):** not checked. Most come from course-sellers (CareerFoundry, Flux Academy, DesignCourse).

## 2. Tiered verdicts (resources actually checked or well known)

KEEP = authoritative, durable principles worth importing into Atelier. SKIM = useful but derivative or dated. SKIP = marketing, shallow, or dead.

### KEEP

- **Apple HIG, Generative AI** (developer.apple.com/design/human-interface-guidelines/generative-ai). Read in full via the JSON endpoint; changelog updated June 8, 2026. The best concrete, checkable AI-UX guidance in the list: disclosure, refine/revert/retry, specific progress messages, confirmation before irreversible actions, non-AI fallback.
- **Google PAIR Guidebook: Errors + Graceful Failure** (pair.withgoogle.com/chapter/errors-failing). A durable taxonomy of context errors, background errors, and relevance errors, with "explain the limit, offer an alternative, return control." The guidebook index is JS-rendered; the chapter pages fetch fine.
- **Microsoft HAX Guidelines for Human-AI Interaction.** 18 guidelines in 4 phases from the 2019 CHI paper (Amershi et al.), evidence-based. The landing page only names the phases; the guideline text lives in the HAX library and the paper.
- **NN/g, Explainable AI in Chat Interfaces.** Research-backed rules:
  - Users rarely click citations, but seeing them raises confidence.
  - Chain-of-thought is often post-hoc rationalization (Turpin et al., 2023).
  - Put each citation next to its claim.
  - Avoid first-person anthropomorphic explanation.
- **NN/g, 10 Guidelines for Site AI Chatbots.** Practical, testable rules: no autoscroll while streaming, suggested-question buttons, progressive disclosure, resizable window.
- **IBM Carbon, AI Label guidelines.** Production-grade, precise rules: the label is never disabled, it is never used as an action button, and an overridden AI value must stay restorable through a revert button.
- **The Shape of AI** (shapeof.ai). The best pattern vocabulary for AI UX. Six families: Wayfinders, Inputs, Tuners, Governors, Trust builders, Identifiers. It is CC-BY-NC-SA, so reference it rather than copying it.
- **Luke Wroblewski, Durable Patterns in AI Product Design.** 11 patterns, including collapsed "show the work" steps, process kept separate from results, and plan review before orchestration. Directly relevant to Paradigm's agent surfaces.
- **Amelia Wattenberger, Why Chatbots Are Not the Future.** A strong argument against the blank chat box: make affordances clear, build context into controls, give users a working buffer, keep humans deciding.
- **MeasuringU, Review of Experiments with Synthetic Users.** A review of 12 peer-reviewed papers. Synthetic users show reduced variance and exaggerated effects; the authors call relying on them for critical decisions "premature." This is an important guard-rail for agents that might "simulate users."
- **NN/g articles:** Design Critiques, Microinteractions, Design Systems 101, Usability Testing 101, Journey Mapping 101, plus the AI agent definition and AI paradigm pieces. Authoritative and durable.
  - Critique supplies roles, goal-anchored feedback and a no-solutioning rule.
  - Microinteractions supplies the trigger→feedback discipline.
- **digital.gov, Accessibility for UX designers.** Concrete WCAG-referenced checks: 44px targets, visible focus, persistent labels, skip link, decorative-vs-meaningful images, grayscale and keyboard-only testing. The only real a11y checklist in the list.
- **Anthropic, Building Effective Agents, and Hamel Husain, Evals FAQ.** Not UX texts, but the right grounding for designing agent behavior and judging AI output quality.
- **EU AI Act Art. 50 and the EC transparency guidelines.** Primary legal source for AI-content disclosure (applies from Aug 2, 2026).
- **Books worth knowing (cite only; never use the mirrors):**
  - Norman, *Design of Everyday Things*
  - Krug, *Don't Make Me Think*
  - Tidwell, *Designing Interfaces*
  - Johnson, *Designing with the Mind in Mind*
  - Saffer, *Microinteractions*
  - Lupton, *Thinking with Type*
  - Albers, *Interaction of Color*
  - Rosenfeld/Morville, *Information Architecture*
  - Cooper, *About Face*
  - Connor/Irizarry, *Discussing Design*
  - Noessel, *Designing Agentive Technology* and *Designing Assistant Technology*
  - Sauro/Lewis, *Quantifying the User Experience*
  - Shneiderman, *Human-Centered AI*
  - Wathan/Schoger, *Refactoring UI* (practical visual rules, though misfiled under a11y)
- **Design systems as reference implementations:** Carbon, Primer (GitHub), Atlassian, Material 3, Fluent 2, Polaris. They are better "eye-training" corpora than any article in the list, because they contain real decisions and their rationale.

### SKIM

- **Smashing, Designing for Agentic AI** (Yocco, Feb 2026). A useful six-pattern vocabulary: Intent Preview, Autonomy Dial, Explainable Rationale, Confidence Signal, Action Audit & Undo, Escalation Pathway. But its numeric thresholds ("85% accept", "5% revert → disable") are unsourced "industry benchmarks." Use them as hypotheses, not rules.
- **Smashing, Design Patterns for AI Interfaces** (Friedman, 2025). A good taxonomy (input, output, refinement, actions, integration). Example-driven, light on evidence.
- **Laws of UX** (lawsofux.com). A handy index of 30 heuristics, but the landing page cites no primary sources and mixes solid perception findings (Fitts, Hick, Gestalt) with pop-psychology (Parkinson's, Pareto, "Miller's 7±2" applied to menu length, which is a known misuse). Use it only via its primary sources.
- **IxDF topic pages** (ixdf.org/literature). Competent overviews, but derivative of NN/g and the books. Paywall nudges.
- **Smashing comprehensive guides:** mobile 2018, UX research 2018, VUI 2022. Solid, aging.
- **Josh Clark, Say Hello to Sentient Design.** Visionary framing, little that can be checked.
- **Adobe XD Ideas articles** (e.g. critique dos and don'ts). Still loads, but the content is generic and XD is a dead product line.
- **UX Design Institute, What is UI Design.** Six reasonable principles (consistency, familiarity, feedback, flexibility, efficiency, accessibility), one paragraph each, heavily course-promoted.
- **Material 2 typography and layout pages** (m2.material.io). Still good grids and type-scale primers, but superseded by M3.
- **Tools sections** (Maze, Lyssna, Dovetail, Figma Make, v0, Stitch). Useful only as a market map.

### SKIP

- **CareerFoundry** (18 links), **uxplanet** (20), **Toptal** (16), generic **Medium/uxdesign.cc** "what is X" posts, **Coursera/Indeed** explainers. Bootcamp SEO funnels that restate NN/g at lower fidelity.
- **"Importance of UX" articles** (rocket55, resolutesoftware, workshopper, 729solutions). Dead, redirected, or lead-gen. 729solutions promises 27 principles, delivers 8, and gates the rest behind an email form.
- **"ChatGPT Prompts for UI/UX Design" table.** Fill-in-the-blank prompts ("Suggest a color palette for a {app type}") that would make agent output worse, not better.
- **Color-psychology pieces** (Design Shack "science behind color and emotion", Smashing 2010 "meaning of color"). Weak evidence, culture-bound.
- **Portfolio, career, freelancing and job-board sections, design-tool course lists.** Out of scope for agent craft.
- **XR and VR Medium essays (2015–2017), Oculus Rift in Action.** Dated.
- **All MEGA and Google Drive mirror links.** Piracy. Exclude categorically.
- **Dead links:** see §1.

## 3. UX spaces covered, and the best resource in each

| Space | Coverage in list | Best resources (from list) | Notes |
| --- | --- | --- | --- |
| Research methods | Medium | NN/g usability testing 101; Sauro/Lewis; Goodman *Observing the UX*; Doody interview questions (Harvard PDF) | No research-ops or sample-size guidance in articles |
| Personas / JTBD | Weak | Cooper "Modeling Users" PDF (free) | No JTBD despite its relevance |
| Journey / flows / IA | Medium | NN/g Journey Mapping 101; Rosenfeld/Morville; Kalbach *Mapping Experiences* | Card sorting and tree testing only named in path goals |
| Interaction design | Medium | Cooper *About Face*; Tidwell *Designing Interfaces*; Norman | Articles are thin; books carry it |
| Microinteractions / motion | Weak to medium | NN/g Microinteractions; Saffer; Val Head | No motion spec guidance (durations, easing, reduced-motion) |
| Visual design (type, color, layout) | Medium (books) / weak (articles) | Lupton, Albers, *Refactoring UI*, Material layout and type | No contrast math, no type-scale systems, no dark mode |
| Accessibility | Weak | digital.gov UX checklist; Horton/Quesenbery *A Web for Everyone* | **No WCAG, WebAIM, ARIA APG, or Inclusive Components links**, a critical omission |
| Content / microcopy | Almost none | Halvorson *Content Strategy for the Web* (book only) | No UX writing, error-message or voice-and-tone guidance |
| Design systems | Medium | NN/g DS 101; Carbon/Primer/Atlassian/M3/Fluent/Polaris; Curtis *Modular Web Design* | No tokens or theming guidance |
| Usability evaluation / heuristics | Medium | Nielsen/Mack *Usability Inspection Methods*; NN/g testing | **Nielsen's 10 heuristics article is not linked** in the current edition |
| Critique | Good | NN/g Design Critiques; Connor/Irizarry *Discussing Design* | Directly reusable as an agent critique protocol |
| AI / agent UX | **Good (best section)** | Apple HIG GenAI; PAIR; HAX; NN/g explainable AI and chatbots; Carbon AI label; Shape of AI; LukeW; Wattenberger; Yocco; Noessel | Strongest import for Atelier |
| Responsible AI / compliance | Medium | EU AI Act Art. 50; EC guidelines; IBM Everyday Ethics | |
| i18n | Weak to medium | Dropbox "Design for internationalization" (blocked by Medium's 403 here, known good) | |
| Strategy / product | Weak | Levy *UX Strategy*; Gothelf *Lean UX*; Klein *UX for Lean Startups* | |
| Voice / XR | Dated | Pearl *Designing VUIs*; Bowman *3D UIs* | Low priority for Paradigm |

## 4. Durable principles as agent-checkable critique rules

Each rule is phrased so a critic agent (Luna, Mika, or a reviewer) can apply it to a screen, component, or flow and return pass, fail, or n/a with evidence.

### Interaction and feedback

1. **Every user action produces visible feedback near its trigger.** The feedback is scoped to that one action and ends when done. (NN/g Microinteractions; Saffer)
2. **Any wait over ~1s shows progress.** For AI generation, the progress text names the actual work ("Summarizing key themes…") rather than "Processing…". (NN/g Microinteractions; Apple HIG GenAI)
3. **Irreversible or easily mistaken actions have either confirmation before or undo after.** Prefer undo, and show the undo window when one exists. (Apple HIG GenAI; NN/g Microinteractions; Yocco "Action Audit & Undo")
4. **Changed state is visually distinct from default state.** For example, favorited vs not, or overridden-AI vs AI. (NN/g Microinteractions; Carbon AI label)
5. **Live input validation happens during entry, not only on submit,** for fields with known constraints. (NN/g Microinteractions)
6. **Fitts:** primary targets are large and close to where attention or the cursor already is. Touch targets are at least 44px. (Laws of UX → Fitts 1954; digital.gov/WCAG 2.5.5)
7. **Hick / choice load:** a decision point exposing more than ~7 peer options needs grouping, a default, or progressive disclosure. (Laws of UX → Hick; NN/g chatbots "progressive disclosure"). Do not cite "Miller's 7±2" as the reason; that misapplies working-memory research.
8. **Jakob's law:** a non-standard pattern for a standard job (navigation, search, settings, scroll) needs an explicit justification. (Laws of UX; NN/g)

### Visual and perceptual

9. **Gestalt check:** items that belong together share proximity, region or similarity, and unrelated items do not. Spacing between groups is greater than spacing within them. (Laws of UX → Gestalt; *Refactoring UI*)
10. **Exactly one visually dominant element per view,** and it is the primary task. Von Restorff emphasis is spent on one thing, not five. (Laws of UX; Lupton)
11. **Type uses a defined scale and a limited number of sizes and weights,** with no ad hoc values. Color comes from tokens, not raw hex. (Material type and layout; NN/g DS 101; *Refactoring UI*)
12. **Information is never conveyed by color alone.** The view must still work in grayscale. (digital.gov / WCAG 1.4.1, 1.3.3)

### Accessibility

13. **Every interactive element:**
    - can be reached by keyboard in a logical order (WCAG 2.4.3);
    - has a visible focus state (2.4.7);
    - has an accessible name (4.1.2).
    Modals take and return focus. (digital.gov)
14. **Form inputs have persistent visible labels.** Placeholder-as-label fails. (digital.gov / WCAG 3.3.2)
15. **Images are marked decorative or meaningful.** Meaningful ones carry alt text. (digital.gov / WCAG 1.1.1)

### AI and agent UX (highest leverage for Paradigm)

16. **AI involvement is disclosed where it occurs.** AI-generated content is labelled per instance or per region, and the label is never disabled or used as an action button. (Apple HIG GenAI; Carbon AI label; EU AI Act Art. 50)
17. **Generated output sits next to Edit / Retry / Undo (or Revert) controls,** and the UI confirms when a correction took effect. An overridden AI value stays restorable. (Apple HIG GenAI; Carbon)
18. **The capability and limits of an AI surface are stated up front,** with example inputs or suggested prompts. A blank prompt box with no affordances fails. (Apple HIG; NN/g chatbots #3–4; Wattenberger; Shape of AI "Wayfinders")
19. **Before an agent performs a multi-step, external, or irreversible action, it shows a reviewable plan** (proceed / edit / take over). (Yocco "Intent Preview"; LukeW "plan review before orchestration"; Apple HIG)
20. **Autonomy is scoped per task class.** Destructive and financial actions are never fully automated by default. (Yocco "Autonomy Dial"; Apple HIG; Noessel)
21. **Agent work is logged and auditable.**
    - Steps appear collapsed by default and can be expanded.
    - Process is shown separately from results.
    (LukeW; Yocco "Action Audit"; Shape of AI "Stream of Thought")
22. **Citations sit next to the claim they support,** use descriptive labels (not "Source"), and look distinct from answer text. (NN/g Explainable AI)
23. **Step-by-step "reasoning" displays are not presented as faithful explanations.** Prefer sources plus stated limitations. Avoid first-person anthropomorphic phrasing ("I thought about…"). (NN/g Explainable AI; Turpin et al. 2023)
24. **Disclaimers are specific, actionable, and placed near the input.** Footer and help-icon placement fails. (NN/g Explainable AI)
25. **Failure states say what happened, why (the system limit), and the next step.** Low-confidence results say so rather than bluffing. Blocked requests coach a better request. (PAIR Errors; Apple HIG)
26. **Streaming output must not autoscroll the reader past the start of a response.** (NN/g chatbots #7)
27. **Feedback affordances (thumbs up and down, plus detail) are present, voluntary, and non-interruptive.** (Apple HIG; HAX)
28. **The core task still works when the AI feature is unavailable or declined.** A non-AI fallback exists where reasonable. (Apple HIG)
29. **Synthetic or LLM-simulated users never count as validation evidence.** Findings from them are labelled directional only. (MeasuringU review)

### Process

30. **A critique is anchored to stated goals and user needs.**
    - Each finding cites the goal it serves or violates.
    - "Taste" findings must be rephrased in task terms.
    - Critique and solutioning are separate passes.
    - Note strengths as well as problems.
    (NN/g Design Critiques; Connor/Irizarry)

## 5. Gaps: what a design agent needs that this list lacks

1. **Terminal and TUI design.** Nothing on CLIs or TUIs. Paradigm's primary surfaces are CLI, Claude Code, and the TUI shell, so source separately:
   - clig.dev (Command Line Interface Guidelines)
   - Heroku CLI style guide
   - GitHub CLI/Primer CLI guidance
   - no-color.org
   - charm.sh (Bubble Tea/Lip Gloss) conventions
   - ANSI 16-color theming and contrast
   - a monospace grid and box-drawing rhythm
   - progress and spinner etiquette
   - `--json` / machine-readable output parity
   - exit codes and error text
2. **Developer-tool UX.** No API/SDK ergonomics, error-message design for developers, docs IA, config-file UX, or IDE and extension UX (VS Code UX guidelines). Also no "progressive power" design: defaults → flags → config.
3. **Agent and multi-agent UX beyond single-agent chat.**
   - Orchestration views (who is doing what), handoffs between agents, attribution of agent output, and long-running background tasks with notifications.
   - Interruptibility, plus cost and token visibility.
   - Permission and approval UX, including rubber-stamping fatigue. Only Yocco touches this, unsourced.
   - Reference sources to add: Anthropic and Claude Code permission patterns, GitHub Copilot agent UX, Microsoft HAX playbook, Noessel's books.
4. **Accessibility standards themselves.** WCAG 2.2 quick reference, WebAIM contrast and screen-reader surveys, WAI-ARIA Authoring Practices, Inclusive Components (Heydon Pickering), and reduced-motion and forced-colors handling.
5. **Content design and microcopy.** Nothing on UX writing, error-message anatomy, voice and tone, empty states, or onboarding copy. Candidates: Mailchimp Content Style Guide, GOV.UK content design manual, Podmajersky *Strategic Writing for UX*, NN/g error-message guidelines.
6. **Visual craft depth.**
   - No color science: OKLCH/perceptual palettes, APCA/WCAG contrast math, dark-mode systems.
   - No type-scale systems (Butterick's *Practical Typography*, modular scales).
   - No spacing and density systems, data-dense UI and dashboards, or data-visualization principles (Tufte, Datawrapper/Observable guidance).
   - No motion specs (durations, easing, Material motion, `prefers-reduced-motion`).
7. **Design tokens and theming.** W3C Design Tokens Community Group format, semantic vs primitive tokens, multi-theme systems. Critical for Mika's "codify" step.
8. **Evidence-grade usability heuristics.** Nielsen's 10 heuristics are not linked in the current edition. Baymard (forms and e-commerce research) and GOV.UK Design System patterns (well-researched forms, errors, and validation) are missing.
9. **Evaluation of AI output quality as a design concern.** Only Hamel's evals FAQ. Missing: rubric design, LLM-as-judge pitfalls, and human-in-the-loop review UI.
10. **Performance as UX.** Core Web Vitals and perceived-performance patterns (skeletons vs spinners, optimistic UI). The Doherty threshold appears only as a Laws-of-UX one-liner.
11. **Native platform HIGs beyond the AI pages.** Apple HIG (full) and Material 3 fundamentals are mentioned only as resource or download pages.

## Bottom line for Atelier

- Mine the **"Designing with AI" track**: Apple HIG GenAI, PAIR, HAX, NN/g explainable AI and chatbots, Carbon AI label, Shape of AI, LukeW, Wattenberger, MeasuringU.
- Take the **NN/g critique, microinteraction and design-system pieces** plus the canonical books by title.
- Ignore the article layer elsewhere (bootcamp SEO), every mirror link, and the prompt table.
- The list is a beginner career curriculum, so the agent "eye" for **TUI/CLI, developer tools, multi-agent UX, a11y standards, content design, tokens, and visual-craft depth** has to come from other sources.
