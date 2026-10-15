---
name: atelier-install
description: Install or repair Atelier Design + Produce on this machine from this repo clone. Use when the user asks to install, set up, or update Atelier, asks "can you use atelier design / atelier produce" and the atelier-design or atelier-produce skill is NOT available in this session, or `atelier doctor` reports problems. If the atelier-design skill is available, use that skill for design work instead.
---

# Install Atelier Design + Produce

`atelier design` and `atelier produce` are user-level Claude Code skills.
Cloning this repo does not install them. `atelier setup` copies them (and
the crew: Luna, Mika, Patrick, Lux, Quill, Iris) into the user's home so
they work in every repo.

Say what you're about to do in one line, then run these from the repo root:

1. **pnpm** — this is a pnpm workspace; `npm install` fails.
   `pnpm --version` || `corepack enable` (ships with Node ≥ 20).
2. `pnpm install`
3. `pnpm build`
4. `node packages/cli/dist/cli.js setup`
   (add `--home <atelier-workspace>` if the user has a brand workspace).
5. `node packages/cli/dist/cli.js doctor` and report the result. Media
   warnings (ffmpeg, whisper-cli) only matter for produce episode runs.
6. Optional, ask first: put `atelier` on PATH with
   `cd packages/cli && npm link`. Sessions work without it; setup records
   how to call the CLI in `~/.atelier/config.yaml`.

Then tell the user: **start a new Claude Code session** (skills load at
session start) and ask "can we use atelier design for this?" in any repo.

If a step fails, show the error and stop; don't work around it by
editing repo files.
