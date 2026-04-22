# Operations

This file contains day-to-day workflow procedures for orchestrators and sub-agents (claim/dispatch/handoff/deployment). For durable policy see `INSTRUCTIONS.md`. For review procedures see `REVIEWS.md`. For clickstop/workboard lifecycle see `TRACKING.md`.

## Agent Progress Reporting

All implementation work happens in background agents on worktrees — never in the main session. Non-worktree tasks (research, investigation, planning) may also run as background agents without a worktree slot (see § Parallel Agent Workflow). Worktree agents handle the full implementation lifecycle autonomously: code changes → validation → PR creation → local review loop → Copilot review (code/config PRs only). The orchestrating agent only intervenes to merge approved PRs.

Background agents **must** report progress to the orchestrating agent. Each milestone below maps to a canonical state in [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine); the sub-agent's prose update **must** be accompanied by a greppable `STATE: <value>` line so the orchestrator can extract the transition mechanically. **Only the orchestrator updates the `State` column in `WORKBOARD.md`** — sub-agents report events, the orchestrator records them. See [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine) point D ("Reporting protocol") for the authoritative description.

- **On start (after claiming work and beginning edits):** "Starting CS11-64 in wt-1 on branch yoga-gwn/cs11-64-provision-azure-sql" → `STATE: implementing`
- **On milestone:** "CS11-64: completed \<step\>, running validation..." (no state change unless this transitions to validation)
- **On validation pass (lint + test + e2e + check:docs all green locally):** "CS11-64: lint ✓ test ✓ e2e ✓ — creating PR" → `STATE: validating`
- **On validation fail:** "CS11-64: validation FAILED — \<error summary\>. Fixing..." (remain in `implementing` while fixing; only emit `STATE: blocked` if unable to proceed)
- **On abort / cannot proceed:** "CS11-64: BLOCKED — \<reason\>. Needs orchestrator intervention." → `STATE: blocked` plus a `Blocked Reason: <short prose>` line so the orchestrator can populate the Blocked Reason column verbatim
- **On PR created (`gh pr create` succeeded):** "CS11-64: PR #\<N\> created, running local review" → `STATE: pr_open` and `PR: <number>`
- **On local review started:** "CS11-64: local review in progress" → `STATE: local_review`
- **On Copilot review requested (code/config PRs):** "CS11-64: local review clean — requesting Copilot review" → `STATE: copilot_review`. For docs-only PRs: "CS11-64: local review clean — docs-only, skipping Copilot" (no Copilot transition; remain in `local_review` until ready).
- **On ready (CI green AND all reviews approved):** "CS11-64: PR #\<N\> ready for merge (reviews complete, CI green)" → `STATE: ready_to_merge`
- **On deployment approval gate:** When monitoring a staging or production deploy, the monitoring agent must immediately report when an approval gate is reached — do not wait for the full workflow to complete. The orchestrator must immediately notify the user with the approval URL. Approval gates are:
  - **Staging:** After "Fast-Forward release/staging" job completes → "Deploy to Azure Staging" waits for `environment: staging` approval
  - **Production:** After "Validate Deployment Inputs" job completes → "Deploy to Azure Production" waits for `environment: production` approval
  The monitoring agent should poll job status and when the predecessor job shows `completed` and the deploy job shows `status: waiting`, alert immediately.

**Deployment monitoring agent prompts must include:**
- The specific approval gate to watch for (which job triggers the gate)
- Instruction to report the approval gate immediately when reached, with the approval URL
- Instruction to NOT wait for full workflow completion before reporting approval gates

The orchestrating agent **must actively relay progress to the user** — never dispatch tasks and wait silently. When multiple tasks run in parallel, provide a summary table of all task statuses.

**Update cadence to the user (mandatory).** After dispatching one or more background agents, the orchestrator must keep the user informed on a predictable rhythm. The orchestrator owns the polling — the user must never have to ask "what's happening?".

