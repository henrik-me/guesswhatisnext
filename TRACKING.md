# Tracking Lifecycle Procedures


This file contains the tracking-lifecycle procedures for orchestrators: clickstop file naming/location, `CONTEXT.md` update protocol, `WORKBOARD.md` update protocol (including the state machine and row-ownership/stale-lock policy), CS number conflict resolution, and deferred-task handling. For orchestrator workflow policy see `INSTRUCTIONS.md`; for code/test conventions see `CONVENTIONS.md`. For day-to-day workflow see `OPERATIONS.md`. For review procedures see `REVIEWS.md`.

## Clickstop & Task Management

**Clickstops** are the unit of deliverable work — each represents a feature, capability, or related set of changes. **Tasks** are the breakdown within a clickstop.

### Task IDs
Format: `CS<clickstop#>-<task#>` (e.g., `CS11-64`, `CS14-82`). Used in branch names, commit messages, PR titles, and WORKBOARD.md.

**CS number allocation:** Before assigning a new clickstop number, verify the number is not already taken by checking all three sources:
1. **Existing clickstop files:** `ls project/clickstops/planned/`, `ls project/clickstops/active/`, and `ls project/clickstops/done/` — check all `planned_`, `active_`, and `done_` files for the highest CS number
2. **WORKBOARD.md Active Work:** Another agent may have just claimed a CS number but not yet committed the plan file — check Active Work for any CS numbers in use

Use the next number after the highest found across both sources.If in doubt, use a higher number — gaps in CS numbering are harmless, collisions cause real problems.

### Task Statuses
- ⬜ Pending — not started, may have unmet dependencies
- 🔜 Ready — dependencies met, can be picked up
- 🔄 In Progress — claimed by an agent (see WORKBOARD.md)
- ✅ Done — merged to main
- 🚫 Blocked — explain why in Notes column

### Agent Identification
Every orchestrating agent has a unique ID: `{machine-short}-{repo-suffix}`
- **Machine short**: lowercase, first meaningful segment of hostname — skip user/owner prefix segments. Examples: `HENRIKM-YOGA` → `yoga`, `HENRIKM-OMNI` → `omni`.
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

**Plan-file frontmatter and parallel task IDs (CS64):**

CS plan task IDs encode dependency shape. Plain sequential numbers (`CS<N>-1`, `CS<N>-2`, `CS<N>-3`) are ordered phases; a later phase does not start until all work in the previous phase is done. Dash-letter IDs (`CS<N>-1a`, `CS<N>-1b`, `CS<N>-1c`) are parallel-safe siblings inside the same phase and may run concurrently.

| Task ID | Meaning |
|---------|---------|
| `CS65-1a` | Phase 1 sibling A; parallel-safe with the other `CS65-1*` tasks. |
| `CS65-1b` | Phase 1 sibling B; parallel-safe with the other `CS65-1*` tasks. |
| `CS65-2` | Sequential synchronization phase; starts only after all `CS65-1*` siblings are done. |

Every `planned_*.md` and `active_*.md` CS plan file must place these frontmatter lines between `**Status:**` and the first `##` heading:

```markdown
**Status:** ⬜ Planned
**Depends on:** CS64
**Parallel-safe with:** CS66, CS67

## Problem
```

Use `**Depends on:** none` when there is no hard predecessor, and `**Parallel-safe with:** any` when no known file-ownership conflict exists. `Depends on` is a hard pickup gate; `Parallel-safe with` is informational so orchestrators can fan out work without re-reading every prose section.

