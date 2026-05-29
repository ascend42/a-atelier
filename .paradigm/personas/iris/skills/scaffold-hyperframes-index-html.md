# Skill — Scaffold `index.html` (HTML craft reference)

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** Merged `.atelier-brand.yaml` (palette + typography),
merged STORYBOARD.md (beats with timing windows + asset refs +
overlay text), canvas dimensions (from the merged DESIGN's aspect /
project canvas spec).
**Outputs:** A complete `projects/<name>/index.html`.

This is the deep-dive reference. The orchestration is in
`scaffold-hyperframes-from-storyboard.md` — that skill calls into
this one when it's time to actually write the HTML.

## Prompt

> You are Iris, emitting `index.html`. The output is a single HTML file
> Hyperframes can preview and render. Follow the canonical structure
> below and the timing-attribute contract — Hyperframes is strict
> about the data attributes, and "looks right in preview but breaks in
> render" is almost always a contract violation.

## Canonical structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Atelier composition — <project-name></title>

  <!-- (1) Brand CSS vars — sourced from merged .atelier-brand.yaml. -->
  <style>
    :root {
      --brand-palette-paper: #ffffff;
      --brand-palette-ink: #111111;
      --brand-palette-accent: #ff5a1f;
      --brand-font-display: "DM Sans";
      --brand-font-body: "Inter";
    }
  </style>

  <!-- (2) Base layout + caption styles. -->
  <style>
    html, body {
      margin: 0; padding: 0;
      width: 1080px; height: 1920px;       /* canvas dimensions */
      overflow: hidden;
      background: var(--brand-palette-paper, #000);
      font-family: var(--brand-font-body, system-ui, sans-serif);
    }
    .stage { position: relative; width: 100%; height: 100%; }
    .stage > video, .stage > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
    .caption {
      position: absolute; left: 5%; right: 5%; bottom: 12%;
      text-align: center;
      font-family: var(--brand-font-display, var(--brand-font-body, system-ui, sans-serif));
      font-weight: 700; font-size: 84px; line-height: 1.2;
      color: var(--brand-palette-paper, #fff);
      text-shadow: 0 2px 12px rgba(0,0,0,0.7);
      letter-spacing: 0.01em;
    }
  </style>
</head>
<body>
  <!-- (3) Root composition wrapper — REQUIRED by Hyperframes. -->
  <div id="root"
       data-composition-id="root"
       data-width="1080"
       data-height="1920">

    <div class="stage">
      <!-- (4) Source video — base track. Native audio muxed via data-has-audio. -->
      <video
        class="clip"
        src="assets/<videoFilename>"
        data-start="0"
        data-duration="<videoDurationSeconds>"
        data-track-index="0"
        data-has-audio="true"
        playsinline></video>

      <!-- (5) Per-beat overlays from STORYBOARD. One element per beat. -->
      <img
        class="clip"
        src="assets/<assetFromPack>"
        data-start="3.2"
        data-duration="2.0"
        data-track-index="5" />

      <!-- (6) Captions from transcript segments. -->
      <div
        class="clip caption"
        data-start="0.0"
        data-duration="1.4"
        data-track-index="10">First caption text.</div>
    </div>
  </div>
</body>
</html>
```

## Why each part exists (annotated)

**(1) `:root` CSS variables from merged `.atelier-brand.yaml`.**
Hyperframes templates and caption styles consume vars by name; the
creator (and future Iris invocations) can change one brand token
without rebuilding the rest. Naming convention: `--brand-palette-<role>`
(`paper`, `ink`, `accent`) and `--brand-font-<usage>` (`display`,
`body`). Role takes precedence over name in the merged YAML because
role is the semantic anchor techniques bind against. When palette or
typography is missing from the merged brand, emit a `<style>/* No
brand tokens — .atelier-brand.yaml missing palette + typography */</style>`
fallback and surface to the creator — do not silently invent colors.

**(2) Base layout + caption styles.** Canvas-sized html/body so
Hyperframes captures at exactly the declared resolution (the producer
scales encoder output to match). `object-fit: contain` for source video
so non-matching aspect ratios letterbox rather than crop. Caption
styles draw on the brand font vars; the font-size choice (≈4.4% of
canvas height in the v0 spike) is a reasonable default — override per
project if the creator has a documented preference.

**(3) Root composition wrapper.** Hyperframes REQUIRES `data-composition-id`
on every composition's root, and `data-width` + `data-height` set
the canvas dimensions for the timeline. The spike (in
`packages/hyperframes-adapter/src/storyboard-to-html.ts`) skipped this
because Hyperframes was lenient — but the canonical contract is to
include it. Don't rely on the leniency; it's not promised across
versions.

**(4) Source video as base track.** The v1 RENDER-AUDIO-ISSUE diagnosed
exactly the failure mode this prevents: when audio is missing from the
final MP4, it's because the source video element didn't signal native
audio passthrough. `data-has-audio="true"` is the explicit signal
Hyperframes' producer uses to mux source audio into the encode. Always
set it on the source video element when the source has audio. (The v1
fix on the Atelier side was a two-input ffmpeg filter graph; v2
delegates that to Hyperframes — but only if we send the right signal.)
`class="clip"` marks the element as timed; without it, Hyperframes
doesn't manage visibility. `data-track-index="0"` puts it at the back.

**(5) Per-beat overlay elements from STORYBOARD.** One element per beat.
The element type is driven by the beat's asset ref or content (`<img>`
for static images, `<video>` for layered video, `<div>` for graphic
overlays or composed groups). `data-start` and `data-duration` come
directly from the beat's timing window in seconds — never frames.
`data-track-index` reflects the z-stack the storyboard implies; if Lux
didn't specify, pick a reasonable layer (foreground overlays at 5,
captions at 10, decorative grain on top at 20).

**(6) Captions from transcript segments.** One `<div class="clip
caption">` per segment from `projects/<name>/transcripts/<basename>.json`.
`data-start` = segment start, `data-duration` = segment end − start.
Captions go on the highest track index by default so they sit on top
of everything. See `compose-captions-into-hyperframes.md` for the
full procedure.

## Timing-attribute contract (load-bearing)

| Attribute | Unit / Type | When required | Notes |
|---|---|---|---|
| `data-start` | seconds (number) or clip-id reference (e.g. `"intro + 2"`) | every clip | Relative refs let you re-time without recalculating downstream |
| `data-duration` | seconds (number) | every image clip; optional for video/audio (defaults to source length) | NEVER frames; NEVER milliseconds |
| `data-track-index` | integer | every clip (use explicit values; don't rely on DOM order) | Higher = front; clips on the same track cannot overlap |
| `class="clip"` | — | every timed element | Without this, Hyperframes does not manage visibility |
| `data-has-audio` | `"true"` | `<video>` source elements with native audio | The v1 audio-drop bug was specifically about this signal |
| `data-volume` | 0–1 | optional on `<audio>` / `<video>` | Mix multiple audio sources |
| `data-media-start` | seconds | optional | Trim playback offset into the source media |
| `data-composition-id` | string | required on root + every nested composition | Hyperframes uses this to register the wrapper |
| `data-width` / `data-height` | pixels | required on root | Drives canvas resolution |

## Failure modes

- **Caption appears in preview but missing in render** → almost always
  a missing `class="clip"`. Check every timed element.
- **Source video plays silently in render** → check `data-has-audio="true"`
  on the `<video>`. The v1 bug.
- **Overlay covers source video unexpectedly** → check `data-track-index`
  — lower number = further back. Don't rely on `z-index` CSS; Hyperframes
  doesn't read it.
- **Hot reload misses an edit** → confirm cwd of `npx hyperframes preview`
  is `projects/<name>/`, not workspace root.

## Conventions

- **Asset paths are RELATIVE to the project root** (e.g.
  `assets/IMG_7346.MOV`). Hyperframes' file server serves
  `projects/<name>/` as its web root. Symlinks under `assets/` resolve
  per the underlying OS — Hyperframes follows them.
- **Transparent background on a beat lets the underlying track show
  through.** Opaque covers it. This is how foreground graphics layer
  cleanly over the source video.
- **Quote font names in CSS vars** that contain spaces (`"DM Sans"`,
  not `DM Sans`). The brand YAML may declare either form; normalize
  on emit.
- **Slugify role/usage names** for CSS var names: lowercase,
  non-alphanumeric → single hyphen, trim leading/trailing hyphens.
  "Primary Heading" → `--brand-font-primary-heading`.
