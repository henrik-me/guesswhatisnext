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

### Fallback progress signals (when sub-agent is silent)

Sub-agents are required to emit `STATE:` lines on every transition (see the bullet list above). In practice they sometimes don't — they push commits, turn CI green, and edit files without ever surfacing a `STATE:` line to the orchestrator's `read_agent` view. **The orchestrator must not mistake a missing `STATE:` line for a missing heartbeat.** Silence on `STATE:` is not silence on progress.

On every heartbeat (still ≤ 10 min cadence per the idle-poll floor above), if no new `STATE:` line has arrived since the last user-facing update, the orchestrator **must** check the following fallback signals (in parallel where possible) before reporting status to the user:

1. **Sub-agent runtime signal.** `read_agent` returns `tool_calls_completed` and `current_intent`. If `tool_calls_completed` is increasing turn-over-turn, the agent is alive and working — even if it hasn't said `STATE:` yet.
2. **Git branch activity.** `git fetch origin <branch> && git --no-pager log --oneline origin/<branch> -10` reveals new commits the sub-agent has pushed. **Each new commit is a real progress signal — far stronger than a missing `STATE:` line.**
3. **PR state on GitHub.** `gh pr view <num> --json updatedAt,statusCheckRollup,reviews,comments,body` reveals new CI runs, new Copilot review turns, new comments, and updates the sub-agent has made to the PR body (which is where local-review findings are recorded per [§ Local Review Loop in REVIEWS.md](REVIEWS.md#local-review-loop)). `updatedAt` advancing is a heartbeat by itself.
4. **CI workflow runs.** `gh run list --branch <branch> --limit 5` shows new workflow runs being triggered by the sub-agent's pushes (a separate signal from PR `statusCheckRollup`, useful when CI is queued or just started).
5. **Working-tree file mtimes.** Recent edits the agent hasn't yet committed (substitute the worktree path for `$worktreePath`):

   ```powershell
   $worktreePath = 'C:\src\gwn-worktrees\wt-N'
   Get-ChildItem $worktreePath -Recurse -File |
     Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-15) -and $_.FullName -notmatch 'node_modules|\\.git\\' } |
     Sort-Object LastWriteTime -Descending |
     Select-Object -First 10
   ```

   On Unix-like hosts the equivalent is `find "$worktreePath" -type f -mmin -15 -not -path '*/node_modules/*' -not -path '*/.git/*' | head`.

**Heartbeat protocol.** On every heartbeat:

1. First call `read_agent` (cheap).
2. If a new `STATE:` line is present, report it as before — done.
3. If no new `STATE:` line, run the fallback-signal checks above (parallelize the `gh` / `git` / file-mtime calls).
4. **Report to the user using the richest signal available.** Prefer concrete progress ("4 new commits since last heartbeat, all CI green, 2 review comments resolved") over absence-of-signal complaints ("no STATE: transitions in N minutes"). The user wants to know what the agent has accomplished, not what it hasn't said.
5. Only if **all** fallback signals are also flat — no new commits, no new CI runs, no file mtime changes within ~15 min, and `tool_calls_completed` not incrementing across two consecutive `read_agent` calls — treat the agent as potentially stuck and escalate per the existing blocked/escalation guidance.

This subsection does **not** change the sub-agent's reporting duties. Sub-agents must still emit `STATE:` lines per the canonical vocabulary above. This is purely about what the orchestrator does *additionally* to compensate when that contract is not honored, so that a sub-agent's reporting lapse never degrades into a user-visible "nothing is happening" claim when in fact a lot is happening.

### Background polling-loop watcher prompts

Background sub-agents are the canonical pattern for watching long-running CI runs, awaiting a Copilot review, or polling for a state change on a PR (see the existing rule about always launching a background watcher for long-running CI). The agent runs a polling loop in its own session and stops when a strict trigger fires or the loop times out.

Three failure modes have been observed and **must be defended against in every watcher prompt**:

1. **Loop runs in a child process and the agent exits.** A watcher that "sets up" a sub-shell or daemon and reports back in <1 minute has not actually monitored anything — the moment the agent exits, that child process is orphaned. **Prompt language fix:** "YOU MUST EXECUTE THE POLLING LOOP YOURSELF in this session, calling the powershell tool N times. Do NOT spawn a sub-shell. Do NOT exit early without a STRICT trigger."

2. **`>=` instead of `>` on timestamp comparisons triggers on the existing state.** If the threshold equals the current latest review's `submittedAt`, a `>=` comparison fires immediately and reports "new review!" when there is none. **Prompt language fix:** "Use STRICT (`>`) lexicographic string comparison, NOT `>=`. The current latest review IS AT the threshold — that is NOT a new review. Only strictly-newer values count."

3. **Over-eager triggering on transient or steady states.** GitHub's `mergeStateStatus` cycles through `BEHIND` (main moved), `BLOCKED` (waiting on review), `UNKNOWN` (transient during CI), `CLEAN` (transient), and `DIRTY` (real conflict). A watcher that triggers on `BEHIND` will fire constantly in a churning-main environment; a watcher that triggers on `BLOCKED` will fire as soon as CI finishes and the human-approval gate becomes the only blocker. **Prompt language fix:** explicitly enumerate which states do NOT trigger ("DO NOT TRIGGER ON: BEHIND, BLOCKED, UNKNOWN, IN_PROGRESS/QUEUED, SUCCESS"). Trigger only on actionable states: `MERGED`, `CLOSED`, `DIRTY` (real conflict), `FAILURE`, or a strictly-new review/comment.

**Canonical watcher loop shape (PowerShell):**

```text
Loop EXACTLY N iterations (e.g. 18). Sleep 80 seconds between each via
`Start-Sleep -Seconds 80` (powershell tool, mode=sync, initial_wait=90).

At each iteration:
1. Run a single `gh pr view ... --jq '...'` to capture current state.
2. Print one summary line: `poll N: head=<short> state=<X> mergeState=<X> ...`.
3. Check STRICT triggers. STOP and report only if one fires.
4. Otherwise sleep and continue to next iteration.

If all N iterations complete without a strict trigger, report "TIMEOUT-CLEAN"
with the final state from the last poll.
```

**Always inspect the watcher's report against the live PR state before acting on it.** Watchers built on smaller models (e.g. Haiku) occasionally false-trigger; cross-checking with `gh pr view ...` from the orchestrator's session before, for example, force-pushing a rebase prevents wasted cycles on phantom triggers.

### Windows PowerShell agents — non-interactive git

`git rebase` / `git rebase --continue` / `git commit --amend` launch the user's editor (vim by default on Windows Git installations) for commit-message editing, which hangs the agent's PowerShell session indefinitely. **Always set `$env:GIT_EDITOR="true"`** (a no-op editor that exits 0) before any rebase or commit-amend sequence:

```powershell
$env:GIT_EDITOR = "true"
git rebase origin/main
# ... resolve conflicts ...
git rebase --continue   # accepts the existing commit message without prompting
```

This is unrelated to the user's `~/.gitconfig` editor preference — the env var override is scoped to the agent's session. Equivalent on Unix-like agents: `export GIT_EDITOR=true`.

**Worked example — bad vs good heartbeat.** Sub-agent in slot wt-N has been silent on `STATE:` for ~70 minutes but has pushed 4 commits and turned PR #N's CI green:

| ❌ Bad heartbeat (the failure mode) | ✅ Good heartbeat (what the user should see) |
|---|---|
| "wt-N: no STATE: transitions in 70 minutes. Current intent: editing files. Will keep watching." | "wt-N (PR #N): 4 new commits since last heartbeat (`abc1234..def5678`), CI all green ✓, local-review agent posted 2 comments — both already resolved by follow-up commits. `tool_calls_completed` 142 → 198. Agent is actively in `local_review`; expecting `ready_to_merge` shortly. (Note: sub-agent has not emitted a fresh `STATE:` line — inferred from branch + PR signals.)" |

The bad version is technically true but operationally useless: it tells the user only what the agent failed to say, not what the agent did. The good version uses fallback signals to reconstruct the actual state of the work, flags the inference explicitly, and ends with a concrete next-transition expectation.

**Workboard transitions are push-gated too.** The sub-agent `STATE:` discipline above is only half the contract: orchestrator-driven workboard state transitions (notably `claimed`, but also any orchestrator-side column update such as reclamation) are not effective until the corresponding commit has landed on `origin/main`. See [§ WORKBOARD.md — Live Coordination, "Claim effectiveness" in TRACKING.md](TRACKING.md#workboardmd--live-coordination) for the gating rule and the push-rejected recovery procedure.

**Milestone timing table:** Sub-agents must include a timing table in their final completion report. This tracks elapsed time from session start for each major milestone (e.g., "npm install", "implementation", "validation", "PR created", "review clean"). This was identified as a process improvement during CS25 to help identify workflow bottlenecks.

## Branch Strategy & Merge Model
- **No direct commits to `main`** — all code changes go through pull requests, except `WORKBOARD.md` updates and clickstop plan files committed directly on `main` by orchestrating agents.
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
- No file edits, no commits, no branch creation (other than implicit via `git worktree add -b`) — **exception:** WORKBOARD.md updates and clickstop plan files are committed and pushed directly from main
- No `git push` from main (except WORKBOARD.md and clickstop plan file updates)
- No merge conflict resolution on main, **except for conflicts confined to `WORKBOARD.md` and handled per the WORKBOARD.md conflict-handling guidance** — if `git pull` conflicts on anything else, abort (`git merge --abort` or `git rebase --abort` depending on pull strategy) and have a sub-agent handle the sync in the worktree

**Orchestrator Startup Checklist** (first actions in every new session):
1. Run `git pull` to ensure the latest changes from all agents
2. Complete the Quick Reference Checklist's session-start full-reread requirement in [INSTRUCTIONS.md](INSTRUCTIONS.md#quick-reference-checklist) — view the entire file, then state both your derived agent ID and the `INSTRUCTIONS.md re-read complete @ <SHA>` receipt in your first response.
3. Read WORKBOARD.md for current active work and task assignments
4. Read CONTEXT.md for project state and codebase architecture; browse `project/clickstops/active/` and `project/clickstops/planned/` for available clickstops (after `git pull`)
5. Update WORKBOARD.md to register the session (update Orchestrators table), then commit and push immediately. The claim is not effective until the push lands on `origin/main` — see [§ WORKBOARD.md — Live Coordination, "Claim effectiveness" in TRACKING.md](TRACKING.md#workboardmd--live-coordination). If the push is rejected, follow the push-rejected recovery procedure in the same section before proceeding.
6. Once a task is claimed, prompt user to rename the session: `/rename [{agent-id}]-{task-id}: {clickstop name}`

**Orchestrator responsiveness:** The orchestrator must never block on work it can delegate. All delegatable work — code changes in worktrees; investigation, research, and analysis as non-worktree background agents — must run as background agents. The orchestrator's sole purpose is to stay available for user input and sub-agent coordination. The only synchronous work the orchestrator does is: reading/re-reading docs, lightweight planning and task decomposition, git operations on main (`git pull`, `git worktree add/remove`), updating WORKBOARD.md, creating and committing clickstop plan files, merging approved PRs, and communicating with the user. After dispatching a background agent, do not continue working on that task — report dispatch status to the user and wait for the next user message or agent completion notification.

**Deployment monitoring:** When a staging or production deploy is triggered, the orchestrator must not rely solely on the monitoring agent to report approval gates. The orchestrator should proactively check deploy status after the expected predecessor step completes (staging: ~5-10 min for fast-forward; production: ~1-2 min for input validation) and notify the user immediately if approval is pending. Never let an approval gate sit unnotified.

**Deployment approval policy:**
- **Staging:** Orchestrator may approve via API after verifying smoke tests passed
- **Production:** Orchestrator must notify the user and wait for explicit approval — never auto-approve production deploys

**No-shortcut policy:** Agents must never skip any part of the defined workflow (worktree, PR, review loop, workboard updates) without explicit user approval. The process applies equally to all changes regardless of perceived size or complexity — there is no "too small" threshold. If an agent believes a shortcut is warranted, it must ask the user before proceeding.

**Stale instructions guard:** After every `git pull` on main, re-read [INSTRUCTIONS.md's Quick Reference Checklist](INSTRUCTIONS.md#quick-reference-checklist), even if the pull is a no-op. If the pull was non-empty and its diff touched `INSTRUCTIONS.md` (e.g., `git --no-pager diff ORIG_HEAD..HEAD -- INSTRUCTIONS.md`), re-read the entire file and state `INSTRUCTIONS.md re-read complete @ <SHA>` before continuing. A no-op pull does not trigger the full-file reread on its own; the session-start full reread is the baseline.

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
2. Read WORKBOARD.md for current project context and active work — **do not edit it**. Specifically: do NOT add yourself or annotate yourself (e.g. `(sub-agent)` suffix) in the Orchestrators table; do NOT modify the State column or any row in Active Work other than the row your dispatching orchestrator already created for your task. State updates are the orchestrator's job (see [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine) point D). The `owner-in-orchestrators-table` docs:strict rule will fail CI if you violate this.
3. Run `npm install` in worktree
4. Set `$env:PORT = "300N"` for the assigned slot
5. Implement the task (commit after each meaningful step with `Agent:` trailer and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer). **Emit `STATE: implementing` on the first interim update after edits begin.**
6. Rebase onto latest main before pushing: `git fetch origin && git rebase origin/main`. If conflicts arise, resolve them and re-run validation.
7. Run full validation: `npm run lint && npm test && npm run test:e2e` (skip for docs-only PRs; docs-only PRs must still pass `npm run check:docs:strict`). **On all-green, emit `STATE: validating`.** If validation fails, fix and re-run (up to 3 attempts). If stuck, emit `STATE: blocked` with a `Blocked Reason: <short prose>` line, report failure details, and stop.
8. Push branch and create PR with task ID in title and agent metadata in description. **On `gh pr create` success, emit `STATE: pr_open` and `PR: <number>` on a separate line.**
9. Run local review loop (see [§ Local Review Loop in REVIEWS.md](REVIEWS.md#local-review-loop)): launch `code-review` agent with GPT 5.5 or higher (`model=gpt-5.5` is the floor), fix issues, push fixes, repeat until clean. **Emit `STATE: local_review` when the loop starts.**
10. **Document local review findings in PR description** (see [§ Local Review Loop in REVIEWS.md](REVIEWS.md#local-review-loop) for format)
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
- **Constraints:** do not edit `WORKBOARD.md` (this includes: do NOT add yourself to the Orchestrators table, do NOT use `(sub-agent)` annotation in any column, do NOT modify the State column); do not touch other agents' clickstop rows; do not work outside the assigned worktree; mark only the agent's own claimed task row `✅ Done` with the PR link.

This checklist exists so dispatched agents have everything needed to report state mechanically without orchestrator follow-up. Omitting any bullet pushes work back onto the orchestrator and degrades the State column to fiction (see [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine) point D).

### Cold-start container validation

Policy reference: [§ Database & Data in INSTRUCTIONS.md](INSTRUCTIONS.md#database--data) — "Cold-start container validation gates every check-in".

**Why.** Container/cold-start behavior surfaces issues that unit and E2E tests routinely miss: lazy request-driven DB init, the `503 + Retry-After` warmup path, the SPA `progressive-loader` cycle, and the `Database not yet initialized` vs `Database temporarily unavailable` (no-retry) shape distinction. The `npm run container:validate` script restarts the local MSSQL Docker stack with `GWN_SIMULATE_COLD_START_MS=30000` so the first `mssql-adapter._connect()` after process start sleeps 30 seconds — mimicking Azure SQL serverless auto-pause resume timing — and asserts that a representative unauthenticated DB-touching endpoint (`/api/scores/leaderboard`) gets at least one `503 + Retry-After` then a `200` within `WARMUP_CAP_MS + 30s + COLD_START_MS` (the `COLD_START_MS` term accounts for the simulated server-side delay on top of the SPA-side warmup budget). Both halves of the assertion matter: the 503 proves the warmup retry path was exercised; the 200 proves the request-driven lazy init pattern actually heals without operator intervention.

**When.** Every PR that changes server/client runtime or DB-touching code (i.e. anything that is NOT a docs-only or CI-config-only change) must run validation:

1. **Before requesting local review** — stop the local container, restart it, exercise the affected code paths against the freshly-restarted container.
2. **After local-review fixes are pushed** — repeat.
3. **After each Copilot review iteration's fixes are pushed** — repeat.

If validation fails at any step, do not request the next review round; fix and re-validate first.

**How.** Run `npm run container:validate` from the worktree root. The script (`scripts/container-validate.js`) handles full restart, readiness wait, smoke probe, log capture on failure, and teardown. Override env vars: `COLD_START_MS` (default 30000), `HTTPS_PORT` / `HTTP_PORT` (defaults 8443 / 3001), `COMPOSE_PROJECT` (default derived from cwd basename + 8-char hash of the absolute path so concurrent worktrees do not collide), `KEEP_RUNNING=1` (skip teardown for debugging). Note: `/api/db-status` (when CS53-8b lands) is safe to probe externally — it reads in-memory state only and does not touch the DB.

**What to record.** Append a `## Container Validation` section to the PR body with one entry per cycle, e.g.:

```
## Container Validation

| Cycle | Timestamp (UTC) | Result | Notes |
|-------|-----------------|--------|-------|
| Pre-local-review   | 2026-04-24T08:42Z | ✅ pass | saw 1×503 then 200 in 33s |
| Post-local-review  | 2026-04-24T09:11Z | ✅ pass | saw 2×503 then 200 in 38s |
| Post-Copilot R1    | 2026-04-24T09:55Z | ✅ pass | saw 1×503 then 200 in 31s |
```

A docs-only or CI-config-only PR may instead state `## Container Validation: not applicable (docs/CI-only)`.

**Model selection:** The preferred model for both orchestrators and sub-agents is Claude Opus 4.7 or higher (use the 1M context variant — e.g. `claude-opus-4.6-1m` — when available). GPT 5.5 or higher (`gpt-5.5` is the floor) is used for the local review loop (`code-review` agent) — it provides fast, high-signal code review at lower cost. Do not use GPT models for implementation work. See LEARNINGS.md for detailed model evaluation results.

## Parallel Agent Workflow

All worktree work runs as background tasks. The orchestrating agent launches each task agent in the background and is notified when each completes. Use **fixed-name worktree slots** (`wt-1` through `wt-4`) with task-specific branch names.
The branch name carries the task meaning — the folder name is just a stable slot.

### `staging-deploy.yml` dispatch coordination (concurrency-cancellation hazard)

`staging-deploy.yml` is configured with `concurrency.group: staging-deploy` and `cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}`. Read carefully: the `cancel-in-progress` predicate is evaluated for the **incoming** run, not the in-progress one, so:

- An incoming `workflow_dispatch` will NOT cancel an in-progress run (it queues).
- An incoming `push` WILL cancel an in-progress `workflow_dispatch` (because for the push, `cancel-in-progress=true`).

Net effect: any orchestrator that dispatches `staging-deploy.yml` for ad-hoc validation can have its run killed mid-execution by another agent landing a merge to `main`. CS53-20's end-to-end validation hit this — two of three dispatches were cancelled by other agents' merges; the third only succeeded because the merge wave happened to lull. Mitigations, in increasing order of robustness:

1. **Coordinate via WORKBOARD before dispatch** — post a "dispatching staging-deploy for X validation, hold merges for ~10min" note in the relevant active-work row. Cheap; no workflow change.
2. **Always retry on cancellation** — if `gh run view <id> --json conclusion` reports `cancelled` (not `failure`), re-dispatch immediately. Each dispatch costs ~5–10 min of CI runner time but is otherwise harmless.
3. **Fix the workflow concurrency** to give each `workflow_dispatch` its own group (`group: ${{ github.event_name == 'workflow_dispatch' && format('staging-deploy-dispatch-{0}', github.run_id) || 'staging-deploy' }}`). Cleanest, but requires owner approval since it changes the staging deploy contract for everyone.

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
6. Run local review loop (see [§ Local Review Loop in REVIEWS.md](REVIEWS.md#local-review-loop)) — fix issues, push fixes, repeat until clean
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

## Long-running PRs in fast-churning main

Branch protection requires the head branch to be up-to-date with `main` before merge. When `main` is being actively churned by parallel agents (5+ orchestrators landing commits per hour during a CS-wave), an in-flight PR can spend hours in a `BEHIND → rebase → push → CI green → BEHIND again` loop without ever satisfying the up-to-date requirement at the moment merge is attempted. CS53-23 (PR #255) hit this — ~10 rebase cycles, none of which produced a strictly-mergeable window.

**`gh pr merge --auto` is disabled in this repo** (`enablePullRequestAutoMerge = false`), so the auto-queue escape hatch GitHub normally provides isn't available.

**Escalation rule (owner / admin only, only after explicit user approval).**

This is an **exception path**, not default merge procedure. Per [§ WORKBOARD.md — Live Coordination in TRACKING.md](TRACKING.md#workboardmd--live-coordination) and the broader "no self-decided shortcuts" rule in [§ Quick Reference Checklist in INSTRUCTIONS.md](INSTRUCTIONS.md#quick-reference-checklist), a non-owner orchestrator must NOT use `--admin`. Once a PR satisfies all of the criteria below AND the user (or a delegated authority with admin rights) has explicitly approved the merge, the owner / admin may use `gh pr merge --squash --admin`:

- All required CI checks SUCCESS on the latest head commit
- All required reviews satisfied per [§ Review state on the `--admin` exception path](#review-state-on-the---admin-exception-path) below (Copilot for code/config; local review for docs-only — see [REVIEWS.md](REVIEWS.md))
- The PR has been ready-to-merge for ≥30 minutes AND `main` has moved ≥3 times since the last successful CI

The `--admin` flag bypasses the up-to-date requirement; the squash strategy keeps `main` history clean. Do **not** use `--admin` to bypass actual content conflicts (`mergeStateStatus = DIRTY`) — that path requires a real rebase and conflict resolution.

**When using `--admin`, post a PR comment** documenting why the bypass was used, who approved it, and which CI sha was last successful (e.g., "Admin merge after 10 rebase cycles in churning main; CI green on `<sha>`, all reviews satisfied per OPERATIONS § Review state on the `--admin` exception path, user approved at `<time>`"). The comment **must** link to (or paraphrase) the review-state criteria below so the audit trail records exactly which gate was relied on. This preserves the audit trail for branch-protection exceptions.

### Review state on the `--admin` exception path

Branch protection nominally requires an `APPROVED` review, but the only configured PR reviewer (the Copilot bot) does not reliably issue `APPROVED` — in practice it almost always finishes a clean round as `COMMENTED`. CS53-21 surfaced this; CS53-21.A resolves which review state actually suffices on the `--admin` exception path so the rule above (`All required reviews satisfied`) is not underspecified.

**Scope.** Everything below about *Copilot* review state applies to **code/config PRs** — the PR types where [REVIEWS.md § Local Review Loop](REVIEWS.md#local-review-loop) (and the "Copilot PR Review Policy" paragraph that follows it) requires Copilot review. **Docs-only PRs** (per the same REVIEWS.md table) skip Copilot review by design, so the Copilot-evidence and Copilot-inline-thread criteria below do **not** apply to them; for docs-only PRs the `--admin` review-state gate reduces to **(a)** local review (GPT-5.5 or higher) is clean and **(b)** all required CI checks are `SUCCESS` on the latest head commit. The CI prohibition below applies to *all* PR types. Note: in practice, docs-only PRs almost never need `--admin` (they do not invoke long Copilot review cycles), so this branch of the gate exists for completeness rather than as a routine path.

**Recommended landing position (code/config PRs).** The latest Copilot review may be `COMMENTED` (rather than `APPROVED`) **provided all** of the following hold:

- All inline comment threads on the latest commit are resolved (no open `pending` threads — verify via the GraphQL `reviewThreads` query in [REVIEWS.md](REVIEWS.md)).
- Local review (GPT-5.5 or higher, per [REVIEWS.md § Local Review Loop](REVIEWS.md#local-review-loop)) is clean — no open findings.
- All required CI checks are `SUCCESS` on the latest head commit.
- The orchestrator has explicitly tracked addressing each Copilot finding in commits visible in the PR thread (the per-thread "Fixed in `<commit>`" replies described in [REVIEWS.md](REVIEWS.md) are the audit trail for this).

If the latest review is `APPROVED`, that of course also satisfies the gate; the point of this sub-section is that `COMMENTED` + the four conditions above is **explicitly acceptable** and is in fact the normal converged end state for Copilot-reviewed PRs in this repo.

**Reading the broader workflow consistently.** Other docs use the shorthand "all reviews approved" when describing the `ready_to_merge` state (e.g. [§ Agent Progress Reporting in OPERATIONS.md](#agent-progress-reporting), and [§ WORKBOARD State Machine in TRACKING.md](TRACKING.md#workboard-state-machine)). On the `--admin` exception path, "approved" should be read as "satisfies the criteria above" — i.e. a clean `COMMENTED` round meeting the four conditions counts as `ready_to_merge` for the purpose of this exception path. The normal (non-`--admin`) merge path still requires whatever branch protection itself enforces.

**Hard prohibition — `--admin` MUST NOT be used when any of the following hold:**

- **(Code/config PRs only.)** Zero Copilot review evidence exists on the PR (i.e., the bot never ran — no review record at all from `copilot-pull-request-reviewer`). Request the review and wait; do not bypass. (Does not apply to docs-only PRs, which legitimately skip Copilot review per [REVIEWS.md](REVIEWS.md).)
- **(All PR types.)** Any required CI check is in `FAILURE` or `PENDING`. `--admin` exists to bypass the *up-to-date* requirement during main churn, **not** to bypass red or in-flight CI.
- **(Code/config PRs only.)** Any Copilot inline comment on the latest commit is unresolved (open `pending` thread). Resolve or reply-and-resolve first; an unresolved thread means a finding has not been dispositioned.

These prohibitions are absolute — owner approval does **not** override them, because they are about the *evidence base* for the merge, not about who is authorised to bypass branch protection.

**Audit-trail restatement (see also the bullet above).** Every `--admin` use must be accompanied by a PR comment that (a) explains why the bypass was needed (typically: long-running PR, churning main, ≥N rebase cycles), (b) names the user / authority who approved the merge, (c) records the CI sha that was last `SUCCESS`, and (d) links to or paraphrases the four "Recommended landing position" criteria above so a future reader can verify the gate was actually satisfied.

**Pre-merge sanity check via the merge tree**, even when bypassing the up-to-date check, to catch silent semantic conflicts that GitHub's mergeStateStatus wouldn't flag (e.g. two concurrent PRs both rewriting the same JSDoc):

```powershell
git fetch origin main
$mb = git merge-base origin/main HEAD
git merge-tree $mb origin/main HEAD |
  Select-String 'CONFLICT|<<<<<<<' |
  Select-Object -First 10
# Empty output = the squash-merge tree is clean
```

If non-empty, fall back to a real rebase before `--admin`-merging.

## Staging environment (scale-to-zero)

The Azure `gwn-staging` Container App is being moved to `minReplicas: 0` so it pays only for active usage (see [CS58](project/clickstops/done/done_cs58_scale-staging-to-zero.md) for the rollout plan, cost evidence, and rollback procedure — the live config tracks CS58-1/CS58-2). Staging is **not** the enforced pre-prod gate — that role belongs to the Ephemeral Smoke Test job in [`.github/workflows/staging-deploy.yml`](.github/workflows/staging-deploy.yml) plus local [`npm run container:validate`](#cold-start-container-validation) cycles.

### Waking staging for ad-hoc validation

Staging exists for ad-hoc operator probing (smoke-checking a fix in a real Azure environment, reproducing a cold-start path against managed Azure SQL, etc.). To wake it:

```powershell
$fqdn = az containerapp show --name gwn-staging --resource-group gwn-rg `
  --query "properties.configuration.ingress.fqdn" -o tsv
curl "https://$fqdn/healthz"
# wait ~60s for the first 200
```

Cold-start budget on the first request after idle:

- ~10–30s for the Container App replica to be allocated (`minReplicas: 0` → 1).
- ~30s for the lazy DB init in `server/app.js` to complete its first connection (request-driven, see [§ Database & Data in INSTRUCTIONS.md](INSTRUCTIONS.md#database--data)).

Cooldown: after the Container Apps idle window of zero traffic, the replica is deallocated again, so a probe followed by a few minutes of silence returns staging to its $0 idle state. The exact FQDN, the `minReplicas` value, and the cooldown live authoritatively in [`.github/workflows/staging-deploy.yml`](.github/workflows/staging-deploy.yml) and the live `az containerapp show` output — do not paraphrase them elsewhere. Until [CS58-1/CS58-2](project/clickstops/done/done_cs58_scale-staging-to-zero.md) land, the live `minReplicas` may still be `1`; check the CS task table for current state.

### Querying Azure cost

Source of truth for current Azure spend is Azure Cost Management. To regenerate a meter-level breakdown for `gwn-rg` over the last 30 days (used to verify the CS58 idle-meter savings, and reusable for any future cost analysis):

```powershell
$sub = az account show --query id -o tsv
$end = (Get-Date).ToString('yyyy-MM-dd')
$start = (Get-Date).AddDays(-30).ToString('yyyy-MM-dd')
$body = @{
  type = 'Usage'; timeframe = 'Custom'
  timePeriod = @{ from = $start; to = $end }
  dataset = @{
    granularity = 'None'
    aggregation = @{
      totalCost = @{ name = 'Cost'; function = 'Sum' }
      totalQty  = @{ name = 'UsageQuantity'; function = 'Sum' }
    }
    grouping = @(
      @{ type = 'Dimension'; name = 'Meter' }
      @{ type = 'Dimension'; name = 'ResourceId' }
    )
    filter = @{ dimensions = @{ name = 'ResourceGroupName'; operator = 'In'; values = @('gwn-rg') } }
  }
} | ConvertTo-Json -Depth 12 -Compress
$body | Out-File cost.json -Encoding ascii
az rest --method post `
  --url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.CostManagement/query?api-version=2023-11-01" `
  --body "@cost.json"
```

Adjust the `ResourceGroupName` filter, the timeframe, or the grouping dimensions to scope the query (for example, group by `ServiceName` to compare Container Apps vs Azure SQL). The `cost.json` file is a working artifact — delete it after the query runs (it is not committed; see `.gitignore`).

## Deploy gates (CS41)

Every staging and production deploy runs through a defense-in-depth chain of automated gates established by [CS41](project/clickstops/done/done_cs41_production-deploy-validation.md). Brief reference; see the CS41 done file for full task / acceptance-criteria detail.

**Pre-PR (PR-CI):**
- § 4a Telemetry Validation gate — every PR body that touches code (not docs-only) must include a `## Telemetry Validation` section. Enforced by `actions/github-script` reading `pull_request.body` + `listFiles` (CS41-6).
- Migration policy linter — `scripts/check-migration-policy.js` runs in `npm test` and rejects backward-incompatible patterns (`DROP COLUMN`, `RENAME`, new `NOT NULL` without `DEFAULT`, etc.) unless overridden via inline `// MIGRATION-POLICY-OVERRIDE: <reason + multi-PR-plan-link>` comment that references an [expand→migrate→contract](INSTRUCTIONS.md) plan (CS41-11 + CS41-13).

**Pre-traffic-shift (deploy workflow):**
- DB migrations run via `node scripts/migrate.js` BEFORE the `az containerapp update` step (prod) or BEFORE `traffic set` (staging). Failure aborts the deploy with no traffic shift (CS41-4).
- CS41-12 old-server-on-new-schema smoke runs the CS41-1 smoke flow against the OLD revision's direct FQDN against the just-migrated DB. Failure → abort + "MIGRATION BREAKS OLD SERVER — manual recovery required" annotation.
- CS41-1 smoke (login as `gwn-smoke-bot`, submit score, assert via `/api/scores/me`, assert `/api/health` DB ok) + CS41-2 per-request perf gates run against the new revision's direct FQDN BEFORE the `traffic set` step (staging multi-revision restructure landed in CS41-9).

**Post-traffic-shift / post-deploy:**
- CS41-3 AI verification (warning-only, scoped to the new revision via `cloud_RoleInstance`).
- CS41-7 per-deploy AI ingest summary (workflow summary + 90-day artifact `ingest-delta-<env>-<run_id>.json`).
- CS41-8 deploy summary annotation aggregating image SHA + revision + migration result + smoke per-step + per-request times + AI verify result + ingest delta + AI Logs blade link.

**Rollback path:**
- CS41-5 captures `ROLLBACK_REVISION_NAME` + `ROLLBACK_TIMESTAMP` and re-runs CS41-1 + CS41-3 scoped to that revision and time window. "ROLLBACK TARGET ALSO UNHEALTHY" hard-fail annotation if the rollback target itself fails smoke (operator intervention required).

**Operator one-time setup (per env):**
- GitHub secret `SMOKE_USER_PASSWORD_PROD` (env-scoped to production environment).
- GitHub secret `SMOKE_USER_PASSWORD_STAGING` (env-scoped to staging environment): `gh secret set SMOKE_USER_PASSWORD_STAGING --env staging --body <pw>`.
- **Production:** `node scripts/setup-smoke-user.js` against the prod DB to create the persistent `gwn-smoke-bot` user (idempotent; one-time only because prod uses persistent Azure SQL).
- **Staging:** no manual DB action needed — staging uses ephemeral SQLite and the `gwn-smoke-bot` user is recreated automatically by the in-workflow seed step on every deploy (CS61-1 endpoint + CS61-3 workflow wiring).

After CS61, staging skip-on-secret-missing branches are gone (CS61-4); a missing secret hard-fails the deploy at the early preflight step.

For the post-deploy KQL queries that CS41-3 / CS41-7 emit and how to interpret the deploy summary annotation, see [`docs/observability.md` § E](docs/observability.md#e-post-deploy-verification-cs41).

### Staging-specific extensions (CS61)

CS61 added staging-only deploy-time machinery to make the CS41 smoke + AI verify chain actually run in staging (where the SQLite DB is ephemeral per-revision, so prod's persistent-user pattern doesn't apply). Full plan + close-out in [`done_cs61_activate-cs41-smoke-in-staging.md`](project/clickstops/done/done_cs61_activate-cs41-smoke-in-staging.md).

**Inline-seed pattern (vs prod's persistent-user pattern):**
- Prod: `gwn-smoke-bot` is seeded once into Azure SQL via `scripts/setup-smoke-user.js`; persists across deploys.
- Staging: `gwn-smoke-bot` is recreated every deploy via `POST /api/admin/seed-smoke-user` (idempotent: 200 on exists, 201 on created; `requireSystem` auth; hard-coded username; audit-logged). Driver: `scripts/seed-smoke-user-via-api.js`.

**Cold-start init warmup (CS61-3a):**
- Before the seed step, the workflow calls `POST $NEW_REVISION_FQDN/api/admin/init-db` (with retry on 5xx for up to 60s) to force `unInit()` on the adapter. Without this the seed call races the cold-start init and gets HTTP 500 because `/api/admin/*` bypasses the cold-start gate (`server/app.js:296`).

**Migration introspection endpoint (CS61-2):**
- `GET /api/admin/migrations` (`requireSystem`) returns `{ applied, expected, status, names, lastError }` where `status` ∈ `ok|pending|ahead|error`.
  - `ok`: applied === expected.
  - `pending`: applied < expected (likely transient during cold-start, real failure if persistent).
  - `ahead`: applied > expected — LEGITIMATE during rollback windows (code older than DB).
  - `error`: tracker query itself failed.
- Smoke-side staging-only assertion against the new revision: `status === 'ok'`. NEVER asserted against OLD revision or rollback target.
- Backed by adapter-level `db.getMigrationState()` (CS61-0); routes never import `_tracker.js` directly.

**Cross-revision transition markers (CS61-5 + CS61-5a):**
- CS41-12 (old-rev smoke) and CS41-5 (rollback smoke) probe `GET $TARGET_REVISION_FQDN/api/admin/migrations` before running. HTTP 404 → that revision pre-dates CS61 → graceful-skip with notice. HTTP 200/401/403 → route exists → proceed with full smoke. Anything else → fail loudly. The probe is a **positive marker** (route presence) — cannot be fooled by a broken auth path.

**Rollback coupling (from CS61 plan v3 § D5):**

| If you revert... | You also MUST revert... | Why |
|---|---|---|
| CS61-1 (admin endpoint + script) | CS61-3 (workflow seed step) | Without endpoint, seed step always fails → ALL staging deploys broken. |
| CS61-2 (migration check + adapter API) | CS61-3 (smoke assertion of `migrations.status`) + CS61-5/5a (transition probes) | Smoke and probes would call non-existent endpoint. |
| CS61-3 (workflow integration) | CS61-4 (skip removal) + CS61-5/5a (transition markers) | Without seed in workflow, hard-fail = always-broken staging. |
| CS61-3a (init-db warmup) | none required, but expect intermittent seed-step 500s | Cold-start race returns. |
| CS61-3b (smoke header) | none required, but CS41-1 will fail in staging again | CS53-19 boot-quiet contract returns empty payload to score-readback. |

A single revert PR for any of CS61-1/2/3 must include the corresponding workflow revert atomically.

## Observability — App Insights query examples

See [`docs/observability.md`](docs/observability.md) for the full KQL bundle and operator runbook: how to access App Insights logs (portal + `az monitor log-analytics query`), common queries (requests by route, error rate, latency percentiles, slow requests, distributed-trace bridge to Pino logs in `ContainerAppConsoleLogs_CL`, cold-start mssql connect latency), staging-vs-prod filtering, and the dev/operator note about not exporting `APPLICATIONINSIGHTS_CONNECTION_STRING` locally.
