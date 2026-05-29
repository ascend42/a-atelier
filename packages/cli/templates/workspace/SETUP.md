# Workspace setup runbook

> **For the agent team.** When the creator asks to "get set up" (or "run the
> setup checklist", "am I ready to render", "check my environment"), work
> through this file top to bottom. For each item: run the **Check**, judge it
> against **Pass**, and if it fails, walk the creator through the **Fix** — then
> re-run the Check to confirm. Do NOT skip steps silently. End with the
> **Report** at the bottom: a ✓/✗/– line per item plus the single next action.
>
> Run the checks with the `Bash` tool. Surface command output verbatim when an
> item fails — don't paraphrase errors. Detect the OS first (`uname`) so you
> give the right install command (the Fixes below show macOS/Homebrew; on Linux
> use the distro package manager, on Windows use winget/scoop or the installer
> links).

---

## Required — the creator cannot render without these

### 1. Claude Code
- **Check:** You're running inside it, so this passes by definition.
- **Pass:** This session exists.
- **Fix:** n/a.

### 2. Node.js 22+
- **Check:** `node --version`
- **Pass:** major version ≥ 22. (Everything below runs through `npx`, which needs
  Node — so check this first.)
- **Fix:** Install Node 22 LTS from <https://nodejs.org> (or `nvm install 22 && nvm use 22`).
  Re-run the Check.

### 3. Hyperframes + the render toolchain  ← the important one
Hyperframes is the render engine (Iris drives it via `npx hyperframes preview` /
`render`). There is **no manual install** — `npx` auto-fetches the published
`hyperframes` package on first run. It ships its own dependency checker; use it
as the authoritative check for the whole render toolchain:

- **Check:** `npx --yes hyperframes doctor`
- **Pass:** read the `✓ / ✗` lines it prints. You want `✓` on **FFmpeg**,
  **FFprobe**, and **Chrome** (the three render-critical deps), plus Node and
  adequate Disk/Memory.
  > ⚠️ **`doctor` exits 0 even when a check fails.** Do NOT trust the exit code —
  > judge by the `✗` markers in the output. Surface any `✗` line verbatim.
- **Fix**, per failing line:
  - **FFmpeg / FFprobe ✗** → macOS `brew install ffmpeg` (ships both); Debian/Ubuntu
    `sudo apt install ffmpeg`; Windows `winget install Gyan.FFmpeg`. Required for the
    render → `.mp4`/`.mov`/`.webm` mux and all audio. Re-run `doctor`.
  - **Chrome ✗** → `npx --yes hyperframes browser install` (Hyperframes renders by
    driving headless Chrome). Re-run `doctor`.
  - **Low Memory / Disk ⚠** → renders may fail or run slowly; have the creator free
    resources. Not a hard blocker.
  - **`npx hyperframes` errors entirely** → confirm step 2 passed and the first run
    can reach the npm registry (a corporate proxy may need `npm config set proxy`).

---

## Optional — enhances the workflow, not required to render

### 5. Whisper (transcription)
- **Check:** `whisper-cli --help 2>/dev/null || whisper-cpp --help 2>/dev/null || echo MISSING`
- **Pass:** either binary responds. (Only needed if the creator will drop raw
  recordings into `projects/<name>/media/` for auto-transcription.)
- **Fix:** macOS `brew install whisper-cpp`; otherwise build whisper.cpp from
  <https://github.com/ggerganov/whisper.cpp>. Safe to skip until the first recording.

### 6. Paradigm learning loop (cross-session memory)
- **Check:** `ls ~/.paradigm/notebooks/quill ~/.paradigm/notebooks/lux ~/.paradigm/notebooks/iris 2>/dev/null || echo MISSING`
- **Pass:** all three notebook dirs exist → the team accumulates learning across
  sessions. If MISSING, the agents still work fully from their workspace shims;
  they just don't persist learning between sessions.
- **Fix:** Install the Paradigm plugin and the Atelier personas (Quill / Lux /
  Iris) into `~/.paradigm/`. This is optional — only set it up if the creator
  wants the agents to get smarter over time. Don't block setup on it.

---

## Workspace verification — is THIS workspace intact?

### 7. Scaffold integrity
- **Check:** confirm these exist (use `Glob`/`ls`):
  `workspace.atelier`, `_brand/`, `_packs/`, `projects/`,
  `.claude/agents/atelier-quill.md`, `atelier-lux.md`, `atelier-iris.md`,
  `.paradigm/personas/_shared/cascade-merge.md`, `CLAUDE.md`.
- **Pass:** all present.
- **Fix:** re-run `atelier workspace` in this folder — it's idempotent and
  refreshes scaffold files without touching authored brand artifacts.

### 8. Brand artifacts authored (not placeholders)
- **Check:** read `_brand/DESIGN.md`, `_brand/SCRIPT.md`, `_brand/STORYBOARD.md`
  and `_brand/.atelier-brand.yaml`; look for remaining `TODO` markers or template
  placeholder text.
- **Pass:** the brand reflects the creator's real palette / typography / voice.
- **Fix:** offer to have **@atelier-quill** (voice + design) and **@atelier-lux**
  (visual patterns) interview the creator and fill these in. Placeholders are not
  a hard failure — flag them and move on.

### 9. Fonts staged (if the brand uses custom fonts)
- **Check:** if `_brand/.atelier-brand.yaml` names non-system fonts, confirm the
  files exist under `_assets/fonts/<family>/`.
- **Pass:** every named custom font is present locally.
- **Fix:** stage the font files into `_assets/fonts/<family>/`. This is the
  font-staging pattern — Hyperframes' render step does NOT reliably load web-CDN
  fonts, so brand fonts must be local or renders fall back to a generic sans.

---

## Report

Summarize like this, then state the single next action:

```
Atelier setup check
  ✓ Node.js 22+              v22.x
  ✓ Hyperframes             0.6.x (npx)
  ✓ ffmpeg                  present
  – Whisper                 not installed (optional — needed for transcription)
  – Paradigm learning loop  not installed (optional)
  ✓ Workspace scaffold      intact
  ⚠ Brand artifacts         still has TODO placeholders
  ✓ Fonts                   n/a (system fonts only)

Next: your brand still has placeholders — want @atelier-quill to draft your
voice + @atelier-lux your visual patterns? Or jump straight to a first project.
```

Use ✓ pass, ✗ required-and-failing (must fix before render), ⚠ works-but-attention,
– optional-and-absent.
