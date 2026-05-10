## ⚠️ Orchestrator trip-wires — must do, never violate

Top-3 high-cost rules. Full list at [`.github/instructions/orchestrator-trip-wires.instructions.md`](instructions/orchestrator-trip-wires.instructions.md). Background and rationale at the linked sections in INSTRUCTIONS.md / OPERATIONS.md.

1. **Long-running waits → dispatch a background watcher (`task` agent type, `claude-haiku-4.5`, `mode: background`), then end your turn.** Never `gh run watch` from the main orchestrator session (locks it). Never call `task_complete` on a mid-flight deploy / Copilot review when a watcher could carry it to terminal state. See [INSTRUCTIONS.md § Production deploys](../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user) and [OPERATIONS.md § Background polling-loop watcher prompts](../OPERATIONS.md#background-polling-loop-watcher-prompts).
2. **Direct-to-main pushes (WORKBOARD / clickstop plan files) require local `npm run check:docs:strict` to pass first** — admin direct-push silently bypasses ALL server-side required status checks. The CS77 husky pre-push hook enforces this in clones where `npm install` has been run; verify with `npm run check:hook` if unsure.
3. **Always deploy main → staging → prod, even if the change doesn't apply functionally to staging** (e.g. Azure SQL-only changes). The clean staging deploy itself is a no-regression test (npm ci, container build, boot, smoke). Skipping staging is a process violation.

---

Refer to [INSTRUCTIONS.md](../INSTRUCTIONS.md) in the project root for all development guidelines, architecture decisions, coding standards, testing strategy, and git workflow.

For project state and codebase architecture, see [CONTEXT.md](../CONTEXT.md).
For active/planned clickstops, browse [project/clickstops/active/](../project/clickstops/active/) and [project/clickstops/planned/](../project/clickstops/planned/) (run `git pull` first).
For live work coordination, see [WORKBOARD.md](../WORKBOARD.md).
For architecture decisions and learnings, see [LEARNINGS.md](../LEARNINGS.md).
