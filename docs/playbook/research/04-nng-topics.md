# NN/g topic sweep: principles for Gnomon (agent-harness TUI, decision cards, voice, Workshop mod)

Source page: https://www.nngroup.com/videos/ux-vs-ui/ (3-min Sarah Gibbons video, 2021). Its sidebar is NN/g's full "All Article Topics" list. Everything below is paraphrased from fetched NN/g pages (fetched 2026-10-16). NN/g content is treated as data. I deliberately avoided the "UX Basics: Study Guide" article (another agent covers it). One gap to note: NN/g topic pages list only the latest ~20 items, so some classic articles were reached by direct URL or search rather than through the topic page.

---

## 1. Sidebar topic list (45 topics)

Legend: **R** = I fetched the topic page and read 2–4+ articles. **r** = I read related articles through other routes (search or study guide). Blank = listed but not read (not relevant to Gnomon).

| Topic | URL | Read |
|---|---|---|
| Accessibility | /topic/accessibility/ | R (topic page, dark mode, AI agents-as-users) |
| Agile | /topic/agile/ | |
| Analytics & Metrics | /topic/analytics-and-metrics/ | r (dashboards) |
| Application Design | /topic/applications/ | R |
| Artificial Intelligence | /topic/ai/ | R (deepest) |
| B2B Websites | /topic/b2b-websites/ | |
| Behavior Patterns | /topic/behavior-patterns/ | |
| Branding | /topic/branding/ | |
| Content Strategy | /topic/content-strategy/ | |
| Corporate Websites | /topic/corporate-websites/ | |
| Customer Journeys | /topic/customer-journeys/ | |
| Design Patterns | /topic/design-patterns/ | R |
| Design Process | /topic/ux-design-process/ | |
| Ecommerce | /topic/e-commerce/ | |
| Email | /topic/email/ | |
| Eyetracking | /topic/eyetracking/ | |
| Heuristic Evaluation | /topic/heuristic-evaluation/ | R |
| Human Computer Interaction | /topic/human-computer-interaction/ | r (response times) |
| Ideation | /topic/ux-ideation/ | |
| Information Architecture | /topic/information-architecture/ | R |
| Interaction Design | /topic/interaction-design/ | R |
| International Users | /topic/international-users/ | |
| Intranets | /topic/intranets/ | |
| Managing UX Teams | /topic/ux-management/ | |
| Mobile & Tablet | /topic/mobile-and-tablet-design/ | |
| Navigation | /topic/navigation/ | |
| Non-Profit Websites | /topic/non-profit-websites/ | |
| Personas | /topic/personas/ | |
| Persuasive Design | /topic/persuasive-design/ | |
| Prototyping | /topic/prototyping/ | |
| Psychology and UX | /topic/psychology-and-ux/ | R |
| Remote UX Work | /topic/remote-ux-work/ | |
| Research Methods | /topic/research-methods/ | R |
| Search | /topic/search/ | |
| Social Media | /topic/social-media/ | |
| Strategy | /topic/strategy/ | |
| Study Guides | /topic/study-guide/ | r (Designing AI study guide only) |
| User Testing | /topic/user-testing/ | |
| UX Careers | /topic/careers-ux/ | |
| UX Humor | /topic/ux-humor/ | |
| UX Teams | /topic/ux-teams/ | |
| Visual Design | /topic/visual-design/ | R |
| Web Usability | /topic/web-usability/ | |
| Writing for the Web | /topic/writing-web/ | |
| Young Users | /topic/young-users/ | |

All URLs are prefixed with https://www.nngroup.com.

---

## 2. Key principles by topic

