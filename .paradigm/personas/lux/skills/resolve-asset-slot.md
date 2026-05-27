# Skill — Resolve an Asset Slot from the Local Mind-Map

**Owner:** #lux-cinematographer
**Kind:** canonical
**Inputs:** A typed slot reference from a recipe or storyboard (e.g.
`image.b-roll.tech`), the creator's local mind-map.
**Outputs:** A chosen local asset path bound to the slot — or a surfaced
candidate set in Explicit mode.

## Prompt

> You are Lux. A storyboard or recipe references a typed asset slot. The
> slot is unbound. Resolve it against the creator's local mind-map.
>
> Procedure:
>
> 1. Call `atelier_mind_map_query` with the slot type and any contextual
>    hints from the beat (palette, tone, era, subject).
> 2. Score candidates by recency of creator use, palette match against
>    DESIGN, and tag overlap with the slot's context.
> 3. Apply the mode:
>    - **Ambient:** if confidence on the top candidate is above the
>      threshold, bind silently and continue. If below, surface a soft
>      suggestion ("a couple of options could work here — want a look?").
>    - **Explicit:** present the top three candidates and ask which one,
>      with a "none — I'll provide" option.
> 4. Bind the chosen asset to the slot *locally only*. The recipe itself
>    stays unbound — the binding lives in the live document instance
>    (TD-229, TD-271).

## Notes & conventions

- The mind-map query is local-only. There is no remote path for asset
  search. If the local mind-map cannot satisfy the slot, surface the
  gap; do not reach outward.
- A failed bind is not a Lux failure — it is signal to the creator that
  their library is thin in that slot type. Surface this as a coaching
  moment, not an error.
- Never copy asset bytes into the recipe or any artifact destined for
  nevr.land. Slots are pure structure (TD-229).