These CS planning conventions do not replace the existing ad-hoc `OPS-*` pattern for non-CS work; see [§ WORKBOARD.md — Live Coordination](#workboardmd--live-coordination) for the canonical placeholder row guidance.

Mechanical enforcement lands in CS65: the plan-file checks first land warn-only, then flip to errors after baseline cleanup, matching the CS62 / CS43-2 pattern.

### Clickstop Completion Checklist

Every clickstop must satisfy ALL of these before marking complete:
- [ ] All tasks done and merged (or deferred — see Deferred work policy below)
- [ ] README updated (if user-facing changes)
- [ ] INSTRUCTIONS.md updated (if architectural/workflow changes)
- [ ] Tests added/updated, coverage measured
- [ ] Performance/load test evaluation (if applicable)
- [ ] Data structure changes documented
- [ ] Staging deployed and verified
- [ ] Production deployed and verified (or N/A with documented reason)

Filled-in checklists are recorded in the clickstop's archive file upon completion.

**Deferred work policy.** Every deferred item must end up in a CS where it is discoverable as actionable work — never silently dropped, never left as a free-floating note in a done file or a chat message. A CS may only be marked complete once every deferred item has one of the four dispositions below recorded.

**The four allowed dispositions** (pick exactly one per deferred item):

1. **Add as a task to the current CS** — only if the work is actually doable in the current CS's scope (i.e., no new investigation needed, no waiting on external data, no separate review cycle that doesn't fit the current PR train). Recorded as a row in the current CS's task table with status, owner, and acceptance criteria. This is the simplest disposition and is preferred when it fits.
2. **File a new `planned_` CS** — claim the next free CS number immediately (via `ls project/clickstops/{planned,active,done}/` to find it), create `project/clickstops/planned/planned_csN_<kebab-name>.md` with at least the title, `⬜ Planned` status, origin (link back to the originating clickstop), and a one-paragraph problem statement. Direct-commit to `main`. The new CS may carry one item or many — folding multiple related deferrals into one CS is fine and often correct, especially when they share a decision dependency.
3. **Add as a task to an existing planned/active CS** — only when the deferred item is a clean scope-fit for that CS (i.e., a future maintainer reading that CS would expect to find this work there). Update the target CS's task table directly; cross-link from the originating CS. **Do not** retrofit work into a `done_` CS — done is done.
4. **Cancel** — record as a row in the current CS's task table with status `❌ Cancelled` and a one-line reason ("not worth the complexity", "subsumed by CSN-M", "evidence from production showed this is a non-issue", etc.). Cancellation is a valid disposition and is preferable to filing speculative work.

**Insufficient — DO NOT do this:**

- Burying the deferred item in a `## Deferred Work Evaluation` appendix in a `done_` CS file as the *only* tracking mechanism. Appendices are fine as a *design record* that a CS task reads from, but the live status of the work must live in a CS file that's discoverable from `project/clickstops/{planned,active}/` browse. **Pattern that is OK:** an appendix in the done CS that documents the qualitative analysis (options, trade-offs, recommendation), paired with a `planned_` CS whose task table cross-links back to the appendix as the design record. **Pattern that is NOT OK:** the appendix alone, with no corresponding CS file.
- Leaving the item as a TODO in code, a comment in a PR description, or a line item in a chat transcript. None of those surface in the planned/ browse that future orchestrators use to pick up work.

**Decision flow at close-out time:** for each deferred item, ask in order: (a) Can I do it in the current CS now? → Disposition 1. (b) Is there an existing CS this fits cleanly into? → Disposition 3. (c) Is it concrete enough to file a CS for? → Disposition 2. (d) None of the above? → Disposition 4 (cancel with reason). If you can't answer (a)-(c) yes and won't commit to (d), the CS is not ready to close.

**Examples in this repo:**

- [CS54](project/clickstops/done/done_cs54_enable-app-insights-in-prod.md) closed with deferred observability gaps. The qualitative analysis lived in a `## CS54-9 Deferred Work Evaluation` appendix; the live tracking went into [CS60](project/clickstops/active/active_cs60_post-cs54-observability-followup.md) (Disposition 2, single CS folding multiple items). CS54's appendix cross-links forward to CS60; CS60's tasks cross-link backward to the appendix. This is the pattern.
- A simpler case where Disposition 1 (just do it in this CS) or Disposition 4 (cancel with reason) would have been preferred is when the deferred item is a one-line documentation fix or a clearly-out-of-scope concern that won't ever justify its own CS.

### WORKBOARD.md — Live Coordination

WORKBOARD.md is the real-time coordination file for multi-agent work. It tracks who is working on what, right now.

**Direct commit on main (no PR required):**
Unlike most project files, WORKBOARD.md is updated by orchestrating agents directly on main via commit + push. **The push is critical** — a local-only commit provides zero coordination value to other agents. Always commit and push together (see the multi-line commit format with `Agent:` trailer in § Commit Convention for workboard updates below). This enables fast task assignment without PR review overhead. Clickstop plan files are the other direct-on-main exception (see § Clickstop File Lifecycle). The workboard must be updated immediately when:
- An orchestrator claims a task (add to Active Work)
- An orchestrator starts any work — including non-clickstop tasks (ad-hoc requests, deployments, investigations). Use a non-empty `CS-Task ID` placeholder (e.g. `OPS-DEPLOY-2026-04-27`) for non-CS work — the docs-consistency parser treats a blank `CS-Task ID` cell as a description-continuation row, so non-CS status rows must carry some non-empty token. See § WORKBOARD entry template below for the canonical shape.
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