### Artificial Intelligence (the most material; details in §3)
- The context is the product. Power users build "context libraries" with three roles: **global** (standing rules, preferences, brand), **local** (task lists, skills, change logs, drafts; often written by the agent itself) and **ambient** (email, Slack, transcripts the agent sifts through). Classify each item by role, store global context where the agent always finds it, scope local context so it doesn't leak, and connect ambient sources through MCP or an API instead of copying them. https://www.nngroup.com/articles/3-agent-context-roles/
- Agentic setups degrade into a "big ball of mud" (throwaway rules files, piecemeal growth, "fix it wherever", catch-all folders). The diagnostic test: would the user know which part of the context to change to alter behaviour? If not, only the AI understands the system. Remedies: keep global and local context separate, name the context type when asking for a change, keep global context short enough to audit in one sitting, and renovate continually. https://www.nngroup.com/articles/big-ball-of-mud-ai/
- Context architecture is IA work: use hierarchy for source priority, labels in the user's language, unambiguous skill and tool names, deliberate memory with retention rules, and **memory transparency** (users can see what is retained and how it is used). https://www.nngroup.com/articles/context-architecture/
- "AI Chat Is Not (Always) the Answer". Test any chat surface against user need, strategy and maintainability. AI can add value invisibly, through automation, prediction and personalisation. https://www.nngroup.com/articles/ai-chat-not-the-answer/
- One AI output is an example, not an evaluation. Use many representative inputs, run each several times, report pass rates with confidence intervals, measure both input variability and run-to-run variability, and record the model, prompt, tools and date. https://www.nngroup.com/articles/eval-ai-output/
- The custodial era: AI makes production cheaper than evaluation, so UX debt accumulates. Triage before polishing, match evaluation rigour to risk, feed generators vetted UX context (design system, content standards, accessibility rules, dark patterns to avoid), and remember that guardrails do not replace UX. https://www.nngroup.com/articles/ai-ux-debt/

### Heuristic Evaluation
- Procedure: 3–5 evaluators work independently in a 1–2 hour timebox. First pass learns the flow; second pass logs violations mapped to heuristics with recommendations. Then consolidate with affinity clustering and prioritise. Heuristic evaluation "cannot replace user research", and a violation is not automatically a problem. https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/
- The 10 heuristics applied to complex apps (most relevant to a dev-tool TUI):
  - For waits over 10 s, show steps done and steps remaining plus an estimate.
  - Use domain terms, not internal jargon. The coffee-cup icon example shows an icon that carried the wrong meaning.
  - Provide undo and version history.
  - Never reuse an icon for a different action.
  - Offer live previews to prevent errors.
  - Keep options visible (recognition over recall).
  - Offer accelerators and user-defined shortcuts.
  - Use progressive disclosure.
  - Errors must name the problem and the fix; "contact your administrator" is a dead end.
  - Help should be short and in context, for example a tooltip with the shortcut.

  https://www.nngroup.com/articles/usability-heuristics-complex-applications/
- Cognitive walkthrough: a facilitator steps through a task as a defined persona and asks four questions at each step. (1) Will the user try to achieve this result? (2) Will they notice the correct action? (3) Will they connect the action to the goal? (4) Will they see progress afterwards? Any "no" fails the step. This is best for new or unfamiliar interaction models, which describes Gnomon. https://www.nngroup.com/articles/cognitive-walkthroughs/
- Error-message rubric (12 criteria, each scored 1–4, averaged to a grade A–D):
  - Visibility: near the source; redundant and accessible indicators; severity proportional to impact; not shown prematurely.
  - Communication: human-readable; concise and precise; constructive; no blame.
  - Efficiency: guard against likely mistakes; preserve the user's input; reduce correction effort; teach how the system works.

  https://www.nngroup.com/articles/error-messages-scoring-rubric/
- User control and freedom: visible emergency exits; multi-level undo and redo with shortcuts; undo prompts that stay visible long enough; distinguish Cancel from Close; Back moves exactly one step; don't confuse Reset with Undo. https://www.nngroup.com/articles/user-control-and-freedom/

### Application Design (complex apps)
- Three complex-app user types:
  - **Legacy**: long tenure, low efficiency, fears change. Avoid sudden UI changes and keep legacy views during transitions.
  - **Legend**: expert. Loyalty is not guaranteed; they leave when they hit performance limits.
  - **Learner**: domain expert who is new to the tool. Needs inline help, sandboxes, templates, and errors with next steps.

  https://www.nngroup.com/articles/complex-apps-users/
