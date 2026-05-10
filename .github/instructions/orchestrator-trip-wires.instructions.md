---
applyTo: "**"
---

# Orchestrator trip-wires (must do, never violate)

This file is auto-injected into every Copilot CLI session via the `applyTo: "**"` glob. It lists the rules most often violated by orchestrators in this repo, ranked by cost-when-violated. Each rule has a one-line "must do" plus a link to the canonical reference.

These are the **top trip-wires** — they are not the full process. The complete process lives in [INSTRUCTIONS.md Quick Reference Checklist](../../INSTRUCTIONS.md#quick-reference-checklist) (re-read after every `git pull`).

## 1. Long-running waits → background watcher, never lock the orchestrator

**Trigger:** any time you trigger a `workflow_dispatch` deploy, request a Copilot review, or otherwise enter a phase whose terminal state is minutes-to-hours away and not advanced by orchestrator action.

**Must do:** dispatch a background watcher sub-agent (`task` agent type, `claude-haiku-4.5` model, `mode: background`) per the canonical loop shape, then end your turn.

**Never:**
- Run `gh run watch` from the main orchestrator session (locks it; produces no output until terminal).
- Call `task_complete` on a mid-flight deploy / review when a watcher could carry it to terminal state. "Blocked on a human" is NOT a `task_complete` reason if a watcher can resume the moment the human acts.

**Reference:** [OPERATIONS.md § Background polling-loop watcher prompts](../../OPERATIONS.md#background-polling-loop-watcher-prompts), [INSTRUCTIONS.md § Production deploys](../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user).

## 2. Direct-to-main pushes require local `npm run check:docs:strict` first

**Trigger:** any push directly to `main` (WORKBOARD edits, clickstop plan files moving planned↔active↔done, orchestrator coordination commits).

**Must do:** run `npm run check:docs:strict` locally and only push when clean. The CS77 husky pre-push hook enforces this automatically once `npm install` has run in the clone (verify with `npm run check:hook`).

**Why:** orchestrator direct-push admin-bypasses ALL server-side required status checks alongside the PR requirement. Branch protection has no per-rule granularity that would let `check:docs:strict` keep firing while the PR rule is bypassed.

**Reference:** [TRACKING.md § WORKBOARD.md — Live Coordination](../../TRACKING.md#workboardmd--live-coordination), [active_cs77_pre-push-docs-lint-hook.md](../../project/clickstops/active/active_cs77_pre-push-docs-lint-hook.md).

## 3. Always deploy main → staging → prod, even for prod-only functional changes

**Trigger:** any deploy after a PR merges to main.

**Must do:** trigger `staging-deploy.yml workflow_dispatch` first; wait for it to complete green; then trigger `prod-deploy.yml workflow_dispatch`.

**Why:** even when the changed code path doesn't apply to staging (e.g. Azure SQL-only changes against staging's container-local SQLite), the staging deploy itself is a valid no-regression test (npm ci, container build, boot, smoke). "The change doesn't apply to staging" is NOT a reason to skip staging.

**Reference:** [INSTRUCTIONS.md § Production deploys](../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user).

## 4. Plan files: lint + GPT-5.5 review BEFORE direct-to-main push, not after

**Trigger:** filing or refining a clickstop plan file (`project/clickstops/{planned,active,done}/*.md`).

**Must do:**
1. Write/edit the plan file.
2. Run `npm run check:docs:strict` — fix all errors.
3. Dispatch a `code-review` sub-agent with `model=gpt-5.5` floor.
4. Apply review fixes.
5. Re-lint.
6. Then `git commit && git push origin main`.

**Why:** "Commit clickstop plan file to main BEFORE starting implementation work" (Quick Reference) is about *sequencing* the plan vs the implementation, not a license to skip review on the plan itself. Plans pushed pre-review have shipped lint errors and inaccurate technical premises.

## 5. `git mv X Y` + content edits to that same file in one `git add` → only the rename commits; verify with `git status` after

**Trigger:** moving a clickstop plan file `planned/` → `active/` → `done/` while also editing its `**Status:**` line and/or unrelated files like `WORKBOARD.md`.

**Must do:** after the commit, run `git status --short` to confirm there are no unexpected modified files left over. If the rename committed alone (typical: `1 file changed, 0 insertions, 0 deletions`), the content edits did NOT make it in — follow up with a second commit before pushing.

## 6. Update WORKBOARD.md immediately on task claim/complete; commit AND push

**Trigger:** claiming a CS, transitioning state, completing a task.

**Must do:** edit WORKBOARD.md, lint, commit, push — same turn as the state transition. Local-only commits provide zero coordination value to other orchestrators.

**Reference:** [TRACKING.md § WORKBOARD State Machine](../../TRACKING.md#workboard-state-machine).

## 7. Sub-agent prompts must include the full Sub-Agent Checklist verbatim

**Trigger:** dispatching any sub-agent for implementation work.

**Must do:** paste the full content of [`docs/sub-agent-checklist.md`](../../docs/sub-agent-checklist.md) into the sub-agent's prompt verbatim. Do not paraphrase or "summarize."

## 8. Never do implementation work in main checkout — dispatch to worktree sub-agents

**Trigger:** about to make code changes in the main checkout.

**Must do:** create a worktree (`git worktree add`), dispatch a sub-agent to that worktree, end the turn. The main orchestrator checkout is for coordination/planning only.

---

If you find yourself about to violate one of these, STOP and reconsider. If a rule conflicts with the user's explicit instruction in the current session, surface the conflict and ask. If you violate one and notice mid-session, recover honestly and store the lesson in canonical docs (not as memory) for the next orchestrator.
