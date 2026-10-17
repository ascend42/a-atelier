# 02 — gschema/awesome-ux: critical curation for the Atelier design playbook

Goal under evaluation: "globally expand on our UX/UI process and the 'eye' of our agents".
Method: README read via `gh api` (content treated as untrusted data). Every one of the 56 resource links (63 URLs including badges and the licence) was status-checked with curl. 15 substantive resources were read in full with WebFetch, and YouTube availability was checked via oEmbed. Date of review: 2026-10-16.

Bottom line: this is a small, dormant list of research and process primers from 2018. It has no visual-design, UI-craft, accessibility, design-system, TUI or AI-UX content. It is worth roughly 10 links to Atelier, nearly all of them Nielsen Norman Group (NN/g) articles plus Tognazzini. Mine it once and do not track it.

Data-hygiene note: a parallel agent also wrote `readme.md` into `scratchpad/ux/`. macOS file names are case-insensitive, so the two files collided, and `scratchpad/ux/readme.md` is now a mix of two lists. That file is not this list. The clean copy is at `scratchpad/ux-awesome-ux-src/gschema-readme.md` (118 lines, 7,465 bytes, matching raw.githubusercontent).

## 1. What the list is

- **Repo:** github.com/gschema/awesome-ux by Dusan Gledovic, CC0 licence. It carries the awesome.re badge but is not on the main sindresorhus/awesome index.
- **Health:** 30 stars, 3 forks, 0 open issues, not archived.
  - Last commit: 2020-09-02, an "Update README.md" commit.
  - Last substantive work: 2018-04-18, "improved categories, processed backlog".
  - In practice it has been dormant for 6 to 8 years.
- **Size:** 56 resource links. The General, UX Maturity Models and Research Methods sections hold 41 of them, about 70%.
- **Sections:**

| Section | Links |
|---|---|
| General | 7 |
| UX Maturity Models | 9 |
| Research Methods: General | 15 (one link is listed twice) |
| Research Methods: Heuristic Evaluation | 1 |
| Research Methods: Personas | 2 |
| Research Methods: Usability | 3 |
| Research Methods: Design Thinking | 1 |
| Research Methods: Customer Journey Map | 2 |
| UX Templates | 3 |
| Tools | 1 (a 2013 Smashing spreadsheet article) |
| Blogs | 8 |
| Books | 6 |
| Cheat Sheets | 2 |

- **Slant:** UX as an organisational research practice, aimed at beginners. The word "UI" never appears.

### Link rot (11 of 56 broken, soft-dead or retired, about 20%)

- **Hard dead:**
  - practicaluxmethods.com (no response)
  - ceros.com "Effectively Planning UX Design Projects" (404)
- **Soft dead (redirects to unrelated pages):**
  - All 4 macadamian.com "Lessons in UX Maturity" articles now redirect to an emids.com corporate services page. The content is gone.
  - The usertesting.com "15 experts weigh in" article redirects to the blog index.
- **Retired source:**
  - usability.gov (both the home page and the templates page) now redirects to a digital.gov topic page. The templates are gone.
- **Superseded:**
  - The NN/g 8-stage maturity articles. Stages 5-8 now redirect to the 2021 "6 Levels of UX Maturity" model, and the stages 1-4 page timed out and then also landed on that model.
- **Moved, still live:**
  - uxchecklist.github.io now redirects to ux-checklist.com.
  - The O'Reilly book pages return 403 to bots.
  - The 4 YouTube talks are all still live.

## 2. Verdicts per resource checked

Legend:
- **R** = read in full with WebFetch
- **S** = status-checked only, judged from title, source and date
- **KEEP** = worth putting into the Atelier playbook
- **SKIM** = useful context, low yield
- **SKIP** = not worth time

### KEEP

| Resource | How checked | Why |
|---|---|---|
| NN/g, 10 Usability Heuristics (1994, reviewed Jan 2024) | R | The canonical, still-maintained heuristic set. It maps directly to critique rules. |
| Tognazzini, First Principles of Interaction Design (2014) | R | The densest testable claims in the list: acknowledge input within 50 ms, Fitts's law, a non-colour cue for every colour code, protect the user's work, visible exit, defaults and visible navigation. Caveat: much of it rests on expert anecdote, not studies. |
| NN/g, When to Use Which UX Research Methods (2022, reviewed Jul 2026) | R | A 3-axis map (attitudinal vs behavioural, qual vs quant, context of use) across 20 methods and 3 phases. Good basis for a "which method" router for agents. |
| NN/g, Beyond the NPS: SUS, NASA-TLX, SEQ (2018, reviewed Aug 2026) | R | Concrete thresholds: SUS average 68, 80+ is top 10%. Needs 20-30 users for quant measures. Use SEQ after each task, NASA-TLX for high-stakes workflows. |
| NN/g, Writing Tasks for Quant and Qual Studies (2018) | R | Crisp, rule-shaped guidance: don't leak UI labels, one success criterion per task, pilot every task. Directly usable for agent-run usability scripts. |
| NN/g, The Sketch Test (2017) | R | A cheap check that a deliverable is clear: does a reader perceive and understand it as intended? Ideal for testing Atelier's own boards and decision records. |
| NN/g, UX Research Cheat Sheet | S | A compact method-by-phase reference, a companion to the methods map. |
| Don Norman, The Design of Everyday Things (revised edition) | S | The foundational vocabulary for an agent's "eye": affordances, signifiers, mapping, feedback, constraints, conceptual models. |

