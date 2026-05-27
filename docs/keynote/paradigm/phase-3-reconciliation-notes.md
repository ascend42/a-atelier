# Phase 3 Reconciliation Notes

> Pre-delegation reconciliation pass. Authored 2026-05-26 as the gate between the documentation/persona work and the actual agent-wiring code work. Not a public-facing spec — it's the orchestrator's reading of the gaps before delegating Phase 3 builder work.

## 1. Tool-name reconciliation

The personas authored in Phase 0 cite MCP tools that don't all exist by those names. Below is the exact mapping. **All persona `persona.yaml` files will be updated to use the right column** as part of the Phase 3 skill-packaging delegation.

| Persona-cited tool | Real surface | Action |
|---|---|---|
| `atelier_get_document` | `atelier_info` (metadata) / `atelier_load` (load by path) | Rename. Use `atelier_info` when persona wants document metadata; `atelier_load` when loading from disk. |
| `atelier_set_layer` | `atelier_add_layer` / `atelier_edit_layer` / `atelier_remove_layer` | Rewrite. Personas use a coarser "set" verb; real surface is granular add/edit/remove. Persona prompts updated to use the right verb for each operation. |
| `atelier_set_layer_transform` | `atelier_edit_layer` (transform fields) | Rewrite. Transform lives on the layer; edit it via `atelier_edit_layer`. |
| `atelier_set_layer_style` | `atelier_edit_visual` + `atelier_set_fill` / `atelier_set_stroke` | Rewrite. Layer style is the layer's visual; mutate via the visual tools. |
| `atelier_set_text_layer` | `atelier_edit_visual` (with text visual fields) | Rewrite. Text content/style lives on a text visual. |
| `atelier_reorder_layers` | `atelier_reorder` | **Rename only.** |
| `atelier_set_canvas` | (no exact match) | Defer. Canvas resize is rare; if Lux/Iris needs it later, add `atelier_set_canvas` as a new MCP tool then. Not core. |
| `atelier_silence_trim` | CLI: `atelier trim` | **Shell out.** Personas invoke the CLI via Bash. Avoids duplicating audio pipeline as MCP. |
| `atelier_transcribe` | CLI: `atelier transcribe` | **Shell out.** Same. |
| `atelier_generate_captions` | CLI: `atelier captions` | **Shell out.** Same. |
| `atelier_set_audio_layer` | `atelier_set_audio` (state config) | **Rename only.** Existing tool sets audio config per state. |
| `atelier_get_transcript` | `fs.readFile` on `transcripts/<name>.json` | Read directly. Transcript is on disk; no MCP wrapper needed. |
| `atelier_mind_map_query` | (does not exist) | **Build stub.** Phase 3 delegation 2: minimum mind-map MCP tool that walks `<project-dir>/.atelier/mind-map/` (or `assets/`) and returns matches by slot `kind`. ~50 lines. No ingestion, no indexing — just a directory query that returns paths matching the slot pattern. |

### Net new MCP tool to add (Phase 3, delegation 2)
- `atelier_mind_map_query({ projectDir, kind, hints? }): { matches: string[] }` — walks the project's local asset registry, returns paths whose extension matches the slot `kind` (image → png/jpg/webp/etc., audio → mp3/wav, etc.) optionally filtered by `hints` (substring match on filename or directory). Pure read; no writes. Registers a portal gate `^valid-mind-map-query` (validation gate for input shape).

### Audio-pipeline policy
The persona prompts will explicitly say: "for silence-trim, transcribe, captions — invoke the CLI verbs via Bash (`atelier trim …`, `atelier transcribe …`, `atelier captions …`). These produce `transcripts/<name>.json` and `cuts.json` files; read them with normal filesystem reads." This matches how `paradigm:builder` agents already work and avoids duplicating shipped CLI functionality as MCP tools.

## 2. Skill-loading mechanism

**Decision: persona → `.claude/agents/` markdown files.** Claude Code reads `.claude/agents/<name>.md` from the project root (and `~/.claude/agents/` for user-level). Each file is a single markdown doc with the agent's system prompt and tool/MCP-server allowlist in frontmatter. Inert per TD-229.

The pattern:
```
.claude/
  agents/
    atelier-quill.md
    atelier-lux.md
    atelier-iris.md
```

