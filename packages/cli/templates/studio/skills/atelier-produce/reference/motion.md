# Motion reference (video)

Lux reads this before writing `tokens.motion` or any template with movement (intro card, end card, lower-thirds, shorts, quote cards). Iris reads it before building, and runs `atelier render-check` on every render.

**These are starting values, not law.** They come from one published study of professional launch and promo films (motionmaxxing: 53 frame-accurate moments, about 4,300 measured moves). Source: github.com/Tejashmakwana/motionmaxxing (Apache-2.0), `references/motion.md` and `docs/HOW-IT-WAS-BUILT.md`; ideas restated in Atelier's own words, no code or text copied. That study is single-author, its film set is private, and it covers launch films only. Anything the brand cascade records (`_brand/`, `tokens.motion`, `design-system.yaml` overrides) wins. Podcasts, explainers and calm brands usually want longer holds and more fades than a launch film.

## 1. The rule underneath

Judgment decides **what** moves and what each beat should make the viewer believe. These numbers decide **how** it moves. `atelier render-check` decides whether the render actually did it. Never describe a render as good; quote what the check printed and say which checks were judged by eye.

## 2. Curves

The study grouped real moves into shape families by how much of the travel is done at 10 / 25 / 50% of the time. The curves below are cubic-beziers fitted to those measured profiles, constrained to be monotone with no overshoot. They are Atelier's own fits, for CSS `transition-timing-function` or GSAP `CustomEase`.

| Family | Travel at 10 / 25 / 50% | cubic-bezier | Use for |
|---|---|---|---|
| snap | 50 / 86 / 95 | `(0.20, 0.90, 0.05, 0.95)` | hero entries, a CTA mark landing (about 8% of real moves; spend it) |
| firm decel | 26 / 60 / 85 | `(0.15, 0.25, 0.15, 0.95)` | the workhorse landing: text rising, panels sliding, cards arriving |
| soft decel | 9 / 35 / 73 | `(0.20, 0.05, 0.40, 1.00)` | gentle arrivals, camera settles, calm brands |
| linear | 9 / 24 / 50 | `linear` | drifts, background creep, things carried by a camera move |
| S-curve | 2 / 11 / 41 | `(0.70, 0.15, 0.45, 0.95)` | moves that start and end at rest inside a shot |
| gentle accel | 2 / 7 / 23 | `(0.70, 0.10, 0.95, 0.90)` | soft exits, turns |
| hard accel | 0 / 2 / 8 | `(1.00, 0.05, 1.00, 0.45)` | exits that leave the frame or end on a cut (thrown away at peak speed) |

**Land decelerates, leave accelerates.** About 58% of landings ease out. Exits accelerate and end at peak speed, but 23-29% still ease out or run linear (shrink-to-centre, blur-outs, things swept by a camera), so don't force every exit to accelerate. The wrong curve on the right object reads as floaty or thrown.

**Overshoot is rare and late.** Under 9% of moves overshoot, mostly as a slow lean past the mark that peaks late in the move. Allow at most one visible spring per film. A bounce on everything is an AI default.

## 3. Timing at 30 fps

| Move | Default | Range |
|---|---|---|
| Any move, pooled | 10 f (0.33 s) | 6-24 f |
| Translate / scale entry | 12 f | 6-21 f |
| Opacity, as a helper under a move | 6 f | 4-12 f |
| Translate exit / scale exit | 13 f / 10 f | |
| CTA or sign-off entries | 6 f | hero mark 18-30 f on snap |
| Sibling stagger (letters, rows, tiles) | 1-3 f apart, uneven gaps | each move about 2x its gap, so tails overlap |
| Whole words | 4-6 f apart (headline) | 2-4 f fast hook; 8-12 f voice-led |
| Resolved end hold | 0.6-1.4 s | something still alive on it |

A film built on 20-30 frame ease-outs for everything is slower than every film in the sample. A uniform timer delay between siblings reads as a loading list.

## 4. Arrivals, exits and cuts

- **Arrive by moving, cutting or unmasking.** In the sample, transform entries outnumber opacity fades about 6 to 1. Use opacity only as a short helper under a move. A one-frame hard cut reads as a state change, which suits system events.
- **Nothing grows from zero.** An object with identity (logo, word, cursor, card) arrives decelerating from larger than life (roughly 1.4-5x) or moves in from the edge. Spend scale once per film; endings usually get smaller.
- **Cut on motion.** Scenes start already moving and clips end mid-move. A fade to black is a default, not a decision.
- **Brand exceptions are real.** A brand that fades on purpose (caption fades in a podcast, for example) records it in the cascade, and the record wins.

## 5. How much motion

Short professional moments move on almost every frame, but whole films are calmer: median frame-to-frame change 6.8 (IQR 4.4-9.8), and one major hardware launch film is still for about 55% of its length. Too little and too much both fail. `atelier render-check` prints the film's number as a **question**, not a gate: above about 10, does the film breathe anywhere? Below about 3, does it exist?

The hard rule is narrower: **no dead frames.** A hold longer than about 3 frames keeps one living thing on it (a drift, a caret, light moving). A designed breath of 0.6-1.5 s before a payoff is good when the storyboard states why; pass it to the check with `--allow-hold`.

## 6. The tells to check

The motion tells in `atelier-design/reference/tells.yaml` (scope `content`): page chrome, deck layout, fade everywhere, grow from zero, bounce everywhere, dead frames, long end hold, flat swatch grounds, pinned object, uniform stagger. The page-chrome family is the strongest sign that nobody decided anything.

## 7. When a tell keeps coming back

Ask whether our own wording caused it: agents read instructions literally. Record the root cause as **prescribed** (a skill, template or notebook led the agent there: edit that), **ignored** (a clear rule was broken: make the rule "delete it, don't justify it") or **missing** (no rule: write one).