- Complex-app strategy: research the work and the domain, not only the user. Match prototype fidelity to the question. Evaluate reasoning and judgment, not just task completion. NN/g's own example is a DevOps CLI tested first with internal engineers, then validated with real end users. https://www.nngroup.com/articles/strategies-complex-application-design/
- Indicators, validations and notifications:
  - **Indicators** are passive and contextual.
  - **Validations** relate to user input and must be acted on.
  - **Notifications** are either action-required (modal, interrupts) or passive (non-modal).
  - Toasts suit passive information but are poor for errors.

  https://www.nngroup.com/articles/indicators-validations-notifications/

### Interaction Design / Design Patterns
- Accelerators:
  - Make them optional duplicates of a standard path, never required to learn the tool.
  - Reveal them gradually, for example a contextual hint after the user does something the slow way.
  - Show shortcuts inline, right-aligned in menus.
  - Never override well-known shortcuts.
  - Give feedback when an accelerator fires, and offer undo for destructive ones.
  - Allow customisation for experts.

  https://www.nngroup.com/articles/ui-accelerators/
- Design guidance taxonomy:
  - **Principles**: organisation-specific, short, and decisive enough to settle real arguments (e.g. "Reduce time to action").
  - **Heuristics**: universal review checklist.
  - **Patterns**: reusable tactical solutions documented with when and how to use them, plus allowed variations.
  - **Team charters**: how people collaborate.

  https://www.nngroup.com/articles/design-guidance/
- Response-time limits:
  - 0.1 s feels instant. 1 s keeps the flow of thought. 10 s is the limit of attention.
  - Over 1 s, show a busy state.
  - From 2 to 10 s, a small changing counter is enough.
  - Over 10 s, show percent-done plus a clearly marked interrupt. When the total is unknown, list items as they complete.
  - Time animations to the clock, not to processing speed, to avoid flicker. Expect users to need re-orientation after long waits.

  https://www.nngroup.com/articles/response-times-3-important-limits/

### Visual Design
- Good visual design: align to a grid, use at most about 3 type sizes for hierarchy, keep the palette restrained and reserve accent colours for what must stand out, and make every choice intentional. https://www.nngroup.com/articles/good-visual-design/
- Design system vs style guide: a design system is the evolving whole (style guides for content, brand and front-end, plus a component library and a pattern library). It needs a named owner and continuous governance. https://www.nngroup.com/articles/design-systems-vs-style-guides/
- Dark mode:
  - Mirror the OS setting.
  - Thin fonts disappear, saturated colours vibrate, shadows and thin grey dividers vanish.
  - Separate surfaces with background steps, not only outlines.
  - Use one text colour at varying opacities.
  - Meet WCAG 4.5:1 for normal text and 3:1 for large text.
  - Test manually.

  https://www.nngroup.com/articles/dark-mode-users-issues/

### Analytics & Metrics (dashboards)
- Dashboards are single-screen and glanceable. **Operational** dashboards serve time-sensitive status (a live agent fleet); **analytical** dashboards serve reflective review.
- Encode quantity with **length and 2D position** (bars, lines, scatter). Avoid area (pies, donuts, treemaps), angle (gauges, radar) and 3D.
- Colour has no inherent order, so never use it alone to encode quantity. Use it as a secondary cue paired with shape or position.

https://www.nngroup.com/articles/dashboards-preattentive/

### Information Architecture
- Card sorting reveals users' mental models.
  - Open sorts are preferred; for validation, use tree testing rather than closed sorts.
  - Use 30–50 cards. Run 15 or more participants for qualitative insight, 30–50 for quantitative results.
  - Limitations: only one level of grouping; ignores context; participants fatigue.

  https://www.nngroup.com/articles/card-sorting-definition/
- Topic page also lists: card sorting vs tree testing (/articles/card-sorting-tree-testing-differences/), tree testing (/articles/tree-testing/), and low information scent as the root of common IA mistakes (/articles/3-ia-mistakes/). These were not read in full.

