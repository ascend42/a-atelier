---
id: N-atel-401-hierarchical-states
title: Hierarchical states — `parent`, inheritance, and merge
type: note
track: ATEL-401
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-401
  - states
  - hierarchy
  - resolve-frame
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-101-easings
summary: A state can name a `parent` and inherit its deltas. Inheritance is per `layer+property` group — the child replaces the whole group or leaves it untouched. Know that one rule and hierarchical states stop surprising you.
---

## Why states inherit

Interactive UI motion is variations on a theme. `hover` is `default` plus a lift. `pressed` is `hover` plus a sink. Re-authoring every shared delta in every state is duplication that drifts — change the entrance once and you have to remember to change it in four places.

A `parent` lets a state say "everything the parent does, plus my changes." You author the shared motion once on the base state and let `hover`, `pressed`, `disabled` extend it.

```ts
atelier_add_state({ id, stateName: "hover", duration: 30 });
atelier_set_state_parent({ id, stateName: "hover", parent: "default" });
```

`atelier_add_state` creates the state with an empty `deltas` array. `atelier_set_state_parent` wires the inheritance link (pass `parent: null` to clear it). The parent must already exist, and a state cannot be its own parent — the tool walks the parent chain and rejects cycles before writing.

## When to use hierarchy (and when not)

Use a parent when states are **variations of the same composition** — the same layers, mostly the same motion, a few overrides. Interaction states (`default` → `hover` → `pressed`) are the canonical case.

Do **not** use a parent to splice unrelated segments of a narrative together. Two states that share no layers and no motion should just be two flat states. Hierarchy earns its keep only when there is real shared motion to inherit.

## How `resolveFrame` merges parent + child

This is the one rule that matters. When a state has a `parent`, the resolver builds the **ancestor chain** (root → … → parent → self), then collects deltas with this algorithm:

1. Group each state's deltas by a `layer+property` key (e.g. `title:opacity`, `title:scale.x`).
2. Walk the chain from root to self. For each `layer+property` key, the **most-derived state's group wins outright**.
3. Flatten the surviving groups into the merged delta list, and resolve the frame against that list.

The merge is **per group, not per field**. If the child declares any delta for `title:opacity`, the parent's `title:opacity` is dropped entirely — the child does not patch the parent's `from`/`easing` and keep the rest. Either the child owns that `layer+property` or it inherits the parent's.

| Key | `default` (parent) | `hover` (child) | Resolved on `hover` |
|---|---|---|---|
| `title:opacity` | fade 0→1 | fade 0→1, faster | **child** (parent dropped) |
| `title:scale.x` | — | 1→1.05 | **child** (new key) |
| `card:shadow.blur` | 4→8 | — | **parent** (inherited) |

So `hover` inherits the card's shadow animation untouched, overrides the title's fade, and adds a title scale the parent never had.

## The trap

The surprising case is partial override. If `default` animates `title:opacity` with a nice spring and `hover` adds *any* `title:opacity` delta — even a tiny one — the spring is gone, replaced wholesale. If you want to keep the parent's motion and add something, add it on a **different property** (or a different layer). One `layer+property` key has exactly one owner in the resolved frame.

## Inspecting the merge

```bash
atelier preview button.atelier --frame 10 --state hover
```

The resolved `ResolvedLayer[]` reflects the merged deltas — if a property looks wrong, it is almost always because a child group silently replaced a parent group you meant to keep. Compare against `--state default` at the same frame to see exactly which keys the child took over.

Next: transitions — how you move *between* these states with timing of their own.
