# CS64 — Planning Conventions Deps And Parallelism

**Status:** 🆕 Planned
**Origin:** 2026-04-29 conversation (omni-gwn) about how to make sub-agent review enforcement, doc structure, and process gates more robust. The user observed: planning needs to encode both **dependencies** (so pickup is unambiguous) and **parallelism** (so multiple agents can fan out without colliding), at both intra-CS (task-level) and inter-CS levels.
**Depends on:** none
**Parallel-safe with:** any (this CS lands the conventions; consumers reference them but can land in any order if they accept format-churn rebase)

## Problem

Today, the CS planning vocabulary has no machine-readable way to express:

1. **Inter-CS dependencies.** A `planned_*.md` file may informally reference another CS in prose, but there is no greppable line a pickup-script could read. An agent looking for work has to read every plan file to determine if it's blocked.
2. **Intra-CS parallelism.** Existing task IDs (`CS52-7a`, `CS52-7b`, `CS52-7c`, `CS52-7d`, `CS52-7e`) suggest sub-tasks but do not distinguish "must happen in this order" from "any order, parallel-safe". CS52-7c and CS52-7d in fact ran sequentially because nothing in the convention said they could be parallel.
3. **Implicit synchronization points.** When phase 2 of a CS depends on phase 1 completing, that's not visible without reading the prose.

Result: orchestrators serialize work that could parallelize, and pickup decisions for fresh agents require deep reads.

## Goals

1. Define a **task-ID convention** that distinguishes sequential phases from parallel siblings.
2. Define **frontmatter lines** for inter-CS dependencies and parallel-safety.
3. Document a **planning preference** ("favor structures where work can parallelize").
4. Make all three machine-checkable via `scripts/check-docs-consistency.js` (warn-only on landing, flipped to error in CS65 follow-up).

## Conventions to land

### Convention A — Task ID structure

| Notation | Meaning |
|----------|---------|
| `CS<N>-1`, `CS<N>-2`, `CS<N>-3` | Sequential phases. `-2` cannot start until all `-1*` siblings are done. |
| `CS<N>-1a`, `CS<N>-1b`, `CS<N>-1c` | Parallel-safe siblings within phase 1. Any/all may run concurrently. |
| Implicit sync | All siblings at level N must complete before any task at level N+1 starts. |

The dash-letter form already exists informally (CS41-12, CS53-19.D) but is now formally a parallelism marker.

### Convention B — Inter-CS frontmatter

Every `planned_*.md` and `active_*.md` file MUST contain, between `**Status:**` and the first `##` heading:

```markdown
**Depends on:** CS<N>, CS<M>          (or `none`)
**Parallel-safe with:** CS<X>, CS<Y>  (or `any` for "no known conflicts")
```

`Depends on` is a hard predecessor — the CS cannot be picked up until those CSs are merged (or for sub-task granularity, until the named tasks are done).
`Parallel-safe with` is informational — lists CSs known not to collide on file ownership; absence does not mean conflict, only "not analyzed".

### Convention C — Documented preference (INSTRUCTIONS.md Quick Reference)

Add bullet:

> When planning a CS, favor structures that allow parallel work. Use `<phase><letter>` (e.g. `CS65-1a`, `CS65-1b`) for parallel-safe siblings; use sequential numbers (`CS65-1`, `CS65-2`) only when a true ordering dependency exists. State `**Depends on:**` and `**Parallel-safe with:**` in the plan-file frontmatter so other orchestrators can pick up work without re-reading prose.

### Convention D — Mechanical enforcement (handed off to CS65)

The plan-file linter rules (added in CS65) will check:
- `plan-task-id-format` — task IDs in the Tasks table match `CS<N>-\d+([a-z])?`
- `plan-has-depends-on` — frontmatter contains the `**Depends on:**` line
- `plan-has-parallel-safe-with` — frontmatter contains the `**Parallel-safe with:**` line

CS64 only documents the conventions; CS65 enforces them.

## Tasks

| Task ID | Description | Parallel? |
|---------|-------------|-----------|
| CS64-1a | Update INSTRUCTIONS.md Quick Reference with Convention C bullet. | parallel |
| CS64-1b | Update TRACKING.md § Task IDs / Naming Conventions to describe Conventions A and B with examples. | parallel |
| CS64-1c | Add a small "Planning conventions" subsection to OPERATIONS.md § Agent Work Model linking to the TRACKING.md section. | parallel |
| CS64-2 | Update this file (CS64) and the other three planned files (CS65, CS66, CS67) so their `**Depends on:**` / `**Parallel-safe with:**` frontmatter is in the new canonical position (post-merge sweep — they were authored using the convention pre-landing). | sequential after 1* |

All CS64-1* tasks land together in one PR (they're tightly coupled doc updates). CS64-2 is a no-op if the planned files were already authored with the convention; included for safety.

## Acceptance

- INSTRUCTIONS.md, TRACKING.md, OPERATIONS.md describe Conventions A, B, C with at least one worked example each.
- `npm run check:docs:strict` clean (0 errors).
- This CS file (CS64), CS65, CS66, CS67 all carry the canonical `**Depends on:**` and `**Parallel-safe with:**` lines and use the dash-letter notation in their Tasks tables.
- A future orchestrator can answer "what can I pick up?" by greppng for `**Depends on:** none` across `project/clickstops/planned/`.

## Cross-references

- CS43-2 / CS43-7 — established the warn-only-then-flip-to-error linter pattern that CS65 will reuse.
- CS62 — already-merged baseline of clickstop H1 / WORKBOARD title structural rules.
- CS65 — implements the linter rules that enforce CS64's conventions.
- CS66 — CI gates for PR-body / commit-trailer compliance (independent surface).
- CS67 — docs restructure (canonical sub-agent checklist + CONVENTIONS.md split); will use CS64's frontmatter.
