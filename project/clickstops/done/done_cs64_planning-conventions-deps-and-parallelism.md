# CS64 — Planning Conventions Deps And Parallelism

**Status:** ✅ Done — merged in [PR #312](https://github.com/henrik-me/guesswhatisnext/pull/312) (`bc6065c9`) on 2026-04-29T17:13Z. Closed out 2026-05-01 by `yoga-gwn`.
**Origin:** 2026-04-29 conversation (omni-gwn) about how to make sub-agent review enforcement, doc structure, and process gates more robust. The user observed: planning needs to encode both **dependencies** (so pickup is unambiguous) and **parallelism** (so multiple agents can fan out without colliding), at both intra-CS (task-level) and inter-CS levels.
**Depends on:** none
**Parallel-safe with:** any (this CS lands the conventions; consumers reference them but can land in any order if they accept format-churn rebase)

## Outcome

Conventions A–E landed in [PR #312](https://github.com/henrik-me/guesswhatisnext/pull/312) (docs-only, +38/-4 across INSTRUCTIONS.md, TRACKING.md, OPERATIONS.md, and this plan file):

- **Convention C** (parallel-friendly planning preference) — INSTRUCTIONS.md Quick Reference bullet.
- **Convention E** (CS-only scope; OPS-* carve-out preserved) — INSTRUCTIONS.md Quick Reference bullet + TRACKING.md cross-link + OPERATIONS.md cross-link.
- **Conventions A & B** (task-ID structure + frontmatter shape) — TRACKING.md § Naming Conventions, with worked example table.
- **Convention D** (mechanical enforcement) — handed off to and delivered by [CS65](../done/done_cs65_plan-file-schema-linter-rules.md) (already closed).
- Frontmatter (`Depends on` / `Parallel-safe with`) verified present on CS64, CS65, CS66, CS67 at PR-time; no fix-ups required.

Local review: GPT-5.5 round 1 clean; `npm run check:docs:strict` reported 0 errors. Docs-only PR, so Copilot review correctly skipped per [REVIEWS.md PR-type matrix](../../../REVIEWS.md#local-review-loop). No code or tests changed (by design — enforcement was scoped to CS65).

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

### Convention E — Scope: CS work vs ad-hoc orchestrator work (preserve existing pattern)

**Conventions A–D apply to clickstop CS work only** (planned/active/done plan files and the WORKBOARD rows that track them). They do NOT apply to ad-hoc orchestrator work that has no clickstop file:

- Workflow ops (deploys, rebases, environment validation, monitoring)
- Quick docs fixes that don't justify a CS plan
- Investigations / spikes that may or may not turn into a CS later
- Sub-agent dispatches for OPS-* tasks (e.g. `OPS-checklist-hardening` earlier today)

Ad-hoc work keeps the existing pattern documented in TRACKING.md:
- WORKBOARD Active Work row uses a non-empty `CS-Task ID` placeholder starting with `OPS-` (e.g. `OPS-DEPLOY-2026-04-29`, `OPS-checklist-hardening`)
- No plan file under `project/clickstops/`
- No `**Depends on:**` / `**Parallel-safe with:**` frontmatter (those live in plan files; ad-hoc work has no plan file)
- The CS65 linter rules use the file path (`project/clickstops/{planned,active}/`) as their match scope, so they will not fire against ad-hoc rows

**Why this matters:** without this clarification, a reader of the new Convention C bullet might infer "every WORKBOARD row needs `**Depends on:**`" and stop using OPS-* for quick ad-hoc work, undermining a useful pattern. Convention E makes the carve-out explicit and cross-references TRACKING.md as the canonical source for the OPS-* pattern.

## Tasks

| Task ID | Description | Parallel? |
|---------|-------------|-----------|
| CS64-1a | ✅ Done in [PR #312](https://github.com/henrik-me/guesswhatisnext/pull/312) — Update INSTRUCTIONS.md Quick Reference with Convention C bullet AND a follow-up bullet making Convention E's scope carve-out explicit (one sentence: "These conventions apply to clickstop CS work only; ad-hoc work uses the OPS-* placeholder per [TRACKING.md § WORKBOARD — Live Coordination](../../../TRACKING.md#workboardmd--live-coordination)."). | parallel |
| CS64-1b | ✅ Done in [PR #312](https://github.com/henrik-me/guesswhatisnext/pull/312) — Update TRACKING.md § Naming Conventions to describe Conventions A and B with examples. Cross-link to existing TRACKING.md ad-hoc OPS-* guidance (lines ~100 and ~164) so the two conventions are visibly co-located. | parallel |
| CS64-1c | ✅ Done in [PR #312](https://github.com/henrik-me/guesswhatisnext/pull/312) — Add a small "Planning conventions" subsection to OPERATIONS.md § Agent Work Model linking to the TRACKING.md section. Include the Convention E carve-out so an orchestrator reading OPS workflow docs understands ad-hoc OPS-* work is still first-class. | parallel |
| CS64-2 | ✅ Done in [PR #312](https://github.com/henrik-me/guesswhatisnext/pull/312) — Verified this file (CS64) and the other three planned files (CS65, CS66, CS67) already have `**Depends on:**` / `**Parallel-safe with:**` frontmatter in the new canonical position. | sequential after 1* |

All CS64-1* tasks land together in one PR (they're tightly coupled doc updates). CS64-2 is a no-op if the planned files were already authored with the convention; included for safety.

## Acceptance

- INSTRUCTIONS.md, TRACKING.md, OPERATIONS.md describe Conventions A, B, C, and E with at least one worked example each.
- The OPS-* ad-hoc pattern carve-out (Convention E) is reachable from any of: INSTRUCTIONS.md Quick Reference, TRACKING.md § Naming Conventions, or OPERATIONS.md § Agent Work Model — a reader landing in any of the three is one click away from the canonical TRACKING.md guidance.
- `npm run check:docs:strict` clean (0 errors).
- This CS file (CS64), CS65, CS66, CS67 all carry the canonical `**Depends on:**` and `**Parallel-safe with:**` lines and use the dash-letter notation in their Tasks tables.
- A future orchestrator can answer "what can I pick up?" by greppng for `**Depends on:** none` across `project/clickstops/planned/`.
- A future orchestrator starting ad-hoc work (no CS file) still knows to register an `OPS-<short-name>` row in WORKBOARD without authoring frontmatter.

## Cross-references

- CS43-2 / CS43-7 — established the warn-only-then-flip-to-error linter pattern that CS65 will reuse.
- CS62 — already-merged baseline of clickstop H1 / WORKBOARD title structural rules.
- CS65 — implements the linter rules that enforce CS64's conventions.
- CS66 — CI gates for PR-body / commit-trailer compliance (independent surface).
- CS67 — docs restructure (canonical sub-agent checklist + CONVENTIONS.md split); will use CS64's frontmatter.
