# Tracking Lifecycle Procedures

<!-- check:ignore link-resolves -->
<!-- The links to OPERATIONS.md and REVIEWS.md below resolve once CS45-2 and CS45-3 land. -->

This file contains the tracking-lifecycle procedures for orchestrators: clickstop file naming/location, `CONTEXT.md` update protocol, `WORKBOARD.md` update protocol (including the state machine and row-ownership/stale-lock policy), CS number conflict resolution, and deferred-task handling. For durable policy see `INSTRUCTIONS.md`. For day-to-day workflow see `OPERATIONS.md`. For review procedures see `REVIEWS.md`.

## Clickstop & Task Management

**Clickstops** are the unit of deliverable work — each represents a feature, capability, or related set of changes. **Tasks** are the breakdown within a clickstop.

### Task IDs
Format: `CS<clickstop#>-<task#>` (e.g., `CS11-64`, `CS14-82`). Used in branch names, commit messages, PR titles, and WORKBOARD.md.

**CS number allocation:** Before assigning a new clickstop number, verify the number is not already taken by checking all three sources:
1. **Existing clickstop files:** `ls project/clickstops/planned/`, `ls project/clickstops/active/`, and `ls project/clickstops/done/` — check all `planned_`, `active_`, and `done_` files for the highest CS number
2. **WORKBOARD.md Active Work:** Another agent may have just claimed a CS number but not yet committed the plan file — check Active Work for any CS numbers in use
3. **CONTEXT.md clickstop summary table:** Cross-reference the summary table for any CS numbers added by other agents

Use the next number after the highest found across all three sources. If in doubt, use a higher number — gaps in CS numbering are harmless, collisions cause real problems.

### Task Statuses
- ⬜ Pending — not started, may have unmet dependencies
- 🔜 Ready — dependencies met, can be picked up
- 🔄 In Progress — claimed by an agent (see WORKBOARD.md)
- ✅ Done — merged to main
- 🚫 Blocked — explain why in Notes column

### Agent Identification
Every orchestrating agent has a unique ID: `{machine-short}-{repo-suffix}`
- **Machine short**: lowercase, first meaningful segment of hostname (e.g., `HENRIKM-YOGA` → `yoga`)
- **Repo suffix**: derived from clone folder (e.g., `guesswhatisnext` → `gwn`, `guesswhatisnext_copilot2` → `gwn-c2`)
- Override via `GWN_AGENT_MACHINE` env var if hostname is unhelpful

### Naming Conventions

Task IDs use uppercase in documentation and tables (`CS11-64`) but are normalized to **lowercase** in branches and commit scopes (`cs11-64`).

**Branches:** `{agent-id}/{task-id}-{description}`
```
yoga-gwn/cs11-64-provision-azure-sql
yoga-gwn-c2/cs14-82-authoring-form
```