- **On dispatch:** post a summary table listing every dispatched agent (agent_id, slot, branch, task, current status). This is the "kickoff snapshot".
- **On every sub-agent turn / state transition:** when a background agent emits a new turn (state transition, blocked report, intermediate milestone, completion notification), call `read_agent` and post an updated summary table to the user the same turn. Do not let transitions accumulate silently.
- **On every completion notification:** call `read_agent` immediately, summarize the result (PR link, final `STATE:`, any blockers), and tell the user what the orchestrator is doing next (e.g., "starting local-review monitor", "queuing merge", "dispatching dependent task").
- **Idle-poll floor:** if no transition or completion notification has arrived within ~10 minutes of the last user-facing update, the orchestrator must proactively call `list_agents` + `read_agent` and post a heartbeat update — even if the only thing to report is "still running, current intent: X, tool calls: N". The point is the user must not have to ask.
- **On all agents complete or idle:** post a closing summary and either await the next user instruction or proceed with the next planned step (and announce it).

The summary table format should include at minimum: agent_id, slot/branch, current state (or `current_intent` if pre-first-turn), elapsed time, and next expected transition. When multiple agents run in parallel, a single combined table is preferred over per-agent prose.

Do not use the "tell the user you're waiting and end your response" pattern as an excuse to go silent for long stretches — that pattern means "do not redo the agent's work in the foreground", not "do not check on it". The idle-poll floor above always applies.

