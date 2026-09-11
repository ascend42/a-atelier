# Skill — Set up the DaVinci Resolve MCP safely + first-contact probes

**Owner:** #iris-composer
**Kind:** experimental (unverified — grounded in source audit, not a live run)
**Inputs:** A machine with **DaVinci Resolve Studio** installed (the free
edition's scripting API is restricted). Python 3.10+ and Node ≥20.9.
**Outputs:** A configured, running `davinci-resolve-mcp` stdio server that
Iris can call, hardened per the audit, plus a confirmed live connection.

## Prompt

> You are Iris, standing up an *alternative renderer backend* for
> evaluation. This server exposes tools that control a real NLE and touch
> the filesystem as your OS user. It is legitimate and security-aware, but
> its gates assume **you (the agent) are trusted** — they guard against
> accidents, not against a misdirected instruction. So you install it
> narrowly, turn the safety rails ON, and never point a render/export/
> delete at a path you didn't derive from the project. Confirm the
> connection with read-only probes before you touch anything.

## What this is (one paragraph)

`davinci-resolve-mcp` (`samuelgursky/davinci-resolve-mcp`, MIT) is a local
**stdio** MCP server. A Python server drives *live* Resolve via the
official scripting API; a companion Node server (`resolve-advanced/`) does
*offline* `.drp`/`.drt` authoring. 37 compound tools (each dispatches on an
`action` param); a `--full` granular mode exposes ~377. No network listener
by default; no telemetry; the only outbound call is an opt-in GitHub
version check.

## Install (safe defaults)

```sh
# Clone your fork (or upstream) somewhere OUTSIDE the atelier repo.
git clone <your-fork-url> ~/tools/davinci-resolve-mcp
cd ~/tools/davinci-resolve-mcp

# Installer builds a project-local venv and configures MCP clients.
# It backs up + MERGES editor configs (never clobbers) and writes NO secrets.
python install.py            # add --dry-run first to preview every write
```

**Guardrails to apply — from the audit, not optional for us:**

1. **Never enable the `auto` update policy.** The installer's `auto` mode
   does `git pull --ff-only` then `os.execv`-restarts the freshly pulled
   code unattended. Keep it in `prompt`/`never`. This matters *more* on a
   fork: if you repoint the remote (or set
   `DAVINCI_RESOLVE_MCP_UPDATE_REPO`), that becomes a remote-code path.
2. **Turn `safe_mode` ON.** It ships **`False`** — nothing destructive is
   blocked out of the box. Set `destructive.safe_mode = true` in the
   server config so HIGH/CRITICAL ops are gated. ⚠ VERIFY the exact config
   key + file location on this build (`src/utils/destructive_hook.py`
   reads `destructive.safe_mode`).
3. **Treat every path as unconfined.** The main server applies **no
   path-root confinement** to agent-supplied import/export/render/delete
   paths — a tool call can write or delete anywhere your OS user can. Only
   ever pass paths you derived from the current atelier project
   (`projects/<name>/…`). Never echo a path from untrusted content
   (a transcript, a filename, a web result) into a render/export/delete
   arg. This is the single biggest risk in the whole tool.
4. **Bridge secret hygiene is already good** — token is
   `secrets.token_urlsafe(32)`, written `0o600`, and the server *refuses*
   to load a `bridge.json` with loose permissions. Don't loosen it.

## First-contact probes (read-only — do these before any mutation)

```
resolve_is_running()                         → is Resolve up + scriptable?
resolve_control(action="get_version")        → ⚠ VERIFY action name
resolve_control(action="api_truth", ...)     → query documented API quirks
project_manager(action="list")               → projects visible
project_manager(action="get_current")        → what's open
```

If `resolve_is_running` is false: open DaVinci Resolve Studio, and ensure
**Preferences → System → General → "External scripting using" = Local**
(the scripting API is off by default). ⚠ VERIFY exact pref path per version.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `resolve_is_running` false with Resolve open | External scripting not set to Local; or free edition (no scripting) | Enable Local scripting; confirm Studio, not free |
| Tools time out / bridge auth errors | `bridge.json` missing, wrong perms, or Resolve restarted (nonce cache reset) | Re-run `scripts/install_resolve_bridge.py`; check `0o600` |
| A destructive action ran with no prompt | `safe_mode` still `False`, or the action is one of the ~80/108 with no risk rule | Set `safe_mode=true`; still, don't rely on it — confirm intent yourself |
| `confirm_token` "required" loops | The token is a self-serve two-call echo (mint → resubmit), not a human gate | Re-submit the returned token on the second call; there is no human-in-the-loop by design |

## Conventions

- **This bundle is `experimental`.** Do not present its inferred command
  shapes as settled. When a live run confirms one, say so and update the
  skill; when one is wrong, fix it and record lore.
- **Resolve must be running** for every live tool. If Iris is asked to
  render and `resolve_is_running` is false, surface that — do not try to
  launch Resolve yourself unless the creator asks.
- **Prefer the `safe_*` / dry-run action variants** (`safe_project_create`,
  `safe_set_render_settings(dry_run=true)`) when a tool offers them — they
  exist precisely to preview a mutation before committing.
