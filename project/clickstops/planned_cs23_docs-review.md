# Clickstop CS23: Documentation Review (Deferred from CS17)

**Status:** ⬜ Planned
**Goal:** Complete the documentation review tasks deferred from CS17 (Process Documentation Improvement). CS17 focused on orchestrator workflow gaps found via session history investigation. These remaining tasks cover sub-agent docs and cross-document structure.

**Deferred from:** [CS17 — Process Documentation Improvement](done_cs17_process-docs-improvement.md)
**Reason deferred:** CS17 pivoted to a data-driven approach (CS17-7 session history investigation) which produced 8 actionable findings. Those findings were implemented directly (PRs #132, #133, #134, #135). The original review-then-implement pairs (CS17-2/3 → CS17-5/6) became lower priority since the most impactful gaps were already addressed.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS23-1 | Review sub-agent execution docs | ⬜ Pending | — | Audit Sub-Agent Briefing Requirements, Sub-Agent Checklist, model-specific guidance, progress reporting in INSTRUCTIONS.md. Evaluate completeness and clarity. Originally CS17-2. |
| CS23-2 | Review doc structure & cross-references | ⬜ Pending | — | Evaluate CONTEXT.md, WORKBOARD.md, LEARNINGS.md for organization, bloat, stale content, and cross-doc consistency. INSTRUCTIONS.md is ~830 lines — evaluate whether it should be split. LEARNINGS.md is ~370 lines. Originally CS17-3. |
| CS23-3 | Implement sub-agent doc improvements | ⬜ Pending | CS23-1 | Apply agreed changes from CS23-1 review. Originally CS17-5. |
| CS23-4 | Implement doc structure improvements | ⬜ Pending | CS23-2 | Apply agreed changes from CS23-2 review. Originally CS17-6. |

## Notes

- CS16 addressed workboard conventions and context update rules.
- CS17 added: orchestrator startup checklist, responsiveness rule, stale instructions guard, task parallelism, session naming, push emphasis, row ownership, workboard slim-down.
- CS23 covers the remaining documentation gaps not addressed by CS17.