### Psychology and UX
- Mental models are users' beliefs, not facts. They are imported from other products and resist change. Repeated errors signal a mismatch. Fix it by changing the system or by teaching the model through labels and brief help. https://www.nngroup.com/articles/mental-models/
- Serial task switching: every switch rebuilds context and costs errors. Let users arrange panes; keep them oriented with breadcrumbs and headers; let tasks run in parallel with unobtrusive background progress; provide undo, autosave, and confirmation before high-impact actions. https://www.nngroup.com/articles/serial-task-switching/

### Research Methods
- NN/g's framework places methods on three axes: attitudinal vs behavioural, qualitative vs quantitative, and the context of use (natural, scripted, limited, none). It lists 20 methods, from usability testing to diary studies, card sorting and tree testing. https://www.nngroup.com/articles/which-ux-research-methods/
- Synthetic users reached the same headline conclusion as 604 humans, but collapsed to about 12 labels versus 50+ from humans. They lose the long tail, blur subgroups and overstate frequency. Use them for hypotheses only; "research with synthetic users is still not user research". https://www.nngroup.com/articles/synthetic-users-vs-human-respondents/
- Don't outsource the learning: AI can recruit, transcribe, theme and draft, but the team's learning from watching users together cannot be delegated. https://www.nngroup.com/articles/human-led-research-still-matters/

---

## 3. AI / agent UX guidance

