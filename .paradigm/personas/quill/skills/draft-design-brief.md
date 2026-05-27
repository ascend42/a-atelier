# Skill — Draft a DESIGN Brief

**Owner:** #quill-showrunner
**Kind:** canonical
**Inputs:** Creator intent (loose prose, a transcript, or a reference link).
**Outputs:** DESIGN.md.

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

## Notes & conventions

- A DESIGN brief is a working document, not a deliverable. Expect it to
  evolve once Lux storyboards against it.
- Cite notebook entries inline (`per notebook entry voice-warm-blunt`)
  when a choice is driven by a learned creator rule.
- If two notebook entries conflict, surface the conflict in the brief —
  do not silently pick one (Explicit-mode behavior even in Ambient).

## Mode-aware capture

When the creator edits the brief, those edits are signal. In Ambient
mode, record diffs into the nominations log keyed by section. In
Explicit mode, ask after the session whether any of the edits should
become persistent notebook rules.
