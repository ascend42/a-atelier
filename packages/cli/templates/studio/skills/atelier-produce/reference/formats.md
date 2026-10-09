# Formats

```
projects/<series>/
├── KIT.md                        ← Patrick's narrative of the format
├── PLAN.md                       ← deliverable map + cadence (atelier produce plan)
├── .atelier/
│   ├── series-kit.yaml           ← the decided format (enforced every episode)
│   └── sessions/<id>/{session.yaml, refs/}
├── templates/                    ← Hyperframes: intro/, end-card/, lower-third/, short/, thumbnail/
└── episodes/<NNN-slug>/
    ├── media/  transcripts/
    ├── episode.yaml
    └── package/
        ├── youtube/     master.mp4, thumbnail.jpg, title.txt, description.md, chapters.txt, tags.txt
        ├── shorts/      <n>-<slug>.mp4 + <n>-<slug>.<platform>.md
        ├── podcast/     audio.mp3 (or .m4a), episode-art.jpg, show-notes.md
        ├── social/      linkedin.md, x.md, quote-cards/
        ├── newsletter/  newsletter.md
        ├── guest-kit/   clips/, quote-cards/, suggested-post.md
        ├── COPY.md      all copy in one place (copy checkpoint)
        └── CHECKLIST.md platform checks + publish steps
```

## session.yaml (kit)

Same shape as `atelier design` sessions: `id, verb: kit, series, depth,
surface, started, boards[] (id, owner, question, options[] with
recommended/why/writes/facets/concerns, references_rendered, decision
{kind, choice, decided_by, notes[]}), closed, summary`.

## series-kit.yaml

```yaml
version: 1
series: my-podcast
extends: brand                    # inherit _brand/ cascade
intent: { audience: "...", promise: "...", tone: "...", episode_length: "45-60 min" }
platforms: [youtube, shorts, reels, tiktok, apple-podcasts, spotify, linkedin, x]
cadence: { long_form: weekly, shorts_per_episode: 4, release_order: [podcast, youtube, shorts, social] }
deliverables:
  per_episode: [youtube-master, thumbnail, shorts, podcast-audio, show-notes, social-posts, quote-cards, newsletter, guest-kit]
  guest_kit: { clips: 2, quote_cards: 2, suggested_post: true }
recording_spec:
  angles: [wide, host-close, guest-close]
  vertical_safe: "keep faces within the center 9:16 band of each close angle"
  audio: "separate track per speaker"
  thumbnail_moments: "capture 5 s of each speaker reacting, looking at camera"
templates:
  intro: { path: templates/intro, length_s: 4 }
  end_card: { path: templates/end-card, length_s: 15, end_screen_zones: true }
  lower_third: { path: templates/lower-third }
  short: { path: templates/short }
  thumbnail: { path: templates/thumbnail, text_max_words: 4 }
  quote_card: { path: templates/quote-card, sizes: ["1080x1080", "1080x1350", "1080x1920"] }
shorts: { length_s: [20, 60], hook: cold-open, framing: split-speaker, per_episode: 4 }
captions: { words_per_line: 3, emphasis: keyword, position: lower-center-safe }
copy:
  title: "<formula>"
  description: "<template>"
  chapters: "<style>"
  show_notes: "<template>"
  social: { linkedin: "<voice + template>", x: "<voice + template>" }
  newsletter: "<shape>"
trim: { noise_db: -30, min_silence_s: 0.35 }
rules:
  - { id: yt-chapters, source: "support.google.com/youtube/answer/9884579", checked: 2026-10-08 }
  - { id: yt-thumb-file, source: "secondary: thumbnailtest.com", checked: 2026-10-08, verify: true }
decisions:
  - { session: 2026-10-08-kit, board: thumbnail-system, choice: { mix: { face: reaction, text: two-word } }, notes: ["no arrows, ever"] }
```

## episode.yaml

```yaml
id: 012-guest-name
series: my-podcast
started: 2026-10-08T15:00:00Z
sources: [media/cam-a.mp4, media/cam-b.mp4, media/host.wav, media/guest.wav]
steps:
  ingest:     { status: done, qc: ["guest close angle soft focus 12:40-14:10"] }
  transcribe: { status: done, transcript: transcripts/cam-a.json }
  trim:       { status: done, cuts: 143 }
  words:      { status: done }
  shorts:     { status: done, picked: [{ start: "00:12:03", end: "00:12:41", hook: "..." }] }
  thumbnail:  { status: pending }
  render:     { status: todo }
  copy:       { status: todo }
  check:      { status: todo }
  package:    { status: todo }
```

Resume = first step whose status isn't `done`.
