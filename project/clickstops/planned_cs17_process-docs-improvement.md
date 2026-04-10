# Clickstop CS17: Process Documentation Improvement

**Status:** ⬜ Planned
**Goal:** Review and improve INSTRUCTIONS.md, CONTEXT.md, WORKBOARD.md, and LEARNINGS.md to strengthen guidance for orchestrators and sub-agents. Reduce redundancy, close gaps, and improve clarity.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS17-1 | Review orchestrator workflow docs | ⬜ Pending | — | Audit INSTRUCTIONS.md §5 (Agent Work Model, Parallel Agent Workflow, Workboard coordination). Identify gaps, redundancies, unclear guidance. |
| CS17-2 | Review sub-agent execution docs | ⬜ Pending | — | Audit Sub-Agent Briefing Requirements, Sub-Agent Checklist, model-specific guidance, progress reporting. Evaluate completeness and clarity. |
| CS17-3 | Review doc structure & cross-references | ⬜ Pending | — | Evaluate CONTEXT.md, WORKBOARD.md, LEARNINGS.md for organization, bloat, stale content, and cross-doc consistency. |
| CS17-4 | Implement orchestrator doc improvements | ⬜ Pending | CS17-1 | Apply agreed changes from CS17-1 review. |
| CS17-5 | Implement sub-agent doc improvements | ⬜ Pending | CS17-2 | Apply agreed changes from CS17-2 review. |
| CS17-6 | Implement doc structure improvements | ⬜ Pending | CS17-3 | Apply agreed changes from CS17-3 review. |
| CS17-7 | Investigate session history for orchestrator clarifications | ⬜ Pending | — | Query sessions since last major doc update (CS16, 2026-04-09). Find patterns where orchestrators needed clarification or correction from the user. Compare gaps with current INSTRUCTIONS.md and propose updates. |

## Design Decisions

### Approach
This is an iterative review clickstop. Tasks CS17-1 through CS17-3 are review/audit tasks done collaboratively with the user. CS17-7 is a data-driven investigation that mines session history for patterns where orchestrators needed user correction — its findings feed into all implementation tasks. Tasks CS17-4 through CS17-6 implement the agreed improvements.

### Scope
- **In scope:** INSTRUCTIONS.md, CONTEXT.md, WORKBOARD.md, LEARNINGS.md, and any supporting files in project/clickstops/ that affect the process.
- **Out of scope:** Application code changes, CI/CD workflow changes, new tooling.

## Notes

- CS16 (Docs Optimization & Cleanup) addressed workboard conventions and context update rules. CS17 goes deeper into the orchestrator and sub-agent workflow guidance.
- INSTRUCTIONS.md is currently ~780 lines. Evaluate whether it should be split or restructured.
- LEARNINGS.md has grown to ~370 lines with architecture decisions, risk analysis, and tool evaluations. Evaluate relevance and organization.
