# Skill — Merge Brand and Project Artifacts (in your head)

**Owner:** #quill-showrunner
**Kind:** canonical
**Inputs:** Workspace `_brand/<artifact>.md` (or `.yaml`) + project
`projects/<name>/<artifact>.md` (or `.yaml`).
**Outputs:** A merged effective brand held in your head for this task. Nothing
written back to disk.

## Protocol source

The full merge protocol lives in
**`.paradigm/personas/_shared/cascade-merge.md`** — shared across Quill, Lux,
and Iris. Read it once per session and apply it on every task. This skill is
Quill's worked example for the artifacts she owns; do not duplicate the rules
here.

The rules in summary (see shared doc for the full version):

- **Markdown sections:** project section with same `## Heading` overrides
  base; project section with new heading appends; base sections not mentioned
  remain.
- **YAML scalars:** project overrides base.
- **YAML lists:** project appends to base (additive).
- **YAML maps:** recurse per key.
- **Never write the merged result back to disk.** The two source files stay
  separate.
- **Re-read every task.** No caching.

## Procedure

1. Resolve the active project (cwd or explicit arg).
2. Read the brand-tier artifact: `_brand/<artifact>.md` (or
   `_brand/.atelier-brand.yaml`).
3. Read the project-tier artifact: `projects/<name>/<artifact>.md` (or
   `projects/<name>/.atelier-overlay.yaml`). If it doesn't exist, the brand
   artifact is the effective brand — that's a valid pattern.
4. Apply the merge rules from the shared protocol mentally. Hold the result in
   working memory for the task.
5. Act on the merged effective brand. If you write anything new, decide tier
   per `workspace-vs-project-tier-discipline` (notebook) and write to the
   right path.

## Worked example — merging SCRIPT.md for the spring-launch project

Base: `_brand/SCRIPT.md`

```md
## Voice
Clinical-editorial. Confident-not-cocky. Lead with the metric, end on the
actionable beat.

## Do
- Lead with a concrete number when possible.
- Use contractions naturally — never stilted.
- End on an action verb, not an inspirational adjective.

## Don't
- Exclamation marks.
- Hype adjectives ("amazing," "incredible," "game-changing").

## Signature sign-off
"That's the work. Back to it."
```

Overlay: `projects/spring-launch/SCRIPT.md`

```md
## Voice
Clinical-editorial with a hint of playfulness for this campaign — Spring
warrants a lighter touch without losing the clinical floor.

## Constraints
- Must reference the demo URL (https://example.com/spring) in the CTA.
- 30-second runtime cap.

## Script
> Assumed: workspace _brand/DESIGN.md audience holds (solo creators).

### hook-1 (0–3s)
[overlay: "60 days. 3x throughput."]
We shipped three months of roadmap in sixty days.

### story-1 (3–18s)
...
```

**Merged in your head — what Quill actually drafts against:**

```md
## Voice                           ← project override (same heading)
Clinical-editorial with a hint of playfulness for this campaign — Spring
warrants a lighter touch without losing the clinical floor.

## Do                              ← base inherited (project did not mention)
- Lead with a concrete number when possible.
- Use contractions naturally — never stilted.
- End on an action verb, not an inspirational adjective.

## Don't                           ← base inherited
- Exclamation marks.
- Hype adjectives ("amazing," "incredible," "game-changing").

## Signature sign-off              ← base inherited
"That's the work. Back to it."

## Constraints                     ← project extension (new heading, appended)
- Must reference the demo URL (https://example.com/spring) in the CTA.
- 30-second runtime cap.

## Script                          ← project content
[the spring-launch beats]
```

**What this lets Quill do on the next task:**

- Drafting a hook for spring-launch, she uses the lighter voice (`playfulness`)
  but still leads with the number (`60 days. 3x throughput.`) because the
  base `Do` rules carry through.
- She skips exclamation marks even though spring is "lighter," because the
  brand `Don't` is inherited and was not overridden.
- The CTA references the demo URL because the project `Constraints` block
  appended that rule.
- She closes on the brand sign-off unless the project explicitly overrode it.

## Notes & conventions

- **Do not write the merged document to disk.** Spring-launch's SCRIPT.md
  stays as the overlay; `_brand/SCRIPT.md` stays as the base. The creator
  needs to see what's brand vs what's this-project.
- **Surface promotion candidates.** If you notice the project keeps overriding
  the same brand section across multiple projects, tell the creator:
  "I'm overriding the brand `Voice` to add playfulness in spring-launch and
  customer-stories now — want me to soften the brand baseline so future
  projects don't have to override?"
- **A missing project artifact is not an error.** If `projects/<name>/SCRIPT.md`
  doesn't exist yet, the brand SCRIPT.md is the effective brand verbatim.
  That's a valid starting point for a new project.
- **YAML overlay rules differ from markdown** — lists append additively, maps
  recurse, scalars override. See shared protocol for examples.

## Failure modes to watch

- **Writing the merged doc back to disk.** Kills the cascade — the creator
  can no longer see what's brand vs project.
- **Caching the merged result across tasks.** The creator may edit between
  your sessions. Re-read every task.
- **Treating missing project sections as deletions.** Silence is inheritance,
  not removal. To remove a brand section in a project, the creator needs to
  explicitly say so; you do not assume it.
- **Silently promoting a project decision into `_brand/` because you noticed
  it twice.** Surface the candidate; ask the creator before touching the
  brand floor.
- **Forgetting `.atelier-brand.yaml`.** The structured overlay is brand truth
  too; voice register, palette, technique lists live there. Always read it
  alongside `_brand/SCRIPT.md` when merging script voice.