### SKIM

| Resource | How checked | Why |
|---|---|---|
| NN/g, Personas vs Jobs-to-Be-Done (2017) | R | A sensible "use both" position. Useful as an Atelier stance: frame goals as jobs, not demographics. |
| NN/g, Quantitative vs Qualitative Usability Testing | S | Covered by the methods map. Read once. |
| NN/g, Field Studies; 27 Tips for Field Research | S | Solid, but field research is outside an agent's reach. |
| NN/g, Design Thinking 101 | S | Generic process diagram. |
| NN/g, UX Workshop Agendas; Persona Budgets; Personas video | S | Facilitation and budgeting for human teams. Low relevance to agents. |
| NN/g, Definition of UX | S | Short, authoritative definition. One read. |
| NN/g, 6 Levels of UX Maturity (2021, the redirect target) | R | A useful self-assessment along strategy, culture, process and outcomes. Use it to ask "where does Atelier sit", not as a source of critique rules. |
| ux-checklist.com (UX Project Checklist) | R | A broad 10-phase checklist (Research through Test, including Give feedback and Delight). Good for coverage, but each item is one line, the page was last touched around 2023, and some links are dated. |
| Krug, Don't Make Me Think (3rd ed.) | S | The classic about self-evident interfaces. Its heuristics are already absorbed into the NN/g set. |
| Garrett, The Elements of User Experience (2nd ed., 2010) | S | The 5-plane model (strategy, scope, structure, skeleton, surface) is a useful critique scaffold. The rest is dated. |
| Goodman et al., Observing the User Experience | S | A thorough research-methods text, for humans running studies. |
| UXmatters, Strengths and Weaknesses of Quant/Qual (2012) | R | Its only extra is "significance vs effect size" and the informal 1/2/3 anecdote/coincidence/trend heuristic. |
| UX Movement (blog) | R | Still alive, about one post a month as of Mar 2025. Narrow, pattern-level articles on forms, buttons and navigation are the closest the list gets to UI craft. Some posts are sponsored. |
| Smashing Magazine, UX category | S | Fresh and high-volume. Quality varies, so pick individual articles. |
| Lean UX (Gothelf) | S | A process philosophy built on hypotheses and outcomes. Worth a skim for its framing of "design as experiment". |
| YouTube, 10 UX Challenges for the Next 25 Years (Nielsen keynote) | S | Live, but speculative. |

### SKIP

| Resource | How checked | Why |
|---|---|---|
| macadamian.com maturity series (4 links) | S | Dead. All redirect to an emids corporate page. |
| practicaluxmethods.com | S | Dead. |
| ceros.com planning article | S | 404. |
| usability.gov home and templates | S | Site retired. Redirects to digital.gov and the templates are gone. |
| usertesting.com "15 experts weigh in" (2015) | S | Soft-dead (redirects to blog index), and it was a vox-pop piece anyway. |
| Smashing, A Comprehensive Guide to UX Research (2018) | R | A sponsored Adobe XD primer. Generic, with no detail on execution, sample sizes or analysis. |
| UX Mastery Techniques and Templates | R | Mostly link-outs. Several entries say "coming soon" with no content, and the page has encoding errors, typos and a broken Instagram embed. The site is effectively unmaintained since about 2022. |
| UX Mastery "How to Create a Customer Journey Map"; Usability Geek journey maps | S | Beginner journey-map how-tos. Journey mapping has low value for an agent critiquing UI. |
| Usability Geek "Start Here" and the blog | R | A title-only link directory with mixed 2011-2021 content and course upsells. |
| IxDF "UX Design" topic page | R | Sound definitions buried in course marketing (countdown timers, signup walls). Tool references (XD, Sketch) are outdated. |
| MeasuringU, How Do You Measure UX Maturity? (2017) | R | An honest call for validation that never delivered a validated model. MeasuringU's other work, such as SUS and sample-size articles, is better than this page. |
| uxmag.com maturity article; uxstudioteam maturity model | S | Maturity-model listicles that repeat the NN/g model. |
| 3 "Putting Users in UX" YouTube talks (Usability Matters) | S | Live, but hour-long agency talks that repeat the NN/g articles. |
| Rainbow Spreadsheet (Smashing, 2013) | S | A 2013 synthesis spreadsheet, now superseded by any modern research repository. |
| sneakpeekit.com printable grids | S | Paper wireframe templates (about 2016). Not relevant to agents. |
| UX Booth, UX Magazine, UX Matters (blog home pages) | S | Low-signal publishing at varied quality. Nothing here is specific enough to cite. |
| UX Research (Nunnally and Farkas) | S | Redundant with Goodman. O'Reilly page returns 403 to bots. |