**Workboard transitions are push-gated too.** The sub-agent `STATE:` discipline above is only half the contract: orchestrator-driven workboard state transitions (notably `claimed`, but also any orchestrator-side column update such as reclamation) are not effective until the corresponding commit has landed on `origin/main`. See [§ WORKBOARD.md — Live Coordination, "Claim effectiveness" in TRACKING.md](TRACKING.md#workboardmd--live-coordination) for the gating rule and the push-rejected recovery procedure.

**Milestone timing table:** Sub-agents must include a timing table in their final completion report. This tracks elapsed time from session start for each major milestone (e.g., "npm install", "implementation", "validation", "PR created", "review clean"). This was identified as a process improvement during CS25 to help identify workflow bottlenecks.

## Branch Strategy & Merge Model
- **No direct commits to `main`** — all code changes go through pull requests, except `WORKBOARD.md` updates and clickstop plan files committed directly on `main` by orchestrating agents. (CONTEXT.md summary rows may optionally be bundled with plan file commits.)
- Feature branches: `{agent-id}/{task-id}-{description}` (e.g., `yoga-gwn/cs11-64-provision-azure-sql`, `yoga-gwn/cs14-82-authoring-form`)
- Every PR must pass the **full validation suite** before merge:
  1. **Lint:** `npm run lint`
  2. **Unit + integration tests:** `npm test` (vitest)
  3. **E2E tests:** `npm run test:e2e`
- **PRs are squash-merged** into `main` — the many granular feature-branch commits collapse into one clean commit on main. The squash commit message summarizes the overall change.
- Branch protection rules on `main`:
  - Require PR with review before merging
  - Require CI status checks to pass (`lint`, `test`, `e2e`) — CI uses `paths-ignore` for docs-only PRs

  - No force pushes
  - No direct commits (except WORKBOARD.md and clickstop plan files by orchestrating agents)

## Agent Work Model

**Main agent (orchestration only)** — operates on the main checkout (`C:\src\guesswhatisnext<suffix>`).

Allowed on main checkout:
- `git pull` to sync after merges
- `git worktree add/remove` to manage worktree slots
- `gh pr merge --squash` to merge approved PRs
- Communication with the user (clarifying requirements, reporting progress)
- Planning, decomposing, and delegating work to sub-agents

NOT allowed on main checkout:
- No file edits, no commits, no branch creation (other than implicit via `git worktree add -b`) — **exception:** WORKBOARD.md updates and clickstop plan files (optionally with CONTEXT.md summary rows) are committed and pushed directly from main
- No `git push` from main (except WORKBOARD.md and clickstop plan file updates)
- No merge conflict resolution on main, **except for conflicts confined to `WORKBOARD.md` and handled per the WORKBOARD.md conflict-handling guidance** — if `git pull` conflicts on anything else, abort (`git merge --abort` or `git rebase --abort` depending on pull strategy) and have a sub-agent handle the sync in the worktree

**Orchestrator Startup Checklist** (first actions in every new session):
1. Run `git pull` to ensure the latest changes from all agents
2. Read INSTRUCTIONS.md in the repository root
3. Read WORKBOARD.md for current active work and task assignments
4. Read CONTEXT.md for project state and available clickstops
5. Determine agent ID from hostname + repo suffix (see [§ Agent Identification in TRACKING.md](TRACKING.md#agent-identification))
6. Update WORKBOARD.md to register the session (update Orchestrators table), then commit and push immediately. The claim is not effective until the push lands on `origin/main` — see [§ WORKBOARD.md — Live Coordination, "Claim effectiveness" in TRACKING.md](TRACKING.md#workboardmd--live-coordination). If the push is rejected, follow the push-rejected recovery procedure in the same section before proceeding.
7. Once a task is claimed, prompt user to rename the session: `/rename [{agent-id}]-{task-id}: {clickstop name}`

**Orchestrator responsiveness:** The orchestrator must never block on work it can delegate. All delegatable work — code changes in worktrees; investigation, research, and analysis as non-worktree background agents — must run as background agents. The orchestrator's sole purpose is to stay available for user input and sub-agent coordination. The only synchronous work the orchestrator does is: reading/re-reading docs, lightweight planning and task decomposition, git operations on main (`git pull`, `git worktree add/remove`), updating WORKBOARD.md, creating and committing clickstop plan files, merging approved PRs, and communicating with the user. After dispatching a background agent, do not continue working on that task — report dispatch status to the user and wait for the next user message or agent completion notification.

**Deployment monitoring:** When a staging or production deploy is triggered, the orchestrator must not rely solely on the monitoring agent to report approval gates. The orchestrator should proactively check deploy status after the expected predecessor step completes (staging: ~5-10 min for fast-forward; production: ~1-2 min for input validation) and notify the user immediately if approval is pending. Never let an approval gate sit unnotified.

**Deployment approval policy:**
- **Staging:** Orchestrator may approve via API after verifying smoke tests passed
- **Production:** Orchestrator must notify the user and wait for explicit approval — never auto-approve production deploys

**No-shortcut policy:** Agents must never skip any part of the defined workflow (worktree, PR, review loop, workboard updates) without explicit user approval. The process applies equally to all changes regardless of perceived size or complexity — there is no "too small" threshold. If an agent believes a shortcut is warranted, it must ask the user before proceeding.

**Stale instructions guard:** After every `git pull` on main, check if INSTRUCTIONS.md was updated (e.g., `git --no-pager diff ORIG_HEAD..HEAD -- INSTRUCTIONS.md`). If it changed, re-read it before continuing work. This ensures the orchestrator always operates under the latest guidelines, especially when other agents' PRs update process documentation. Additionally, re-read the Quick Reference Checklist at the top of this file after every `git pull`, regardless of whether the file changed.

**Copilot CLI commands (reference):** The user has access to CLI commands that the orchestrator should be aware of:
- `/rename <name>` — rename the current session (orchestrator should prompt for this after claiming a task)
- `/remote` — start a remote cloud session
- `/tasks` — view running background tasks

**Sub-agents in worktrees** — handle all implementation work. Each sub-agent gets a worktree slot with a meaningful branch name (e.g., `yoga-gwn/cs0-lean-instructions`, `yoga-gwn/cs5-37-ws-reconnect`).

Sub-agents are responsible for:
- All implementation file changes (code, docs, config) and all commits/pushes in worktrees
- PR creation (`gh pr create`)
- Copilot review loop (code/config PRs: reply to comments, resolve threads, re-request review; docs-only PRs: skip Copilot review)
- Merge conflict resolution (rebase/merge `origin/main` into the feature branch)

This keeps `main` clean and ensures implementation changes flow through PRs. (Clickstop plan files and WORKBOARD.md are the exceptions — those are committed directly on `main` by the orchestrator.)

**Sub-Agent Checklist** (include verbatim in every sub-agent prompt — the orchestrator must provide: task ID, acceptance criteria, worktree slot, branch name, port, and edge cases):
1. Read INSTRUCTIONS.md in the repository root before starting any work
2. Read WORKBOARD.md for current project context and active work — **do not edit it**; State updates are the orchestrator's job (see [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine) point D)
3. Run `npm install` in worktree
4. Set `$env:PORT = "300N"` for the assigned slot
5. Implement the task (commit after each meaningful step with `Agent:` trailer and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer). **Emit `STATE: implementing` on the first interim update after edits begin.**
6. Rebase onto latest main before pushing: `git fetch origin && git rebase origin/main`. If conflicts arise, resolve them and re-run validation.
7. Run full validation: `npm run lint && npm test && npm run test:e2e` (skip for docs-only PRs; docs-only PRs must still pass `npm run check:docs:strict`). **On all-green, emit `STATE: validating`.** If validation fails, fix and re-run (up to 3 attempts). If stuck, emit `STATE: blocked` with a `Blocked Reason: <short prose>` line, report failure details, and stop.
8. Push branch and create PR with task ID in title and agent metadata in description. **On `gh pr create` success, emit `STATE: pr_open` and `PR: <number>` on a separate line.**
9. Run local review loop (see [§ Local Review Loop in REVIEWS.md](REVIEWS.md#local-review-loop-latest-gpt-model)): launch `code-review` agent with the latest available GPT model (`model=gpt-5.4` at time of writing), fix issues, push fixes, repeat until clean. **Emit `STATE: local_review` when the loop starts.**
10. **Document local review findings in PR description** (see [§ Local Review Loop in REVIEWS.md](REVIEWS.md#local-review-loop-gpt-54) for format)
11. **For code/config PRs:** Request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"` — wait for review per [§ Waiting for Copilot Review in REVIEWS.md](REVIEWS.md#waiting-for-copilot-review). **Emit `STATE: copilot_review` after the reviewer is added.**
12. **For docs-only PRs:** Skip Copilot review — local review is sufficient (no `copilot_review` transition; stay in `local_review` until ready)
13. Address all review comments (reply + fix + resolve threads)
14. Re-request review and repeat until clean (code PRs only)
15. Report completion with PR number and summary. **When CI is green AND all required reviews approve, emit `STATE: ready_to_merge` as the final state.** The final report must always end with the latest `STATE: <value>` line so the orchestrator can extract it mechanically.
16. **Include a milestone timing table** in the final report (step name + elapsed time from session start). This helps identify bottlenecks in the agent workflow.
17. **Update the claimed task row in the clickstop file** (e.g. mark `✅ Done` with the PR link) as part of the implementation commits. **Do not edit `WORKBOARD.md`** — that is the orchestrator's responsibility per [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine) point D and [§ WORKBOARD Row Ownership & Stale-Lock Policy in TRACKING.md](TRACKING.md#workboard-row-ownership--stale-lock-policy) point A.

**Sub-agent dispatch checklist (for orchestrators).** Every dispatch prompt the orchestrator writes for a sub-agent must include, at minimum:

- **Worktree path** (e.g. `C:\src\gwn-worktrees\wt-1`) and the **branch name** already checked out there.
- **Required reads:** `INSTRUCTIONS.md`, `WORKBOARD.md`, the clickstop plan file under `project/clickstops/active/`, plus any task-specific docs.
- **Validation commands:** the `npm run lint && npm test && npm run test:e2e` line (or `npm run check:docs:strict` for docs-only) the agent must run before opening a PR.
- **Commit & PR steps:** commit message format (conventional + `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`), `git push -u origin <branch>`, `gh pr create` with title/body conventions, and (for code/config PRs) `gh pr edit <#> --add-reviewer Copilot`.
- **State-reporting protocol:** the explicit `STATE: <value>` line for each transition listed in § Agent Progress Reporting. The final report must end with greppable `STATE:` (and `PR:` when applicable) lines. Reference [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine) for the canonical vocabulary.
- **Constraints:** do not edit `WORKBOARD.md`; do not touch other agents' clickstop rows; do not work outside the assigned worktree; mark only the agent's own claimed task row `✅ Done` with the PR link.

This checklist exists so dispatched agents have everything needed to report state mechanically without orchestrator follow-up. Omitting any bullet pushes work back onto the orchestrator and degrades the State column to fiction (see [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine) point D).

**Model selection:** The preferred model for both orchestrators and sub-agents is `claude-opus-4.6-1m` (Opus with 1M context). The latest available GPT model (`gpt-5.4` at time of writing — always prefer the newest GPT release) is used for the local review loop (`code-review` agent) — it provides fast, high-signal code review at lower cost. Do not use GPT models for implementation work. See LEARNINGS.md for detailed model evaluation results.

## Parallel Agent Workflow

All worktree work runs as background tasks. The orchestrating agent launches each task agent in the background and is notified when each completes. Use **fixed-name worktree slots** (`wt-1` through `wt-4`) with task-specific branch names.
The branch name carries the task meaning — the folder name is just a stable slot.

**Worktree root naming:** `gwn<suffix>-worktrees` where `<suffix>` is the text after the
repo name in the clone folder (e.g., clone `guesswhatisnext_copilot2` → suffix `_copilot2`
→ root `gwn_copilot2-worktrees`). If clone matches repo name exactly, suffix is empty.

| Clone folder | Suffix | Worktree root |
|---|---|---|
| `guesswhatisnext` | *(empty)* | `gwn-worktrees` |
| `guesswhatisnext_copilot2` | `_copilot2` | `gwn_copilot2-worktrees` |

| Slot | Path | Port | Purpose |
|---|---|---|---|
| main | `C:\src\guesswhatisnext<suffix>` | 3000 | Orchestration only — no code changes |
| wt-1 | `C:\src\gwn<suffix>-worktrees\wt-1` | 3001 | Sub-agent slot 1 |
| wt-2 | `C:\src\gwn<suffix>-worktrees\wt-2` | 3002 | Sub-agent slot 2 |
| wt-3 | `C:\src\gwn<suffix>-worktrees\wt-3` | 3003 | Sub-agent slot 3 |
| wt-4 | `C:\src\gwn<suffix>-worktrees\wt-4` | 3004 | Sub-agent slot 4 |

**Task parallelism:**
- **Worktree tasks** (code changes, tests, PRs): bounded by worktree slots wt-1 through wt-4. Each needs a git worktree, a unique port, and `npm install`.
- **Non-worktree tasks** (research, investigation, session queries, planning, analysis): not bounded by worktree slots. These run as non-worktree background agents without consuming a worktree slot. No port or npm install needed.

The orchestrator must maximize parallelism by running non-worktree tasks concurrently with worktree tasks. There is no fixed limit on non-worktree background tasks.

**Agent setup:** Each worktree needs `npm install` and `$env:PORT = "300X"`. Database auto-creates at `data/game.db`. Each worktree gets its own independent database.

**Branch lifecycle:**
1. Work on `{agent-id}/{task-id}-{description}` branch in slot
2. **Commit after each meaningful step** with a descriptive message — don't wait until the end
3. Run full validation before pushing: `npm run lint && npm test && npm run test:e2e`
4. Push branch to origin
5. Create PR: `gh pr create --base main --head {agent-id}/{task-id}-{description}`
6. Run local review loop (see [§ Local Review Loop in REVIEWS.md](REVIEWS.md#local-review-loop-gpt-54)) — fix issues, push fixes, repeat until clean
7. **Code/config PRs:** Request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"` | **Docs-only PRs:** Skip Copilot review
8. Address review feedback — commit each round of fixes separately and answer each comment meaningfully and close comment when changes are committed.
9. After CI passes and reviews are complete (Copilot approval for code/config PRs; local review clean for docs-only PRs), **squash-merge** via GitHub UI or `gh pr merge --squash`
10. Main orchestrating agent pulls after each merge: `git pull`

**Recycling slots:** `git worktree remove <path> --force` → `git branch -d old-branch` → `git worktree add -b new-branch <path> main`

## Merge & Parallel Grouping Notes

**Merge conflict guidelines:**
- Merge zero-conflict branches first (e.g., new-files-only tasks)
- For shared files: merge one at a time, run `npm test` after each
- Resolve conflicts manually if needed (typically additive — HTML sections, CSS rules, route registrations)
- **Never run in parallel**: tasks that modify the same function body

**Parallel grouping rules:**
- ✅ Backend-only tasks (different route files) can safely parallelize
- ✅ Tasks creating only new files (infra, new routes) are always safe
- ⚠️ Tasks that both add HTML screens will conflict in `index.html`
- ⚠️ Tasks that both modify `matchHandler.js` should be sequential
- ❌ Never parallelize two tasks that both rewrite the same function

For deployment environments, CI/CD pipeline, and rollback policy, see [CONTEXT.md](CONTEXT.md) and [README.md](README.md).
