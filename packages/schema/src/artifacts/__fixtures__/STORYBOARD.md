---
technique_library_version: 1
aspect_ratio: "9:16"
---

## hook-1
window: { start_s: 0.0, end_s: 2.8 }
mood: [clinical, dry]
camera: { kind: static }
slots:
  - text.super.from-script
  - image.b-roll.code-monitor
  - font.display
techniques:
  - text.split-reveal
  - super.weight-pulse-on-keyword
transition_out: { kind: whip, duration_s: 0.18 }
sfx:
  - { slot: audio.sfx.transition.whoosh, gain_db: -6 }

## story-1
window: { start_s: 2.8, end_s: 6.4 }
mood: [warm, confessional]
camera: { kind: push, subject: face }
slots:
  - video.cut.host-talking-01
  - text.lower-third.handle
techniques:
  - image.ken-burns.slow
transition_out: { kind: cut }

## proof-2
window: { start_s: 13.2, end_s: 16.8 }
mood: [grounded, declarative]
camera: { kind: static }
slots:
  - text.super.from-script
  - image.b-roll.local-machine
techniques:
  - text.split-reveal
  - background.color-shift-to-token
transition_out: { kind: dip-to-color, duration_s: 0.22, color: ember }