**Commits:** Include `Agent:` and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailers
```
feat(cs11-64): provision Azure SQL server

Agent: yoga-gwn/wt-1
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**PR titles:** `cs{N}-{task#}: description`
**PR descriptions:** Include agent metadata block:
```
## Task: CS11-64 — Provision Azure SQL
**Clickstop:** CS11 — Database Migration
**Agent:** yoga-gwn/wt-1
```

### Clickstop Completion Checklist

Every clickstop must satisfy ALL of these before marking complete:
- [ ] All tasks done and merged (or deferred — see Deferred work policy below)
- [ ] README updated (if user-facing changes)
- [ ] INSTRUCTIONS.md updated (if architectural/workflow changes)
- [ ] CONTEXT.md updated with final state
- [ ] Tests added/updated, coverage measured
- [ ] Performance/load test evaluation (if applicable)
- [ ] Data structure changes documented
- [ ] Staging deployed and verified
- [ ] Production deployed and verified (or N/A with documented reason)

Filled-in checklists are recorded in the clickstop's archive file upon completion.

**Deferred work policy:** When completing a clickstop with deferred tasks, the orchestrator must:
1. Create a new `planned_` clickstop file for the deferred work, including: what was deferred, why it was deferred, and a link back to the originating clickstop
2. Add the new clickstop to the CONTEXT.md summary table
3. Inform the user that deferred work has been placed in a new clickstop, with a link and summary

A clickstop may be marked complete with deferred tasks only if the deferred work has been captured in a new clickstop. Never silently drop deferred tasks.

### WORKBOARD.md — Live Coordination

WORKBOARD.md is the real-time coordination file for multi-agent work. It tracks who is working on what, right now.

**Direct commit on main (no PR required):**
Unlike most project files, WORKBOARD.md is updated by orchestrating agents directly on main via commit + push. **The push is critical** — a local-only commit provides zero coordination value to other agents. Always commit and push together (see the multi-line commit format with `Agent:` trailer in § Commit Convention for workboard updates below). This enables fast task assignment without PR review overhead. Clickstop plan files are the other direct-on-main exception (see § Clickstop File Lifecycle). The workboard must be updated immediately when:
- An orchestrator claims a task (add to Active Work)
- An orchestrator starts any work — including non-clickstop tasks (ad-hoc requests, deployments, investigations). Use empty Task ID and Clickstop columns ("—") for non-CS work.
- A task completes (remove from Active Work)
- A task becomes blocked (keep in Active Work with a note indicating blocked status)
- An orchestrator starts or stops a session (update Orchestrators table)

**Session naming:** After updating the workboard to claim a task, prompt the user to rename the session so it's identifiable at a glance. Format: `[{agent-id}]-{task-id}: {clickstop name}`. Example:
```
/rename [yoga-gwn-c2]-CS17-1: Process Documentation Improvement
```

**Update frequency:** Orchestrators should update WORKBOARD.md often — at minimum on task start, task complete, and session start/end. Between those events, update whenever meaningful progress occurs (e.g., PR created, review round complete).

**Timestamps:** Use ISO 8601 format with time in the "Started" column and "Last updated" header: `2026-04-12T18:27Z` (not just `2026-04-12`). Time precision matters when multiple agents claim tasks on the same day.

**Task locking:** When a task appears in Active Work assigned to an agent ID, no other orchestrator may pick up that task. The assignment is a lock. If an orchestrator crashes or stops working:
- The task remains assigned in WORKBOARD.md
- When that orchestrator restarts, it reads WORKBOARD.md, finds its assigned tasks, and resumes work
- There is no automated process for reassigning stalled tasks — a human must manually update WORKBOARD.md to release the lock if an orchestrator is permanently unavailable

**Row ownership:** Each orchestrator may only modify its own rows in Active Work. When completing a task, remove only your own row — never edit or remove another agent's entries. When adding a task, append a new row without altering existing rows.

**Task ownership extends to files:** Never modify, rename, or interact with files related to another agent's active task. Before making changes, check WORKBOARD.md Active Work to ensure no other agent owns that clickstop or file. If a merge conflict involves another agent's files, keep their content unchanged (additive merge).

**Clickstop assignment:** An entire clickstop can be assigned to one orchestrator. When a clickstop is assigned, all tasks within it belong to that orchestrator. Other orchestrators must not pick up individual tasks from an assigned clickstop unless explicitly released.

**Commit convention for workboard updates:**
```
workboard: <brief description of change>

Agent: {agent-id}
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**Conflict handling:** Since multiple orchestrators may update WORKBOARD.md concurrently, conflicts are possible. Orchestrators should `git pull` before updating. If a conflict occurs **only in `WORKBOARD.md`**, this is the one exception to the general "do not resolve merge conflicts in the main checkout" rule: resolve it by keeping both agents' entries (additive merge), then complete the workboard-only update. If the pull produces conflicts in any other file, abort the merge and follow the normal abort + worktree workflow instead.

**Public repository note:** When branch protection is enabled with required reviews, the repository owner (henrik-me) uses a repository ruleset bypass to allow direct WORKBOARD.md and clickstop plan file pushes. This bypass is configured in Settings → Rules → Rulesets and applies only to the owner role. Non-owner orchestrating agents (if any) would need to use PR-based updates instead.

### WORKBOARD State Machine

This section defines the canonical vocabulary for the lifecycle of an Active Work row. The `State` column lives in `WORKBOARD.md` (added by CS44-3). The sub-agent → orchestrator reporting protocol that drives this column is described in § Agent Progress Reporting and the dispatch checklist in § Agent Work Model ("Sub-agent dispatch checklist").

**A. Canonical states (8).** Every Active Work row is in exactly one of:

| State | Entered when |
|---|---|
| `claimed` | Orchestrator has added the row but no work has begun. |
| `implementing` | Sub-agent is making changes in its worktree. |
| `validating` | Sub-agent has finished changes and is running the full validation suite locally (see § Branch Strategy & Merge Model for the canonical commands). |
| `pr_open` | PR has been opened on GitHub but no review activity yet (or CI still running). |
| `local_review` | Local code-review pass (e.g. via the `code-review` sub-agent) is in flight. |
| `copilot_review` | Awaiting or addressing GitHub Copilot's review on the PR. |
| `ready_to_merge` | All reviews approved, CI green, awaiting orchestrator's `gh pr merge`. |
| `blocked` | Work cannot proceed; reason recorded in the Blocked Reason column. |

**B. Allowed transitions.**

- Forward path: `claimed → implementing → validating → pr_open → local_review → [copilot_review] → ready_to_merge`. `local_review` is required after `pr_open` (see § Agent Progress Reporting). `copilot_review` is required for code/config PRs and skipped for docs-only PRs.
- `local_review` and `copilot_review` may interleave or repeat across review round-trips (e.g. local → copilot → local again after fixes).
- Any state → `blocked` is permitted at any time.
- `blocked` → the previous state when unblocked (do not invent a new state to record "was blocked"; `git log` on `WORKBOARD.md` is the audit trail).
- **Terminal:** the row is *removed* from `WORKBOARD.md` after merge (see § WORKBOARD.md — Live Coordination). There is no `done` / `merged` state — do not add one. This matches the existing direct-on-main workboard discipline and the CS43 strict-shape principle.

**C. Event → state mapping (the protocol).** State changes are driven by observable events, not judgement calls:

| Event (observed by) | New State |
|---|---|
| Orchestrator dispatches sub-agent | `claimed` |
| Sub-agent starts editing files | `implementing` |
| Sub-agent finishes edits, begins the full validation suite (see § Branch Strategy & Merge Model) | `validating` |
| Sub-agent opens PR (e.g. via `gh pr create`) | `pr_open` |
| Sub-agent invokes the `code-review` agent | `local_review` |
| Local review clean; sub-agent requests Copilot review (or Copilot review begins) | `copilot_review` |
| All reviews approved + CI green | `ready_to_merge` |
| Anything that prevents progress | `blocked` (with reason in Blocked Reason column) |

**D. Reporting protocol (sub-agent → orchestrator).** The State column is owned by the orchestrator. Sub-agents do not edit `WORKBOARD.md` (per § Row ownership above). Instead:

- Sub-agents **report state-change events** in their interim updates and final report. Use a greppable line of the form `STATE: <new-state>` (e.g. `STATE: pr_open`) so the orchestrator can extract transitions mechanically from agent output.
- The sub-agent's final report **must** include the latest state — typically `pr_open`, `ready_to_merge`, or `blocked`.
- The orchestrator updates the State column on receipt of the event report. The orchestrator may also infer state directly when the sub-agent's report is delayed — e.g. by querying `gh pr view`, checking CI status, or reading PR review threads.
- The `Last Updated` timestamp on the row is the time the orchestrator wrote the State change, **not** the time the sub-agent observed the event. This keeps the column meaningful for staleness checks (CS44-2 / CS44-5b will define thresholds).

This protocol is what makes the State column trustworthy. Without disciplined event reporting from sub-agents and disciplined column updates from orchestrators, State drifts and becomes fiction.

### WORKBOARD Row Ownership & Stale-Lock Policy

This section defines who may edit which `WORKBOARD.md` rows and the timeouts that govern when a stalled row may be reclaimed. It builds on the per-row state vocabulary in § WORKBOARD State Machine and on the general row-ownership note in § WORKBOARD.md — Live Coordination; this section is the authoritative statement.

**A. Strict row ownership.** Orchestrators may **only** edit rows they own:

- Their own entry in the Orchestrators table.
- Active Work rows where they appear in the `Owner` column.

Orchestrators must **NOT**:

- Change another agent's status in the Orchestrators table (including marking another orchestrator offline or idle).
- Claim another agent's Active Work row.
- Remove another agent's Active Work row.
- Edit any column on another agent's Active Work row.

The single exception is the reclamation procedure in § C below.

Sub-agents do not edit `WORKBOARD.md` at all — they report state-change events to their orchestrator per the protocol in § WORKBOARD State Machine (point D, "Reporting protocol").

**B. Stale-lock thresholds.** Both thresholds are measured as time since the row's `Last Updated` timestamp (added to the schema by CS44-3):

| Threshold | Age | Meaning |
|---|---|---|
| `stale` | > **24 hours** | Row is flagged. Original owner remains authoritative; other orchestrators must not modify it. |
| `reclaimable` | > **7 days** | Original owner is presumed unavailable. Any orchestrator may take the row over via the reclamation procedure (§ C). |

These thresholds are enforced mechanically by the CS43-2 consistency checker — the threshold extension lands in CS44-5b (warning at 24h, error at 7d). Manual reclamation before the 7-day threshold is **not** permitted regardless of circumstance; if a row is genuinely blocked sooner, the owner sets State to `blocked` with a reason rather than allowing another agent to reclaim it.

**C. Reclamation procedure.** When a row reaches the `reclaimable` threshold, any orchestrator may take it over by performing **all** of the following:

1. **Edit the original row in place** (do not append a new row, do not delete and re-add):
   - Replace `Owner` with the reclaimer's agent ID.
   - Set `State` to `claimed` (if restarting from scratch) or `implementing` (if continuing where the prior owner left off).
   - Bump `Last Updated` to the current ISO 8601 UTC timestamp (per § WORKBOARD.md — Live Coordination, "Timestamps").
   - Add a brief note in `Blocked Reason` or `Next Action` referencing the prior owner — e.g. `reclaimed from yoga-gwn (stale > 7d)`.
2. **Announce the reclamation** by posting a comment on the related PR (if one exists) or otherwise on the related issue. Use the existing PR/issue commenting conventions in § Agent Progress Reporting. The comment must include:
   - Prior owner agent ID
   - Reclaimer agent ID
   - The reclaimer's plan (continue / restart / abandon)
3. Commit and push the row edit using the standard workboard commit format (§ WORKBOARD.md — Live Coordination, "Commit convention for workboard updates").

`git log` and `git blame` on `WORKBOARD.md` retain the full chain-of-custody history; the row itself reflects only the current state. Do not try to encode prior owners in the row beyond the brief note in step 1.

Any reclamation that does not follow this procedure — silently editing another agent's row before the 7-day threshold, reclaiming without an announcement comment, or appending a parallel row instead of editing in place — is a process violation.

**D. Forward references.**

- CS44-3 (schema upgrade) renames the current `Agent ID` column to `Owner` and adds the `Last Updated`, `Blocked Reason`, and `Next Action` columns. Until CS44-3 lands, treat references to `Owner` in this section as the existing `Agent ID` column, and treat the thresholds in § B and the reclamation procedure in § C as not yet mechanically enforceable.
- The CS43-2 consistency checker is extended in CS44-5b to emit a warning at 24h and an error at 7d against the `Last Updated` column.

### CONTEXT.md — Project State Updates

CONTEXT.md tracks clickstop summaries and current project state. Updates to CONTEXT.md **require PR review** because:
- It defines the project's roadmap and task dependencies
- Multiple agents reference it for planning decisions
- Errors in CONTEXT.md can cause agents to work on wrong tasks or miss dependencies

**When to update CONTEXT.md:**
- Clickstop status changes (planned → active → done)
- Task count changes (new tasks added, tasks completed)
- Codebase state section updates (new routes, test counts, workflows)
- Blocker/known issue changes

CONTEXT.md updates are typically bundled into the PR that completes the relevant task. Stand-alone CONTEXT.md updates (e.g., adding a new clickstop) go through their own PR. **Exception:** when committing a clickstop plan file directly to main, the CONTEXT.md summary row may be bundled in the same commit or deferred to the implementation PR.

### Clickstop File Lifecycle

Each clickstop gets a detail file with a status prefix. Each lifecycle state has its own subdirectory under `project/clickstops/`:

| Prefix | Location | Meaning | Example |
|--------|----------|---------|---------|
| `planned_` | `project/clickstops/planned/` | Defined but no tasks started | `planned_cs19_community-puzzle-navigation.md` |
| `active_` | `project/clickstops/active/` | Has work in progress | `active_cs11_database-migration.md` |
| `done_` | `project/clickstops/done/` | Fully complete | `done_cs10_cicd-pipeline.md` |

A status change is always a `git mv` between two of these sibling directories (e.g. `planned/planned_cs11_*.md` → `active/active_cs11_*.md`).

**File format:** Each file contains the clickstop title, status, goal, full task table (with CS-prefixed IDs), design decisions, and notes (parallelism, architecture details).

**Claiming a clickstop (step-by-step):**

1. Update WORKBOARD.md Active Work table — add your row with task ID, description, agent ID, worktree, branch. Commit and push immediately.
2. Create or update the CS file under the appropriate lifecycle subdirectory:
   - If the clickstop is new: create `project/clickstops/planned/planned_{cs-id}_{kebab-name}.md` with task table and design notes
   - If work is starting immediately: `git mv` from `planned/planned_*` to `active/active_*`, update Status field to 🔄 In Progress
3. Commit the CS file to main before dispatching any sub-agents (prevents untracked file conflicts on `git pull`)
4. Prompt user to rename session: `/rename [{agent-id}]-{task-id}: {clickstop name}`

**Closing a clickstop (step-by-step):**

1. Rename CS file from `active_` (or `planned_`) to `done_` and move from `project/clickstops/active/` (or `project/clickstops/planned/`) to `project/clickstops/done/` using `git mv`
2. Update the CS file content:
   - Status → ✅ Complete
   - All tasks marked ✅ Done in the task table
   - Add PR references (number + link) and merge dates
   - Fill in the completion checklist
3. Update CONTEXT.md: set status to ✅ Complete in the summary table, update task counts (e.g., 6/6), and update ALL archive links (both in the summary table and in the clickstop detail sections) to point to the `done_` file in `project/clickstops/done/`
4. Remove your row from WORKBOARD.md Active Work, commit and push immediately

**Important:** Steps 1-3 of closing are typically done in the implementation PR (bundled with the last code change). Step 4 (workboard update) is done by the orchestrator on main after merging.

CONTEXT.md always contains only a short summary (2-4 lines) per clickstop with a link to the detail file. Full task tables, design decisions, and architecture details live in the clickstop files.

Legacy archives from before CS0 may omit the completion checklist.

**CS number conflicts:** Before creating a new clickstop, check ALL existing files across the three lifecycle subdirectories — `project/clickstops/planned/`, `project/clickstops/active/`, and `project/clickstops/done/`. Pick the next unused number. Multiple agents creating clickstops concurrently can cause number collisions if they only check one prefix.