**Claim effectiveness:** A claim or reclamation is **not effective** until the commit has been pushed to `origin/main`. No task work — exploration, planning, sub-agent dispatch, or any downstream orchestrator state transition — may proceed while the row exists only in the local checkout. If `git push` is rejected, follow the push-rejected recovery procedure in "Conflict handling" below and only resume task work once the row has landed on `origin/main`. This rule applies equally to initial claims (§ Orchestrator Startup Checklist in OPERATIONS.md, the WORKBOARD registration item) and to reclamation (§ WORKBOARD Row Ownership & Stale-Lock Policy, point C step 3).

**Conflict handling:** Since multiple orchestrators may update WORKBOARD.md concurrently, conflicts are possible. Orchestrators should `git pull` before updating. If a conflict occurs **only in `WORKBOARD.md`**, this is the one exception to the general "do not resolve merge conflicts in the main checkout" rule: resolve it by keeping both agents' entries (additive merge), then complete the workboard-only update. If the pull produces conflicts in any other file, abort the merge and follow the normal abort + worktree workflow instead.

**Push-rejected recovery procedure.** The common failure mode is not a `git pull` conflict but a rejected push — another agent pushed to `main` between your last fetch and your push. Recovery steps (do not skip any; claim is not effective until step 4 succeeds — see "Claim effectiveness" above):