**Trust calibration and explainability** (https://www.nngroup.com/articles/explainable-ai/)
- Explanations that sound confident cause over-trust. The goal is *calibrated* trust, not maximum trust.
- Citations:
  - Place each one next to the claim it supports, styled distinctly.
  - Label it with the actual title, not "Source".
  - Deep-link to the passage.
  - Tell users that sources need verification. People rarely click citations, so a citation's mere presence inflates trust.
- Step-by-step reasoning displays are often post-hoc rationalisations and can shift under pushback. Don't present them as faithful explanations; prefer sources and stated limitations.
- Disclaimers should be plain, placed near the input, paired with an action the user can take, and introduced at onboarding. Claude's "can make mistakes, please double-check" is cited as the better example.
- Avoid anthropomorphic verbs ("thought about") that inflate perceived ability. Describe the basis for an answer factually.

**Role-tailored explanation** (https://www.nngroup.com/articles/crafting-ai-explanations/)
- Governance roles need global explanations: failure modes, audit trail, where human oversight is required.
- Builders need local explanations tied to inputs and configuration, interactive what-if tests, and actionable errors.
- Domain experts need plain language tied to their workflow, comparisons with precedent, and one-click flagging that feeds improvement.

**Agent control, confirmation, transparency** (https://www.nngroup.com/articles/designing-ai-agents/, https://www.nngroup.com/articles/impressions-chatgpt-agent/)
- Offer redundant entry points: free text for experts and a visible task menu for newcomers.
- Don't auto-send broad prompts. Ask a clarifying question with options instead.
- Reuse familiar patterns; users calm down when the interface looks known.
- Show scope and counts ("12 options"). A one-at-a-time carousel made a user think there were few options.
- Surface decision-critical facts (fees, constraints) before the decision. Require confirmation before any change of price or constraint.
- Permission prompts must state exactly what data is accessed and require an active choice. Minimise data to the current step.
- ChatGPT agent observations:
  - Narrating steps and assumptions helped, but it never asked clarifying questions.
  - It substituted 12:15 for noon without asking.
  - It was slow enough (11 min vs 2 min for a human) to exceed a 10-minute hold.
  - The takeover window for personal data was cramped.
  - The final confirmation gate protected the user but added friction. Put gates at high-stakes moments and remove friction elsewhere.

**Conversational UI and generative UI** (https://www.nngroup.com/articles/genui-buttons-and-checkboxes/, https://www.nngroup.com/articles/ai-chatbots-design-guidelines/, https://www.nngroup.com/articles/prompt-controls-genai/, https://www.nngroup.com/articles/ai-articulation-barrier/)
- Answering typed follow-up questions is error-prone. Interactive clarifiers work better:
  - Ask one question at a time.
  - Use single or multi-select for closed questions and open text for complex ones.
  - Always offer a skip or "something else".
  - Cap the count. Claude's AskUserQuestion is capped at 4, and the article endorses such guardrails.
  - Reuse the user's selections as chips in later prompts.
- Chat guidelines:
  - Use one consolidated agent that is persistent across views.
  - State its capabilities up front.
  - Offer suggested next actions as buttons, and don't repeat ones the user ignored.
  - Use progressive disclosure instead of appending long messages.
  - Don't autoscroll a streaming response to its end; anchor at the start.
  - Make the window resizable, outputs saveable, and offer voice input.
- Prompt controls: use standard icons *with labels*, plain feature names ("Think Carefully" confused users), controls grouped by function, and conventional interactions (Jakob's law). Show errors at the control, not in a distant popup.
- Hybrid interfaces beat pure text by turning recall into recognition. Surface the possible commands so capabilities become discoverable.

**Voice** (https://www.nngroup.com/articles/intelligent-assistants-poor-usability-high-adoption/, https://www.nngroup.com/articles/mental-model-ai-assistants/)
- Voice works for simple, single-step requests with short answers. About 86% of reported tasks were single-action. Usage is driven by hands-busy contexts, not quality.
- Users retreat to the few tasks that reliably work and **rarely retry a capability once it has failed**, even after the system improves. Early failures permanently shrink the perceived capability.
- Recommendations:
  - Make core commands bulletproof and tolerant of rewording.
  - Answer aloud rather than sending users to links.
  - Support follow-ups and pronoun references.
  - Give a reasoned recommendation, not a list.
  - Disclose capabilities proactively.
  - Delay release if common tasks fail.

**Agents as users** (https://www.nngroup.com/articles/ai-agents-as-users/)
- Agents perceive through screenshots (fragile), the accessibility tree (better) or an API/MCP (best).
- Semantic structure, descriptive labels and predictable flows serve humans and agents alike. Avoid icon-only controls and visual-only grouping.

---

## 4. Agent-checkable rules (derived)

| # | Rule | Pass evidence | Fail evidence | Source |
|---|---|---|---|---|
| R1 | Any operation over 1 s shows a busy state; over 10 s it shows progress (steps done and remaining, or items completed) **and** a labelled interrupt key | Timed transcript or screen capture shows the indicator by 1 s; progress plus "Esc to stop" by 10 s | Silent wait, or a spinner alone past 10 s | response-times-3-important-limits; usability-heuristics-complex-applications |
| R2 | Every error names the problem and the next action; scores ≥3.3 (A) on the 12-criterion rubric | Rubric sheet averaged across evaluators | Dead-end text ("failed", "contact admin"), blame, input lost | error-messages-scoring-rubric |
| R3 | User input survives an error (draft prompt, form, card answers) | Re-render after the error contains the prior input | Field cleared | error-messages-scoring-rubric |
| R4 | Each destructive or irreversible agent action has either undo or an explicit confirmation gate, and **only** high-stakes actions have gates | Inventory of actions: each tagged reversible / gated / both; no gates on reversible low-stakes actions | Irreversible action with neither; confirmation fatigue on trivial actions | user-control-and-freedom; impressions-chatgpt-agent |
| R5 | The agent never silently substitutes a constraint (time, scope, file, model); a substitution requires an explicit approval | Log shows an approval event before the substitution | Substitution followed by an after-the-fact notice | impressions-chatgpt-agent; designing-ai-agents |
| R6 | Every claim backed by a source carries an adjacent, titled, deep-linked citation | Each citation renders next to its claim, has a non-generic label and resolves to an existing target | "Source" labels; citations collected only at the end; dead links | explainable-ai |
| R7 | No anthropomorphic status verbs ("thinking", "I searched"); status describes the basis factually ("read 4 files: …") | Grep the UI strings for the banned-verb list | Matches found | explainable-ai |
| R8 | Reasoning traces are labelled as non-authoritative or omitted; they are never presented as "why" without the sources | The UI label exists | Trace presented as the explanation | explainable-ai |
| R9 | Clarifier blocks have ≤4 questions, one at a time, closed options plus "other/skip" | Schema validation of the clarifier payload | >4 questions, no escape option | genui-buttons-and-checkboxes |
| R10 | Every icon or glyph has a text label or tooltip; no glyph is reused for two actions | Glyph→action map has unique keys and every entry has a label | Duplicate glyph or unlabeled glyph | prompt-controls-genai; usability-heuristics-complex-applications (#4) |
| R11 | Every accelerator duplicates a discoverable non-accelerated path; none overrides OS or terminal-standard keys (Ctrl-C, Ctrl-Z, etc.) | Keymap audit: each binding maps to a menu/palette entry; collision list is empty | A shortcut-only action, or an overridden standard key | ui-accelerators |
| R12 | Colour never encodes quantity or state by itself; it is paired with a glyph, text or position | Monochrome / NO_COLOR render remains fully interpretable | State visible only through hue | dashboards-preattentive; dark-mode-users-issues |
| R13 | Text contrast is ≥4.5:1 (≥3:1 for large or bold text) in both themes; surfaces are separated by background steps, not only by thin rules or shadows | Contrast script over theme tokens | Tokens below threshold | dark-mode-users-issues |
| R14 | Quantities on dashboards use length or position (bars, sparklines), not pies or gauges | Chart-type inventory | Pie, donut, gauge or radar | dashboards-preattentive |
| R15 | Streaming output anchors at the start of a new message; no forced autoscroll while the user is reading | Scroll position after the stream starts equals the message top, unless the user is pinned at the bottom | View jumps to the end | ai-chatbots-design-guidelines |
| R16 | Global and local context live in separate files; global context is short enough to audit in one sitting (set a line budget); each context edit names its type | Lint: global ≤ N lines; no task-specific nouns in global; change log records the type | Mixed files; edits made "wherever relevant" | big-ball-of-mud-ai; 3-agent-context-roles |
| R17 | Memory is inspectable: the user can list what is retained and why | A command such as "what do you remember" exists and returns entries with provenance | Opaque memory | context-architecture |
| R18 | Agent-quality claims cite N inputs × K runs with a pass-rate CI and record the model, version, prompt and date | Eval record has these fields | A single-run demo cited as proof | eval-ai-output |
| R19 | Permission requests name the exact resource and require an active choice; no default-accept | Prompt text includes the path or scope; default focus is not on "Allow" | "Allow access?" without scope | designing-ai-agents |
| R20 | Capabilities are declared up front (help or palette lists what the agent can do in this view) | Empty-state or help lists capabilities | Users must ask "can you…" | ai-chatbots-design-guidelines; prompt-controls-genai |
| R21 | Interactive surfaces expose semantic structure (labels and roles), not only visual layout, so other agents can drive them | Machine-readable state or accessibility-tree output exists | Screen-scrape is the only way to drive it | ai-agents-as-users |

---

## 5. Research methods: what an AI design team can run itself vs what needs real users

**Agents can run these credibly (inspection methods; NN/g frames all of them as non-substitutes for user research):**
- **Heuristic evaluation.** Run 3–5 *independent* agent evaluators (different models or personas, isolated contexts, no shared notes), timeboxed, mapped to heuristics, then consolidated. The independence requirement maps well onto isolated subagents. https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/
- **Cognitive walkthrough.** Define personas (NN/g's Legacy/Legend/Learner is a good set), break the task into steps, and ask the four questions per step. This suits a new interaction model like Gnomon. https://www.nngroup.com/articles/cognitive-walkthroughs/
- **Error-message rubric scoring.** Mechanical: score each criterion privately, then average. https://www.nngroup.com/articles/error-messages-scoring-rubric/
- **Rule linting** (§4): contrast, keymap collisions, glyph uniqueness, clarifier schema, banned verbs, context-file budgets.
- **AI output evaluation.** N inputs × K runs with confidence intervals. https://www.nngroup.com/articles/eval-ai-output/
- **Expert review against a design system.** Patterns documented with when-to-use rules. https://www.nngroup.com/articles/design-guidance/

**Agents can only generate hypotheses here (findings must be validated with humans):**
- **Card sorting with synthetic participants.** Useful to pre-structure categories (e.g. the palette or the Workshop taxonomy), but expect mode collapse: the long tail and subgroup differences disappear. https://www.nngroup.com/articles/synthetic-users-vs-human-respondents/
- **Synthetic interviews and personas.** NN/g found their stories "too coherent and emotionally flat". https://www.nngroup.com/articles/human-led-research-still-matters/

**Needs real users:**
- Usability testing (think-aloud, to expose mental models), field studies or contextual inquiry, diary studies (especially for voice: NN/g's assistant study tracked usage over weeks), tree testing at scale, quantitative benchmarking, A/B tests.
- For complex dev tools NN/g explicitly allows internal engineers as early testers, as long as the team states the limits and validates later with real end users. https://www.nngroup.com/articles/strategies-complex-application-design/
- AI can still take over the logistics: screeners, scheduling, transcription, first-pass theming. Humans should keep interpretation and the shared watching. https://www.nngroup.com/articles/ai-ux-debt/

---

## 6. Implications for Gnomon

**Agent-harness TUI**
- Treat it as a *complex application* with Legacy, Legend and Learner users. Show keybindings inline but keep every action reachable from a command palette (R11). Never override Ctrl-C, Ctrl-Z or other terminal-standard keys. Show a contextual hint the first time someone does something the slow way.
- Long agent runs are where NN/g's 10-second rule bites:
  - Show a step checklist (done / doing / next) and an absolute item count when the total is unknown.
  - Bind a labelled stop key.
  - Animate on clock time.
  - After long waits, give a re-orientation summary ("while you were away: 3 files changed, 1 decision pending").
- Notifications taxonomy: passive agent status uses *indicators* (status-line glyph plus text); a pending decision is *action-required*; toasts are never for errors.
- Support serial task switching. Run multiple sessions in parallel panes, let the user arrange them, and keep each one oriented with a header and breadcrumb.
- Status copy must be factual, not anthropomorphic ("read 4 files", not "thinking…"). This puts NN/g in tension with a playful agent persona; keep personality in tone, not in claims about capability.

**Decision cards**
- These are NN/g's "confirmation gates at high-stakes moments". Gate only irreversible actions and constraint substitutions; everything reversible gets undo instead (R4, R5).
- Card anatomy: what will happen, its scope (exact files and counts), the decision-critical facts up front, the source for each claim placed next to it, an explicit statement of any substitution, and a default focus that is **not** "approve" (R19).
- Clarifier cards follow the AskUserQuestion pattern: ≤4 questions, one at a time, options plus "other/skip", answers reusable as chips.
- Tailor explanations to the reader's role. The same decision might show the governance view (failure modes, audit) to Aegis-style reviewers and the local view (inputs, config diff) to the builder.
- A reasoning trace on a card should be labelled as a narrative, not as proof. Proof is sources and the diff.

**Voice**
- NN/g's evidence is harsh: voice works for single-step, short-answer commands, and **users don't retry a failed capability**. Launch voice with a small, bulletproof command set (approve/deny the card, status, stop, "what's pending") rather than open-ended dictation of complex tasks.
- Answer aloud in one sentence; push detail to the screen.
- Support follow-up questions and pronoun references ("approve that one").
- Disclose capabilities proactively, and ship only when common commands reliably succeed. Voice approval of an irreversible action should still require a confirm step and an on-screen echo.

**Workshop mod and context management**
- The Workshop is where NN/g's context-library findings apply directly. Make the **global / local / ambient** split visible and enforced (R16). Show which layer each rule, skill or memory lives in, give each layer a budget, and add an edit flow that asks "which layer?" rather than "fix it wherever".
- Use the big-ball-of-mud diagnostic as a built-in health check: can the user point to the file that controls a behaviour? Offer periodic "renovate" prompts (stale global rules, catch-all folders).
- Name skills and tools in the user's vocabulary with unambiguous descriptions (context architecture); make memory listable with provenance (R17).

**Process**
- Use isolated agent evaluators for heuristic review and cognitive walkthroughs on every Gnomon surface, and lint R1–R21 in CI.
- Evaluate agent behaviour statistically (N×K runs) rather than by demos.
- Before claiming the UX works, still run small think-aloud sessions with real developers. Internal engineers are acceptable first testers per NN/g, but their limits must be stated.
