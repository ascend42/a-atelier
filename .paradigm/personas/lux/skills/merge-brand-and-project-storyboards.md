# Skill — Merge Brand and Project Storyboards (visual cascade)

**Owner:** #lux-cinematographer
**Kind:** canonical
**Inputs:** `<workspace-root>/_brand/STORYBOARD.md` (base),
`<workspace-root>/projects/<active>/STORYBOARD.md` (overlay).
**Outputs:** an in-head merged storyboard Lux uses to compose; she
does not write the merged result to disk.

> **Read first:** `.paradigm/personas/_shared/cascade-merge.md`. This
> skill is the storyboard-specific application of the shared cascade
> rules; it does not restate them.

## Prompt

> You are Lux. The active project's storyboard inherits the brand
> storyboard. Merge the two in your head so every shot you stage
> against extends the brand correctly. Don't write the merge back to
> disk — the two source files stay separate so the creator can see
> what's brand vs what's this-project.

## What lives at each tier

**`_brand/STORYBOARD.md`** — durable visual primitives:

- Recurring frames (signature opening frame, signature CTA frame).
- Intro shell + outro shell (the brand's standard scaffold around a
  piece).
- Signature transitions (the named transition this brand uses to bridge
  sections).
- Watermark placement and treatment rules.
- Standing typography staging conventions (where the brand's title
  font lives on screen, default hold durations).

**`projects/<active>/STORYBOARD.md`** — this piece's shot list:

- The actual beat-by-beat plan for this specific output.
- Project-specific overrides (a campaign uses a different opening
  frame? Override the brand's intro shell here).
- One-off beats that should not bleed back into the brand.

## Procedure

1. **Read both files.** Don't trust prior memory; re-read every
   session.
2. **Apply markdown section cascade** (per shared protocol):
   - Project `## Heading` with the same name as a brand heading →
     project replaces the brand section in your merged view.
     (Project override.)
   - Project `## Heading` not present in brand → append. (Project
     extension.)
   - Brand `## Heading` not mentioned by project → keep. (Base
     inheritance.)
3. **Hold both in mind while composing.** When you write a beat into
   `projects/<active>/STORYBOARD.md`:
   - If the brand defines a recurring frame for this beat-type (e.g.
     CTA frame), use it unless you have a deliberate reason to override.
   - If you override, name the override explicitly (`> override:
     brand CTA frame swapped for full-bleed for this campaign`).
4. **Discipline the promotion direction.** If, while composing this
   project, you find yourself defining something that should recur
   across every future piece (a new signature transition, a
   watermark adjustment), STOP. Surface to the creator: "this feels
   brand-level — promote to `_brand/STORYBOARD.md`?" Don't promote
   silently.

## Example

```md
<!-- _brand/STORYBOARD.md -->
## Intro shell
0.0s–1.5s. Black hold (0.5s) → logo fade-in (pack:swiss-grid/logos/primary)
top-center, 1.0s hold. Crossfade-200ms to first beat.

## Outro shell
Final beat - 1.0s. Logo + CTA copy bottom-center, fade-in 200ms, hold to
fade-out at video end.

## Watermark
All beats except intro and outro: pack:swiss-grid/logos/mark-only, 6%
opacity, bottom-right, 2vmin from edge.
```

```md
<!-- projects/spring-launch/STORYBOARD.md -->
## Intro shell                              <!-- OVERRIDE -->
0.0s–1.0s. Hard cut to first beat — this campaign opens cold for
urgency. (> override: brand intro shell skipped intentionally)

## Beat 1
0.0s–3.5s. Full-bleed product hero. ...

## Beat 2
3.5s–6.0s. Two-up comparison. pack:swiss-grid/grids/12-col-1080.svg.
...
```

**Merged in your head:**

- `## Intro shell` — project override wins (cold open, no brand intro).
- `## Outro shell` — brand inherited (project didn't mention it, so the
  brand's outro applies).
- `## Watermark` — brand inherited (still applies to all beats per the
  brand rule).
- `## Beat 1`, `## Beat 2` — project extensions.

## Notes & conventions

- The cascade is read-time, not write-time. The two source files stay
  separate. There is no merged file on disk.
- If you discover a project beat that should be a brand primitive,
  ASK the creator before promoting (notebook:
  `cascade-discipline-for-visual-direction`).
- Project storyboards should be short when the brand is doing its job
  — the more the brand storyboard defines, the less the project has
  to restate.

## Failure modes

- **Project restates a brand frame verbatim** → that's signal the
  brand storyboard is missing something, or the creator forgot the
  brand has it. Surface: "this is the same as the brand intro shell —
  want me to drop it from the project and let the brand inherit?"
- **Project silently contradicts a brand rule** → surface, don't
  obey silently. "Brand says watermark on all non-intro/outro beats;
  this beat omits it — intentional?"
- **You catch yourself writing the merged result to a third file** →
  stop. The merge lives in your head. Two source files only.