1. `git push origin main` → rejected (non-fast-forward).
2. `git pull --rebase origin main`. If a conflict appears **only in `WORKBOARD.md`**, resolve it additively (keep both agents' rows where appropriate), per the `WORKBOARD.md`-only exception above. If the conflict spans any other file, abort (`git rebase --abort`) and hand off to a worktree per the normal branch workflow — do not attempt to resolve non-workboard conflicts on main.
3. `git commit` the merge resolution. This is permitted on main because it falls under the same `WORKBOARD.md`-only exception already carved out for the direct-on-main workboard discipline.
4. `git push origin main` again; verify it lands on `origin/main` (e.g. `git log --oneline origin/main -1` matches your local HEAD).
5. **Only now** may you transition to the next action for that task (begin exploration, dispatch a sub-agent, update the State column, etc.).

**Public repository note:** When branch protection is enabled with required reviews, the repository owner (henrik-me) uses a repository ruleset bypass to allow direct WORKBOARD.md and clickstop plan file pushes. This bypass is configured in Settings → Rules → Rulesets and applies only to the owner role. Non-owner orchestrating agents (if any) would need to use PR-based updates instead.

#### WORKBOARD entry template

Every Active Work entry is **two markdown rows**: a status row, then a description-continuation row whose `CS-Task ID` cell is blank. The blank `CS-Task ID` is the docs-consistency parser's skip-marker — per-row checks (state vocabulary, ISO 8601 `Last Updated`, owner-in-orchestrators, freshness) are only applied to status rows.

```markdown
| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CSnn-mm | **Bold human title (matches parent CS file H1)**<br>WT: `C:\path\to\worktree`<br>B:&nbsp; `branch-name` | implementing | yoga-gwn-cN | 2026-04-27T02:10Z | — |
|  | _Italic free-form prose. Use markdown links for PRs: [#NNN](https://github.com/henrik-me/guesswhatisnext/pull/NNN). Escape any literal pipe in prose as `\|`. Inline `code` is fine. The leading `CS-Task ID` cell MUST be blank — that is what tells the docs-consistency checker this is a description-continuation row._ |  |  |  |  |
```

Conventions:

- **Title cell, line 1:** bolded human title with **no** `CSnn —` prefix. It must equal the parent CS file's H1 human title exactly. The CS file's H1 lives at `project/clickstops/{planned,active,done}/{state}_cs<n>_<slug>.md` and follows the form `# CSnn — Human Title` (em-dash U+2014, not `-` or `--`). The warn-only rule `workboard-title-matches-h1` enforces this; the warn-only rule `clickstop-h1-matches-filename` enforces the `kebab-case(human title) === <slug>` invariant on the file itself.
  - **Anti-pattern: appending sub-task scope suffixes to the WORKBOARD title** (e.g. `**Post CS54 Observability Followup — daily cost-watch backfill**` when the row is for one specific backfill PR within a long-running CS). Doing so fails `workboard-title-matches-h1`, and the cheapest-looking "fix" — editing the CS file's H1 to match — corrupts the canonical CS title and breaks every other PR/agent that relies on it. **Hit on 2026-04-30**: CS60 row title was extended for a CS60-1c/2c/2d backfill scope, the dispatched sub-agent then "fixed" the lint by appending the same suffix to the CS60 plan-file H1, and the resulting H1 mismatch blocked an unrelated open PR ([#319 CS68-1](https://github.com/henrik-me/guesswhatisnext/pull/319)) until both edits were reverted in commit `ca58920`. **Rule:** keep the title cell verbatim from the H1; put sub-task scope (which Days, which sub-IDs) in the description-continuation row's italic prose or in the `CS-Task ID` cell (e.g. `CS60-1c/2c/2d`).
- **Title cell, lines 2-3:** ``WT: `worktree-path` `` (line 2) and ``B:&nbsp; `branch-name` `` (line 3), separated by `<br>`. The `&nbsp;` keeps the `B:` and `WT:` labels visually aligned in rendered markdown.
- **Renaming a CS file → must update the H1**, and vice versa. The two warn-only rules will flag drift on the next `npm run check:docs` run.
- **Description row prose:** wrap in `_…_` italics. Preserve PR refs as inline markdown links rather than the legacy `PR: #NNN` column. Keep prose terse — the description row is a narrative, not a status field.
- **Non-CS work** (ad-hoc requests, deployments, investigations not tied to a clickstop): use a placeholder `CS-Task ID` such as `OPS-DEPLOY-2026-04-27` so the cell is non-empty (otherwise the parser will treat the status row as a description-continuation row and skip it). Placeholders that do not start with `CS\d+` short-circuit the `workboard-title-matches-h1` rule cleanly. If you do start a placeholder with `CS\d+` for a CS that has no clickstop file yet, that rule will warn until the file lands — author the clickstop plan file first.
- **State column:** must be one of the canonical states defined in § WORKBOARD State Machine below.
- **Last Updated:** ISO 8601 UTC with `Z` suffix (e.g. `2026-04-27T02:10Z`); seconds are optional. Bump on every edit, including reclamation.
- **Blocked Reason:** populate **only** when `State == blocked`; use `—` otherwise.

### WORKBOARD State Machine

This section defines the canonical vocabulary for the lifecycle of an Active Work row. The `State` column lives in `WORKBOARD.md`. The sub-agent → orchestrator reporting protocol that drives this column is described in § Agent Progress Reporting and the dispatch checklist in § Agent Work Model ("Sub-agent dispatch checklist").

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
| `blocked` | Work cannot proceed; reason recorded in the Blocked Reason column. **Also covers scheduled-pause / between-tick waits** for long-running CS work (e.g. daily cost-watch ticks, soak windows, +Nd re-checks) — record the next-tick trigger in Blocked Reason (e.g. `Awaiting next daily cost-watch tick — CS60-2e (Day 5 = 2026-04-30, earliest pickup ~2026-05-01T01:00Z UTC once Cost Management closes the day)`). Do **not** invent additional states like `waiting` or `idle`; the `state-in-vocabulary` strict rule will reject them. |

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

**B. Stale-lock thresholds.** Both thresholds are measured as time since the row's `Last Updated` timestamp:

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
3. Commit and push the row edit using the standard workboard commit format (§ WORKBOARD.md — Live Coordination, "Commit convention for workboard updates"); if the push is rejected, follow the push-rejected recovery procedure (§ WORKBOARD.md — Live Coordination, "Push-rejected recovery procedure"). **Do not take any further action on the reclaimed task until the push has landed on `origin/main`** (see § WORKBOARD.md — Live Coordination, "Claim effectiveness").

`git log` and `git blame` on `WORKBOARD.md` retain the full chain-of-custody history; the row itself reflects only the current state. Do not try to encode prior owners in the row beyond the brief note in step 1.

Any reclamation that does not follow this procedure — silently editing another agent's row before the 7-day threshold, reclaiming without an announcement comment, or appending a parallel row instead of editing in place — is a process violation.

**D. Forward references.**

- The CS43-2 consistency checker is extended in CS44-5b to emit a warning at 24h and an error at 7d against the `Last Updated` column.

### CONTEXT.md — Project State Updates

CONTEXT.md no longer carries a per-clickstop summary table; clickstop status lives in the filesystem under `project/clickstops/{active,planned,done}/`. CONTEXT.md is reserved for codebase architecture and blockers, and only changes when those change. CONTEXT.md changes still go through PR review since it remains a shared planning doc.

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
3. Remove your row from WORKBOARD.md Active Work, commit and push immediately

**Important:** Steps 1-2 of closing are typically done in the implementation PR (bundled with the last code change). Step 3 (workboard update) is done by the orchestrator on main after merging.

Legacy archives from before CS0 may omit the completion checklist.

**CS number conflicts:** Before creating a new clickstop, check ALL existing files across the three lifecycle subdirectories — `project/clickstops/planned/`, `project/clickstops/active/`, and `project/clickstops/done/`. Pick the next unused number. Multiple agents creating clickstops concurrently can cause number collisions if they only check one prefix.
