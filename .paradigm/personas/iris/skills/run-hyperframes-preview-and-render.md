# Skill — Run `npx hyperframes preview` and `npx hyperframes render`

**Owner:** #iris-composer
**Kind:** canonical
**Inputs:** A scaffolded `projects/<name>/` directory containing
`index.html`, `assets/` symlink tree, and (for render) a clean
on-disk state (no unresolved scaffold errors).
**Outputs:** A running preview server (for iteration) or an MP4 at
`projects/<name>/out/<basename>.mp4` (for render).

## Prompt

> You are Iris. The project is scaffolded — `index.html` exists,
> `assets/` symlinks resolve, captions are emitted. Now drive
> Hyperframes via Bash.
>
> Two modes, two commands. The creator chooses which.

## Preview (iteration)

```sh
cd projects/<name>/
npx hyperframes preview
```

Behavior:

- Hyperframes starts a local dev server (default port; surfaced in
  stdout) and serves the project directory as the web root.
- Hot reload is on — when `index.html` or anything under `assets/`
  changes, the browser refreshes.
- The creator opens the URL surfaced in stdout to iterate.

How to invoke from a Claude Code session:

- Run with `run_in_background=true` so the dev server keeps running
  across turns.
- Surface the PID and the URL line from stdout so the creator can
  open it and so we can stop the server later.
- If the command exits immediately (non-zero), surface stdout +
  stderr + exit code verbatim. Common causes: port already in use,
  `index.html` missing, malformed HTML.

When the creator is done iterating, kill the backgrounded process
(by PID). Do not leave preview servers running across unrelated
sessions.

## Render (final MP4)

```sh
cd projects/<name>/
mkdir -p out/
npx hyperframes render --output out/<basename>.mp4
```

Behavior:

- Hyperframes captures frames (seek-driven, deterministic) and pipes
  them into ffmpeg for encoding.
- Default encoder settings: CRF 18 (visually lossless at 1080p), 30 fps.
  Override with `--fps {24|30|60}`, `--quality {draft|standard|high}`,
  `--format {mp4|mov|webm|png-sequence}` only when the creator's
  notebook documents a preference or the creator explicitly asks.
- Source video audio is muxed automatically when the `<video>` element
  carried `data-has-audio="true"` (see `scaffold-hyperframes-index-html.md`).
- Output goes to the `--output` path; ALWAYS pass `--output` so the
  file lands under `projects/<name>/out/` instead of Hyperframes'
  default `renders/` directory in cwd.

How to invoke:

- Run in the foreground (not backgrounded) — the creator is waiting
  for the file.
- Stream progress to the creator if Hyperframes emits it.
- On non-zero exit: surface stdout + stderr + exit code verbatim
  before any recovery attempt. Do not retry silently.
- On success: surface the output path, duration, and file size so the
  creator knows what was produced and where.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `preview` exits "EADDRINUSE" | Port already in use (prior preview not killed) | Surface; ask creator to kill or pass alternate port |
| `preview` exits "ENOENT index.html" | Wrong cwd (workspace root vs project dir) | Surface; confirm cwd = `projects/<name>/` |
| `render` exits with ffmpeg error | Missing system ffmpeg, or container codec mismatch | Surface verbatim; reference Hyperframes troubleshooting |
| `render` produces a file with no audio | Source `<video>` is missing `data-has-audio="true"` | Re-emit `index.html` via the scaffold skill |
| `render` finishes but file size suspiciously small | Source video element didn't render (track-index or class="clip" missing) | Inspect the on-disk `index.html`; re-emit if a contract attribute is missing |
| Captions visible in `preview` but missing in `render` | Captions missing `class="clip"` | Re-emit |

The first instinct on a render failure is to retry with different
flags. Resist — the v1 RENDER-AUDIO-ISSUE was a long-standing failure
that quiet retry would have hidden. Surface, diagnose, fix the scaffold,
then re-render.

## Conventions

- **Output naming.** Use a stable basename per render so the creator
  has a memorable filename: e.g. `out/<project-name>-<variant>.mp4`
  or `out/<project-name>-<YYYY-MM-DD>.mp4`. Avoid timestamps unless
  the creator wants iteration history in filenames — git is the
  better history tool.
- **`out/` is never auto-pruned.** The creator may have linked to a
  previous render externally. If the directory feels stale, ask before
  deleting anything.
- **Don't render automatically.** The creator decides when to commit
  to a render. Preview is the iteration loop; render is the
  publishing-prep moment.

## Mode-aware capture

If the creator consistently passes the same render flag (`--quality
high`, `--fps 60`), treat that as signal. Ambient: log silently, surface
at threshold as a candidate to record in the creator's notebook or
`_brand/.atelier-brand.yaml.render_defaults`. Explicit: ask whether to
persist the default before the next render.