## 3. UX spaces covered, and the best resource per space

| Space | Coverage in this list | Best pick |
|---|---|---|
| Heuristic evaluation and usability principles | Thin but strong | NN/g 10 Heuristics, plus the Tog First Principles |
| Choosing a research method | Good | NN/g "When to Use Which Methods", plus the Research Cheat Sheet |
| Usability testing and measurement | Good | NN/g "Writing Tasks", plus "Beyond the NPS" (SUS, SEQ, NASA-TLX) |
| Personas and JTBD | Adequate | NN/g Personas vs JTBD |
| Organisational maturity | Over-represented and rotting | NN/g 6 Levels (2021) only |
| Clarity of design deliverables | One gem | NN/g Sketch Test |
| Process and coverage checklists | Weak | ux-checklist.com |
| Foundational theory (books) | Classic canon | Norman, The Design of Everyday Things; then Krug |
| Interaction micro-patterns (forms, buttons, navigation) | Incidental | UX Movement archive |
| Visual design, typography, colour, layout, motion | **None** | n/a |
| UI craft, components, design systems, tokens | **None** | n/a |
| Accessibility | **None.** Tog's colour-blindness rule is the only touch. | n/a |
| Content and microcopy | **None** (one checklist line) | n/a |
| Data visualisation | **None** | n/a |
| Mobile, responsive, platform guidelines (Apple HIG, Material) | **None** | n/a |
| AI, agentic, conversational UX | **None** (the list predates it) | n/a |
| Terminal, CLI, TUI and developer tools | **None** | n/a |

## 4. Durable principles to turn into agent-checkable critique rules

Each rule is phrased so an agent can check it against a screenshot, a DOM, a terminal transcript or a spec. The tag in brackets says how: **[static]** means checkable from code or a screenshot, **[trace]** means it needs an interaction recording or transcript, and **[test]** means it needs real users and so can only be flagged for one.

