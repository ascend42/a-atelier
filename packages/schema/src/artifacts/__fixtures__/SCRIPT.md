---
mode: narrated
target_duration_s: 60
language: en-US
tts_voice: voice.host.primary
---

# Hook
- id: hook-1
  copy: "Most agent frameworks are loops with extra steps."
  intent: "Contrarian opener; primes the listener to disagree, then keeps watching."
  est_duration_s: 2.8
  bind_to_transcript: true

# Story
- id: story-1
  copy: "I spent six months building one. Here's what actually mattered."
  intent: "Establish receipts; promise specificity."
  est_duration_s: 3.6
  bind_to_transcript: true
- id: story-2
  copy: "Three things. Each one is boring. Each one matters."
  intent: "Set the rule-of-three frame for the proof block."
  est_duration_s: 3.2
  bind_to_transcript: true

# Proof
- id: proof-1
  copy: "One: structured artifacts beat clever prompts."
  intent: "Lead with the most defensible claim."
  est_duration_s: 3.0
  bind_to_transcript: true
- id: proof-2
  copy: "Two: the loop must run locally or it will not run at all."
  intent: "Local-first stake-in-the-ground."
  est_duration_s: 3.6
  bind_to_transcript: true
- id: proof-3
  copy: "Three: personas are cheap; recipes are the unit of trade."
  intent: "Set up the CTA."
  est_duration_s: 3.4
  bind_to_transcript: true

# CTA
- id: cta-1
  copy: "Atelier. Link in bio."
  intent: "Single token call-to-action; no verb pileup."
  est_duration_s: 1.8
  bind_to_transcript: true
