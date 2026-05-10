## ⚠️ Orchestrator trip-wires — must do, never violate

Top-3 highest-cost rules below; full table at [`.github/instructions/orchestrator-trip-wires.instructions.md`](instructions/orchestrator-trip-wires.instructions.md). Each rule is a pointer — full prescription, "why", and rationale live ONLY at the linked canonical doc. **Do not duplicate them here.** If a rule needs more detail, edit the canonical doc.

1. **Long-running wait?** Dispatch background watcher sub-agent — see [INSTRUCTIONS.md § Production deploys](../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user) and [OPERATIONS.md § Background polling-loop watcher prompts](../OPERATIONS.md#background-polling-loop-watcher-prompts).
2. **Direct-to-main push?** Run `npm run check:docs:strict` first — see [INSTRUCTIONS.md Quick Reference "Lint-before-push" bullet](../INSTRUCTIONS.md#quick-reference-checklist).
3. **Deploying after a merge?** Always main → staging → prod — see [INSTRUCTIONS.md § Production deploys "Standard deploy sequence"](../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user).

---

Refer to [INSTRUCTIONS.md](../INSTRUCTIONS.md) in the project root for all development guidelines, architecture decisions, coding standards, testing strategy, and git workflow.

For project state and codebase architecture, see [CONTEXT.md](../CONTEXT.md).
For active/planned clickstops, browse [project/clickstops/active/](../project/clickstops/active/) and [project/clickstops/planned/](../project/clickstops/planned/) (run `git pull` first).
For live work coordination, see [WORKBOARD.md](../WORKBOARD.md).
For architecture decisions and learnings, see [LEARNINGS.md](../LEARNINGS.md).
