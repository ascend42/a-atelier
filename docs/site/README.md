# docs/site/ — Site Content Contract

This directory contains structured project information consumed by the main
a-company site. `INFO.md` is the single source of truth for how this project
appears in the ecosystem.

## For AI Agents

If you're an agent working in this project, read this entire file before
touching `INFO.md`. The rules are strict and intentional.

**Your job**: When you ship a feature, change the project status, or notice
`last_updated` is more than 30 days old — update `INFO.md` following the
rules below. Then set `last_updated` to today's date.

## INFO.md Schema

INFO.md has two parts: **YAML frontmatter** (structured, machine-parseable)
and a **markdown body** (human-readable, exactly 3 sections).

### Frontmatter Fields

```yaml
---
name: ""              # Display name (required)
id: ""                # kebab-case slug, unique across ecosystem (required)
tagline: ""           # One sentence, under 60 characters (required)
status: ""            # One of: live | beta | alpha | prototype | archived (required)
category: ""          # One of: developer-tool | application | game | internal (required)
repo: ""              # Canonical repo URL (required)
demo: ""              # Live URL (optional, omit if none)
npm: ""               # npm package name (optional, omit if not published)
docs: ""              # Docs URL (optional, omit if none)
stack:                # 1-5 primary technologies (required)
  - typescript
last_updated: ""      # ISO date YYYY-MM-DD, MUST update on every edit (required)
---
```

**Field rules:**
- `id` is the clean slug (e.g., `paradigm`, not `a-paradigm2`). It must be
  unique across all projects in the ecosystem.
- `status` must be exactly one of: `live`, `beta`, `alpha`, `prototype`, `archived`.
  Do not invent other values. `coming-soon` is not valid — use `prototype` or `alpha`.
- `category` must be exactly one of: `developer-tool`, `application`, `game`, `internal`.
  Projects marked `internal` are tracked but never surfaced publicly.
- `stack` lists languages and runtimes, not frameworks or libraries.
  Good: `typescript`, `node`, `python`. Bad: `sveltekit`, `express`, `react`.
- `last_updated` must be set to today's date (YYYY-MM-DD) on every edit, no exceptions.
- Omit optional fields entirely if they don't apply. Don't leave them as empty strings.

### Body Sections

The body has **exactly three H2 sections**, in this order. No other sections.
No H1. No H3 or deeper.

#### `## What It Does`

2-4 sentences. Elevator pitch for someone who has never heard of this project.
Write for a developer audience but avoid jargon specific to the implementation.
This is NOT a feature list — it describes the problem solved and how the
project solves it.

#### `## Features`

Bulleted list. 3-8 items. Each item is one line, no sub-bullets.
Start each with a strong noun or verb.
No "and more", "etc.", or filler items.

#### `## Changelog`

3-5 most recent notable changes. Most recent first.
Format: `- YYYY-MM-DD — Description of what changed`

Only include notable changes — shipped features, status changes, architectural
decisions. Not every commit or bug fix.

## When to Update INFO.md

Update when any of these happen:
- A feature ships or is removed
- The project status changes (e.g., alpha to beta, beta to live)
- A new npm package version is published
- A significant architectural decision is made
- More than 30 days have passed since `last_updated`

## What Does NOT Go in INFO.md

- Implementation details (those belong in `/docs/` or `.purpose` files)
- Full API documentation
- Setup or installation instructions
- Internal architecture notes
- Anything that changes weekly — this is a slow-moving document
- Duplicate information from other docs in the project

## Format Rules Summary

1. Frontmatter is YAML between `---` delimiters. All dates are ISO 8601.
2. `last_updated` MUST be set to today's date on every edit.
3. `status` and `category` are strict enums — no other values.
4. Body has exactly three H2 sections: What It Does, Features, Changelog.
5. Features list: 3-8 items, one line each, no sub-bullets.
6. Changelog: 3-5 entries, most recent first.
7. No H1 in the body. No H3 or deeper.
8. Omit optional frontmatter fields rather than leaving them empty.

## Who Updates It

Either a human or an AI agent may update INFO.md. The rules are the same
regardless of author. If an AI agent updates it during a session, note the
change in the session's lore record or commit message.

## How This Gets Consumed

The a-company project scans all projects at `~/Documents/GitHub/*/docs/site/INFO.md`
to build an ecosystem view. The scan checks:
- Required frontmatter fields are present and correctly typed
- `status` and `category` are valid enum values
- `last_updated` is a valid ISO date and not stale (>30 days = warning, >90 days = error)
- Body contains the three required H2 sections
- Feature list has 3-8 items, changelog has 3-5 entries
