---
id: N-atel-401-transitions
title: Transitions and the interaction layer
type: note
track: ATEL-401
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-401
  - transitions
  - interactions
  - state-machine
difficulty: intermediate
estimatedMinutes: 6
prerequisites:
  - N-atel-101-easings
summary: A transition is the timed bridge from one state to another. Interactions are the triggers that fire those transitions. Together they turn a pile of states into an interactive state machine.
---

## A transition is a bridge with its own timing

States are destinations. A transition is *how you get from A to B* — with a duration and easing that belong to the move, not to either state.

```ts
atelier_configure_transition({
  id,
  stateName: "default",
  targetState: "hover",
  transition: {
    duration: 12,
    easing: "ease-out",
  },
});
```

Read it as: "from `default`, the transition to `hover` takes 12 frames, eased-out." The `duration` is in frames (a positive integer) and the `easing` accepts the same forms you already know — `"ease-out"`, `{ type: "cubic-bezier", x1, y1, x2, y2 }`, `{ type: "spring", stiffness, damping }`, `{ type: "step", steps }`.

Transitions are **directional**. `default → hover` and `hover → default` are configured separately, and they usually differ — entrances ease-out, exits ease-in. Pass `transition: null` to remove a configured transition. A state cannot transition to itself, and the target state must already exist (the tool checks both).

## Interactive motion: default → hover → pressed

The classic button is three states and the transitions between them:

```ts
// states
atelier_add_state({ id, stateName: "hover",   duration: 30 });
atelier_add_state({ id, stateName: "pressed", duration: 30 });
// (hover and pressed typically set parent: "default" — see hierarchical states)

// transitions, each with timing that fits the move
atelier_configure_transition({ id, stateName: "default", targetState: "hover",   transition: { duration: 10, easing: "ease-out" } });
atelier_configure_transition({ id, stateName: "hover",   targetState: "pressed", transition: { duration: 6,  easing: "ease-in"  } });
atelier_configure_transition({ id, stateName: "pressed", targetState: "hover",   transition: { duration: 8,  easing: "ease-out" } });
atelier_configure_transition({ id, stateName: "hover",   targetState: "default", transition: { duration: 14, easing: "ease-in"  } });
```

At this point the document *describes* a state machine — but nothing fires the transitions yet. States and transitions are pure data. Something has to say "go."

## The interaction layer — triggers that fire transitions

`atelier_add_interaction` attaches a **trigger → action** binding to a layer. The trigger is the event; the action is what happens.

```ts
atelier_add_interaction({
  id,
  layerId: "button",
  interactionId: "to-hover",
  trigger: { type: "hover" },
  action: { type: "go-to-state", state: "hover" },
  description: "Lift the button when the pointer enters",
});
```

Triggers: `click`, `hover`, `pointerdown`, `pointerup`, `timer` (needs a `delay` in ms), `signal` (needs a `signal` name). Actions: `go-to-state` (needs a `state`), `emit-signal`, `set-variable`, `toggle-visibility`. For the button you wire `hover → go-to-state hover`, `pointerdown → go-to-state pressed`, `pointerup → go-to-state hover`.

A `go-to-state` action does **not** snap. It runs the **transition** you configured from the current state to the target — with that transition's duration and easing. Interactions decide *when*; transitions decide *how it looks getting there*. If no transition is configured for that pair, the runtime cuts to the target's frame 0.

## Two-trigger patterns worth knowing

- **Auto-advance:** a `timer` trigger with `delay` plus `go-to-state` — an intro state that walks itself to the main state after N milliseconds, no input required.
- **Decoupled choreography:** one layer's `click` action is `emit-signal`; another layer has a `signal` trigger that does `go-to-state`. The clicker doesn't know who's listening. This is how a single tap drives several layers into new states without hard-wiring them together.

## Inspecting an interaction

```ts
atelier_list_interactions({ id });            // every layer
atelier_list_interactions({ id, layerId: "button" });  // one layer
```

The studio's interaction inspector shows each binding and lets you fire it manually to watch the transition play. If a click "does nothing," it is almost always a missing transition for that state pair — the action fired, but there was no bridge to animate across.

Next: the motion deep dive — springs, expressions, and motion paths.