1. **Respond to every input.** Every user action gets visible acknowledgement within 50 ms. Any operation over about 1 s shows progress, and over about 10 s shows estimated or determinate progress. Source: Tog (Latency Reduction); NN/g heuristic 1 (Visibility of System Status). [trace]
2. **Block duplicate actions.** While an action is in flight, block or debounce repeated submits. Source: Tog (Latency Reduction). [static/trace]
3. **Every state has a visible exit.** Every modal, wizard, overlay or mode has a visible cancel, back or escape path. Destructive actions are undoable, or confirmed with their consequence stated. Source: NN/g heuristics 3 and 5; Tog (Explorable Interfaces). [static]
4. **Never lose user work.** Input survives navigation, errors, refresh and network failure, through autosave or draft persistence. Source: Tog (Protect Users' Work). [trace]
5. **Colour is never the only signal.** Anything conveyed by colour is also conveyed by text, an icon, shape or position. Verify with a colour-vision-deficiency simulation. Source: Tog (Color). [static]
6. **Error messages have three parts.** Every error message says what happened, why, and how to fix it, in plain language with no codes alone and no blame. Source: NN/g heuristic 9; Tog (Efficiency of the User). [static]
7. **Recognition over recall.** Options, current values and recent context are visible, and the user never has to remember information from a previous screen. Source: NN/g heuristic 6. [static]
8. **Show where the user is.** The current location is always indicated (active nav item, breadcrumb or title), and global navigation is persistent. Source: Tog (Visible Navigation). [static]
9. **Speak the user's language.** Labels use the user's vocabulary, not internal names, schema keys or symbol IDs. A jargon scan against a glossary is a good start. Source: NN/g heuristic 2. [static]
10. **Consistency, and changed behaviour looks changed.** The same action has the same label, icon and placement everywhere. Anything that behaves differently must look different. Source: NN/g heuristic 4; Tog (Consistency, Human-Interface Objects). [static]
11. **Defaults only when there is a clear winner.** Pre-fill a default only when one option clearly dominates, and otherwise leave it empty. Reset and clear controls state exactly what they will reset. Source: Tog (Defaults). [static]
12. **Don't hide needed controls for a cleaner look.** Controls needed for the primary task are visible. Use progressive disclosure for secondary controls, not hiding of primary ones. Source: Tog (Discoverability, Simplicity); NN/g heuristic 8. [static]
13. **Target size and distance (Fitts's law).** Frequent and primary targets are large and close to where the pointer or focus already is. No primary action is a tiny or far-away target. Source: Tog (Fitts's Law). [static]
14. **Shortcuts for experts, a path for novices.** There is a discoverable default path plus accelerators (keyboard shortcuts, command palette) for repeat users. Source: NN/g heuristic 7; Tog (Learnability). [static]
15. **Minimalist hierarchy.** Each view has one primary action and one dominant focal point, and every element earns its place. Source: NN/g heuristic 8. [static, judgement-assisted]
16. **Readable text.** Text has high contrast, and data or terminal fonts are large enough for the oldest expected user. Pair this with WCAG ratios from another source. Source: Tog (Readability). [static]
17. **Accurate status.** Progress indicators and estimates match reality, with no fake progress and no "almost done" that stalls. Source: Tog (Autonomy). [trace]
18. **Help in context.** Help is searchable, task-focused, appears at the point of need, and lists concrete steps. Source: NN/g heuristic 10. [static]
19. **Deliverables pass the Sketch Test.** Every Atelier board or decision record can be explained back by a cold reader, whether a fresh agent or a human. Signs of failure: re-reading, mis-explaining, or redrawing the content. Source: NN/g Sketch Test. [trace; easy to run as a cold-agent check]
20. **Usability tasks are well-formed.** Agent-authored usability scripts don't leak UI labels, give each task one success criterion, keep tasks self-contained, and pilot every task. Source: NN/g "Writing Tasks". [static]
21. **Use the right measurement instrument.** Use SEQ after each task and SUS after the session. Never report quant scores from fewer than about 20 users. Treat SUS 68 as average and 80+ as top 10%. Source: NN/g "Beyond the NPS". [process gate]
22. **Pick the research method for the question.** "Why" questions get qualitative and behavioural methods. "How many" questions get quantitative ones. Prefer behavioural data over attitudinal. Source: NN/g Methods map. [process gate]
23. **State the user's goal as a job.** Frame critique briefs around the job the user is trying to get done and its success criteria, not demographics. Source: NN/g Personas vs JTBD. [process gate]

## 5. Gaps a design agent will need filled elsewhere

- **Visual "eye", the core of the founder's goal: entirely absent.** There is nothing on typography, colour systems, spacing and rhythm, grid, hierarchy, density, motion or aesthetics. Look for:
  - Refactoring UI
  - Butterick's Practical Typography
  - Material 3 and the Apple Human Interface Guidelines
  - Laws of UX (lawsofux.com)
  - Every Layout
  - Radix and shadcn component conventions
  - Design-token specifications (W3C Design Tokens Community Group)
- **Accessibility depth: absent.** There is nothing on WCAG 2.2, ARIA, focus order, keyboard operability, reduced motion or screen readers. The playbook needs WCAG 2.2 success criteria as hard rules, the WAI-ARIA Authoring Practices Guide, and Inclusive Components (Heydon Pickering).
- **Terminal, CLI and TUI: absent, and directly relevant to Gnomon and Paradigm's CLI.** Look for:
  - clig.dev (Command Line Interface Guidelines)
  - The 12 Factor CLI Apps essay
  - The Charm / Bubble Tea ecosystem and lipgloss conventions
  - NO_COLOR and terminal colour-capability conventions
  - Rules for 80-column and narrow widths, and for non-TTY output
- **AI and agent UX: absent.** Look for:
  - Google PAIR Guidebook
  - Microsoft HAX Guidelines for Human-AI Interaction (18 guidelines that are already rule-shaped)
  - Shape of AI (shapeof.ai)
  - Material and Apple generative-AI pattern guidance
  - NN/g's recent AI articles
  - Topics to cover: uncertainty and confidence display, streaming and interruptibility, provenance and citations, tool-call transparency, autonomy and approval levels, recovering from agent errors
- **Developer-tool UX: absent.** Error-message design (the Elm and Rust compiler error philosophy), docs IA (Diátaxis), command palettes, progressive disclosure for power users.
- **Design systems and critique practice: absent.** The list has no material on running a design critique, design QA, visual regression or token governance. These are core to what the playbook should codify.
- **Data visualisation: absent.** Look for Tufte, Few, and the Datawrapper and Observable guides.
- **Evidence quality.** Even the KEEP tier is mostly NN/g opinion articles and expert anecdote (Tog). Critique rules drawn from them should carry the tag "heuristic, not empirical", and Atelier should calibrate them against its own outcomes rather than treat them as law.

Recommendation: harvest the 8 KEEP items into Atelier's critique ruleset (section 4 above) once, then drop this list from any watch list. Spend further curation effort on the gaps above, which are where the founder's "eye of our agents" goal actually lives.