Each `.claude/agents/<name>.md` wraps the corresponding `.paradigm/personas/<id>/system-prompt.md` content with:
- YAML frontmatter declaring name, description, allowed tools (real MCP tool names from the reconciliation table above), and any model preference.
- Body content: the system prompt verbatim or lightly adapted.
- Cross-reference to `.paradigm/personas/<id>/` for the source-of-truth definition (so the agent file stays a thin wrapper).

**Why not Claude Code skills (`.claude/skills/`)?** Skills are tool-like capabilities the model can invoke. We want full agent personas with their own system prompts and conversational identity — that's the `.claude/agents/` shape. Skills could come later for finer-grained capabilities like "write a 30s hook" — those map cleanly to the per-persona skill files already on disk. But for v1, agents are the right primitive.

**Why not modify the external `a-atelier-plugin` repo?** That repo ships the MCP server. The personas-as-agents layer is per-project and benefits from living next to the project. Atelier installs the plugin (MCP); the project provides the agents. If we later want to ship agents globally, we promote them to the plugin repo — but that's not core.

## 3. First-run setup flow

`atelier init <project-dir>` (Phase 3, delegation 4):
- Creates `<project-dir>` if absent.
- Asks the creator: "How should your agent team learn? (Ambient / Explicit) — see paradigm://… for details." (TD-2026-05-26-646)
- Writes `<project-dir>/.atelier/learning-mode.yaml` with the choice.
- Calls into existing `scaffold` to drop DESIGN/SCRIPT/STORYBOARD templates.
- Creates `<project-dir>/.atelier/mind-map/` as an empty directory with a README explaining what to put there.
- Optionally `git init` per artifact-spec §9 Q8 recommendation (with `--no-git` opt-out).

## 4. What's explicitly NOT in the core build

Per the user's "finish the core then test together" greenlight, these are deferred to post-test iteration:

- **Generation seam interface.** Atelier owns no generation today (TD-088). Agents orchestrate external Higgsfield. The seam interface is Phase 5 territory.
- **nevr.land publish/install** and the full inert-artifact marketplace surface. Phase 6.
- **Style extraction (Imitator path).** Phase 7.
- **TTS-out.** Narrated SCRIPT mode tests with `est_duration_s` text-derived estimates; real TTS waits.
- **Full mind-map ingestion + curation + reindex.** Stub above is enough for testing.
- **Headless MCP video export.** Studio's browser exports cover the testing path.
- **`atelier artifacts show` / `diff`.** Polish.
- **Hook auto-validation.** Polish.
- **`docs/specs/atelier/project-model.md`.** Paper deliverable; the actual Project shape is implicit in the artifact spec + scaffold templates. Write it after first iteration when we know the shape.

## 5. Build sequence (post-this-doc)

Strict order; each delegation depends on the previous. Internal verification after each (tests + `paradigm compliance-check`).

1. **Delegation A** — `.claude/agents/` files for Quill/Lux/Iris + persona.yaml rewrites to real tool names. Updates this doc's reconciliation table into both `.paradigm/personas/<id>/persona.yaml` and the Claude Code-facing agent wrappers.
2. **Delegation B** — Minimum `atelier_mind_map_query` MCP tool. Includes portal gate registration, `.purpose` update, tests.
3. **Delegation C** — `atelier init <project-dir>` command. Includes the Ambient/Explicit prompt and `learning-mode.yaml` write.

If a fourth delegation queues, that's Phase 4+ territory — stop and surface to the user.

## 6. Risk register

- **Persona system prompts reference behaviors that need Phase 4 mind-map.** Mitigation: the stub returns paths or empty arrays; persona behavior degrades gracefully (Lux surfaces "your library is thin on `image.b-roll.tech`" when query returns empty — that's already in the system prompt).
- **Audio-pipeline shell-out has worse error handling than MCP.** Mitigation: personas instructed to surface CLI exit codes and stderr to the creator. Real fix is MCP-wrapping the audio pipeline in a later phase.
- **Tool-name renames in persona.yaml may diverge from system-prompt.md prose.** Mitigation: builder updates both in the same delegation, with a final grep-sanity-check.

---

*Sources: `.paradigm/personas/quill,lux,iris/persona.yaml`; `packages/mcp/src/tools/` (19 tool files); `packages/cli/src/commands/` (trim, transcribe, captions); `docs/keynote/paradigm/atelier-creator-roadmap.md`. Decisions cited: TD-2026-05-26-088, -210, -229, -363, -540, -646.*
