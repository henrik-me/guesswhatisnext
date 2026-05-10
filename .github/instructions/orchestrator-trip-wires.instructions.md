---
applyTo: "**"
---

# Orchestrator trip-wires (must do, never violate)

Auto-injected into every Copilot CLI session. **Each rule below is a one-line trigger + one canonical link. The full prescription, "why", and rationale live ONLY at the linked section** — do not duplicate them here. If a rule needs more detail, edit the canonical doc, not this file.

These are the highest-cost rules. Full process: [INSTRUCTIONS.md Quick Reference Checklist](../../INSTRUCTIONS.md#quick-reference-checklist) (re-read after every `git pull`).

| # | Trigger | Canonical reference |
|---|---------|---------------------|
| 1 | Triggering `workflow_dispatch`, requesting Copilot review, or any minutes-to-hours wait. | [INSTRUCTIONS.md § Production deploys](../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user) + [OPERATIONS.md § Background polling-loop watcher prompts](../../OPERATIONS.md#background-polling-loop-watcher-prompts) |
| 2 | Any push directly to `main` (WORKBOARD edits, clickstop plan files moving planned↔active↔done). | [INSTRUCTIONS.md Quick Reference — "Lint-before-push is mandatory"](../../INSTRUCTIONS.md#quick-reference-checklist) bullet |
| 3 | Any deploy after a PR merges to main. | [INSTRUCTIONS.md § Production deploys — "Standard deploy sequence"](../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user) |
| 4 | Filing or refining a clickstop plan file. | [INSTRUCTIONS.md Quick Reference — "Plan files require lint + GPT-5.5 review BEFORE the direct-to-main push"](../../INSTRUCTIONS.md#quick-reference-checklist) bullet |
| 5 | `git mv X Y` plus content edits to the same file in one `git add`. | [INSTRUCTIONS.md Quick Reference — "`git mv X Y` + content edits…"](../../INSTRUCTIONS.md#quick-reference-checklist) bullet |
| 6 | Claiming a CS, transitioning state, completing a task. | [INSTRUCTIONS.md Quick Reference — "Update WORKBOARD.md immediately"](../../INSTRUCTIONS.md#quick-reference-checklist) bullet + [TRACKING.md § WORKBOARD State Machine](../../TRACKING.md#workboard-state-machine) |
| 7 | Dispatching any sub-agent for implementation work. | [docs/sub-agent-checklist.md](../../docs/sub-agent-checklist.md) (paste verbatim into prompt) |
| 8 | About to make code changes. | [INSTRUCTIONS.md Quick Reference — "Never do implementation work in main checkout"](../../INSTRUCTIONS.md#quick-reference-checklist) bullet |

If a rule conflicts with the user's explicit instruction in the current session, surface the conflict and ask. If you violate one and notice mid-session, recover honestly and update the canonical doc (not this trip-wires file, and not memory).

