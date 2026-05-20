---
id: N-atel-701-video
title: Video export — MP4 and GIF via FFmpeg, WebM in the studio
type: note
track: ATEL-701
author: atelier
created: '2026-05-20'
updated: '2026-05-20'
tags:
  - course
  - atel-701
  - video
  - ffmpeg
  - webcodecs
difficulty: intermediate
estimatedMinutes: 7
prerequisites:
  - N-atel-101-the-atelier-format
summary: '`atelier render` writes MP4 or GIF via FFmpeg from the CLI; the browser studio exports via WebCodecs with no FFmpeg dependency. The two paths use different backends with different install requirements — know which one you''re on.'
---

## `atelier render` — the CLI video path

```bash
atelier render animation.atelier                    # → animation.mp4
atelier render animation.atelier -f gif             # → animation.gif
atelier render animation.atelier -o out/clip.mp4    # custom output path
atelier render animation.atelier -s intro outro     # specific states, in order
```

Flags:

- `-o, --output <path>` — output path (format inferred from the extension if `--format` is absent)
- `-f, --format <type>` — `mp4` or `gif`
- `-s, --state <names...>` — one or more states to render, **in order** (defaults to all states, in document order). This is variadic — `-s intro outro` renders intro then outro into one file.

With no flags it renders every state in order to `<name>.mp4`. With `-o foo.gif` and no `--format`, it infers GIF from the extension. The CLI renders **MP4 and GIF only** — there is no `webm` here. (WebM lives in the studio path, below.)

The render loop resolves each frame, draws it to a canvas, and pipes the raw frames straight into FFmpeg over stdin — MP4 via `libx264` (CRF 18, `+faststart` so it streams), GIF via single-pass palette generation. A live progress line on stderr reports `frame N/total`, percent, current state, and an ETA.

## Two requirements the CLI path enforces

**FFmpeg must be on `$PATH`.** Before rendering anything, `atelier render` shells out to `ffmpeg -version`. If it's missing you get an install hint and a non-zero exit, not a half-written file:

```
FFmpeg is not installed or not in PATH.
Install it:
  macOS:   brew install ffmpeg
  Ubuntu:  sudo apt install ffmpeg
  Windows: https://ffmpeg.org/download.html
```

**H.264 requires even dimensions.** MP4 export refuses an odd-width or odd-height canvas with a message that tells you the next even size to try. GIF has no such constraint.

## The backend distinction — read this carefully

The single-frame raster path (N-atel-701-png-and-frames) uses `@napi-rs/canvas` — prebuilt binaries, no system libraries, works on a plain `npm install`. **The video path does not.**

`atelier render` rasterizes frames with the `canvas` (node-canvas) package, which is a separate, optional native dependency that **does** need a toolchain and system libraries:

```
The 'canvas' package is not installed.
Install it with:
  npm install canvas
Prerequisites vary by OS:
  macOS:   brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
  Ubuntu:  sudo apt install build-essential libcairo2-dev libpango1.0-dev ...
```

So "PNG export works on a clean install" is true — and it does **not** imply "MP4 export works on a clean install." Video from the CLI asks for two things the raster path never does: FFmpeg on `$PATH` and the `canvas` package with its cairo/pango stack. If you only ever need stills, you never touch any of it.

## The studio path — WebCodecs, no FFmpeg

The browser studio doesn't shell out to FFmpeg and can't install cairo. Its Export button encodes video with **WebCodecs**, the browser's native video-encode API. That's the headline tradeoff:

- **No external dependency.** A user with a modern browser exports video with nothing installed — no FFmpeg, no node-canvas, no toolchain. The encoder is in the browser already.
- **Different format reach.** WebCodecs handles the codecs the browser ships (commonly MP4 and WebM). FFmpeg, on the CLI, reaches whatever your local FFmpeg build supports.
- **Different scale point.** The studio path is interactive and per-document — you hit Export and get a file. The CLI path is scriptable and batchable — you wire `atelier render` into a build, a Makefile, a CI job.

## Choosing a video target

- **Social / web video** → MP4 (H.264). Universal playback, good compression. `atelier render clip.atelier` or the studio Export button.
- **Short looping animation, chat/README embed** → GIF. Larger files, no audio, but plays everywhere with no `<video>` tag. `atelier render clip.atelier -f gif`.
- **Web video where size matters and the audience is modern browsers** → WebM, via the studio.
- **Automated/batch rendering** → the CLI (`atelier render`), so it scripts.
- **One-off export while editing** → the studio, so you skip the FFmpeg/canvas install entirely.

The destination decides the format; the *how* (CLI vs studio) decides the dependencies. N-atel-701-choosing-output ties this together with the still and vector paths into one decision guide.
