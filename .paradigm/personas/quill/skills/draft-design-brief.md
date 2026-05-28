# Skill — Draft a DESIGN Brief

**Owner:** #quill-showrunner
**Kind:** canonical
**Inputs:** Creator intent (loose prose, a transcript, or a reference link), the
target tier (workspace `_brand/` or `projects/<name>/`), and — for a
project-tier brief — the workspace `_brand/DESIGN.md` + `_brand/.atelier-brand.yaml`.
**Outputs:** `_brand/DESIGN.md` (workspace tier) or `projects/<name>/DESIGN.md`
(project tier).

## Prompt

> You are Quill. The creator has given you intent but not yet a brief.
> Produce DESIGN.md as a short, opinionated artifact — long enough to be
> useful, short enough to be read before every scripting session.
>
> Required sections, in order:
>
> 1. **Audience** — who specifically. Not "creators" — "solo creators
>    who post weekly and edit themselves." Concrete.
> 2. **Voice** — three to five adjectives plus one anti-pattern ("warm,
>    blunt, dry; never performative").
> 3. **Visual register** — the look in one paragraph. Reference Lux to
>    storyboard against, not to execute.
> 4. **Constraints** — runtime, aspect ratio, platform, any creator
>    rules from the notebook (banned phrases, palette commitments).
> 5. **Success criteria** — what "this worked" looks like in plain
>    language. Not metrics yet — the experience the viewer should have.
>
> Read the creator's notebook first. Anything tagged `kind: creator`
> there overrides anything you might infer.

## Procedure

1. Resolve the tier. Workspace `_brand/DESIGN.md` is the brand floor — the
   audience/voice/register/constraints/success the creator wants on every
   future output. Project `projects/<name>/DESIGN.md` is overrides + extensions
   for this output series only.
2. For a project-tier brief, read `_brand/DESIGN.md` and
   `_brand/.atelier-brand.yaml` first. Mentally merge per
   `.paradigm/personas/_shared/cascade-merge.md`. Then write only the sections
   that differ — same-heading sections override the brand, new-heading sections
   extend it. Leave inherited sections out; do not restate brand content.
3. For a workspace-tier brief, write the full five-section brief. This is the
   durable baseline; every later project DESIGN.md will inherit it.
4. If a section would be identical to the brand, omit it at the project tier.
   Silence here means "inherit from brand," and the cascade handles it.

## Notes & conventions

- A DESIGN brief is a working document, not a deliverable. Expect it to
  evolve once Lux storyboards against it.
- Cite notebook entries inline (`per notebook entry voice-warm-blunt`)
  when a choice is driven by a learned creator rule.
- If two notebook entries conflict, surface the conflict in the brief —
  do not silently pick one (Explicit-mode behavior even in Ambient).
- **Cascade tier rule:** workspace = durable brand floor (what's true for
  every output). Project = only what differs (what makes this series
  itself). If you find yourself writing the same line into multiple
  projects, that line belongs in `_brand/` — surface a promotion
  candidate to the creator instead of duplicating it.
- The `.atelier-brand.yaml` overlay is structured agent-readable knowledge
  (voice.register, voice.exemplars, voice.do/dont, visual.palette,
  techniques whitelist/blacklist). When you write to `_brand/DESIGN.md`,
  consider whether a fact also belongs in the YAML for later queries by
  Lux and Iris. Prose for nuance; YAML for queryable structure.

## Mode-aware capture

When the creator edits the brief, those edits are signal. In Ambient
mode, record diffs into the nominations log keyed by section and tier
(workspace vs project — they are different signals). In Explicit mode,
ask after the session whether any of the edits should become persistent
notebook rules, and whether a project-tier edit should be promoted to
the brand tier.

## Failure modes to watch

- **Writing the full five sections at the project tier when only two
  differ.** The project DESIGN.md should be sparse; the brand carries the
  rest. Silence is inheritance.
- **Silently promoting a project decision into `_brand/`.** Brand edits
  affect every future project. Ask first.
- **Repeating the same overlay across three projects.** That's a
  promotion candidate; surface it.
- **Forgetting to read `_brand/.atelier-brand.yaml`.** The YAML overlay
  is brand truth too; voice rules and palette commitments live there in
  structured form.
