# Playbook v0: founder review marks (2026-10-17)

Source: `REVIEW.html`, reviewed in full by the founder. Every item not listed below is **approve** (G1–G5, R1–R4, A1–A8, B1–B3, C1–C18, D0–D18, E1–E4, E6–E11, E13, F1–F8, N1-1..N1-9, N3, N4a–N4e).

| Item | Mark | Resolution |
|---|---|---|
| D19 | approve | As written (two anti-patterns become warnings). The founder's note about a usability-friendly third base style was withdrawn: stick to the original plan. |
| E5 `status-feedback` | change | Add to the board: a relative timestamp on every message (exact time on hover); a start time while work runs and a duration when it finishes ("took 2m 14s"), shown only above about 1 s; a collapsible per-session activity history beside the "while you were away" summary. Timestamps stay muted to avoid clutter. |
| E12 `voice-commands` | change | Voice approvals are possible when toggled on for the project (Gnomon ruling P8-D58). Two per-project toggles: (1) voice may approve reversible decisions; (2) a separate, explicit toggle, with a warning when it is turned on, also lets voice approve gate-class decisions. Both are off by default. With both off, G1 (`voice-opens-never-decides`) is the behaviour. Approval phrases are configurable (e.g. "claude admin approve" / "claude admin deny"). |
| G1 | approve, amended by E12 | `voice-opens-never-decides` remains the default rule. P8-D58 adds the opt-in exception above. The mechanism is pending the Gnomon spec amendment (Aegis + Arky). |
| N2 | approve | Open question from the founder: should a librarian-style agent own cleanup and auditing of old files and materials, or does that live only in neurons? Pending a team pass that includes Loid. |
