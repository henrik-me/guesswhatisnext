# Clickstop CS17: Process Documentation Improvement

**Status:** ✅ Complete
**Goal:** Review and improve INSTRUCTIONS.md, CONTEXT.md, WORKBOARD.md, and LEARNINGS.md to strengthen guidance for orchestrators and sub-agents. Reduce redundancy, close gaps, and improve clarity.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS17-1 | Add session naming convention | ✅ Done | — | PR #132 merged. Added `/rename [{agent-id}]-{task-id}: {clickstop name}` convention. |
| CS17-2 | Review sub-agent execution docs | ⬜ Deferred | — | Superseded by CS17-7 findings which covered sub-agent gaps. Remaining audit can be a future clickstop. |
| CS17-3 | Review doc structure & cross-references | ⬜ Deferred | — | Partially addressed by CS17-8 (workboard slim-down). Full doc structure review deferred. |
| CS17-4 | Implement orchestrator doc improvements | ✅ Done | CS17-1 | PR #133 merged. 6 changes: startup checklist, responsiveness rule, stale instructions guard, task parallelism, push emphasis, CLI commands reference. |
| CS17-5 | Implement sub-agent doc improvements | ⬜ Deferred | CS17-2 | Deferred with CS17-2. |
| CS17-6 | Implement doc structure improvements | ⬜ Deferred | CS17-3 | Deferred with CS17-3. |
| CS17-7 | Investigate session history for orchestrator clarifications | ✅ Done | — | 8 findings from session history. All priority-1 and priority-2 items implemented in CS17-4 and CS17-8. |
| CS17-8 | Slim down WORKBOARD.md | ✅ Done | CS17-4 | PR #134 merged. Removed Queued/Recently Completed sections. Workboard now agent registration + task locking only. |

## Completion Checklist

- [x] All priority tasks done and merged (CS17-1, CS17-4, CS17-7, CS17-8)
- [x] INSTRUCTIONS.md updated (orchestrator startup, responsiveness, stale guard, parallelism, push emphasis, CLI ref, session naming, workboard guidance)
- [x] WORKBOARD.md updated (slimmed to registration + locking)
- [x] CONTEXT.md updated (clickstop status)
- [ ] README updated — N/A (no user-facing changes)
- [ ] Tests — N/A (docs-only clickstop)
- [ ] Staging/Production deploy — N/A (docs-only)

## Design Decisions

### Approach
Originally planned as review → implement pairs (CS17-1/2/3 → CS17-4/5/6). Pivoted to data-driven approach: CS17-7 mined session history for actual orchestrator failures, which produced actionable findings that were implemented directly. Remaining review tasks (CS17-2/3/5/6) deferred as lower priority.

### Key Findings (from CS17-7)
1. Orchestrators need an explicit startup checklist (not just sub-agents)
2. Orchestrators must never block on delegatable work — always use background agents
3. INSTRUCTIONS.md must be re-read after every `git pull` that changes it
4. Non-worktree background tasks (research, analysis) are distinct from worktree tasks and have no slot limit
5. WORKBOARD.md push must happen immediately (local-only commit = zero coordination value)
6. Session naming convention needed for at-a-glance identification
7. WORKBOARD.md was bloated with derivable information (queued/completed state)
