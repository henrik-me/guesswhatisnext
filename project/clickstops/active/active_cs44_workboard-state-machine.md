# CS44 — WORKBOARD State Machine & Stale-Lock Handling

**Status:** 🔄 In Progress
**Goal:** Make `WORKBOARD.md` faithfully represent the workflow state machine that `INSTRUCTIONS.md` already implies, and make stale work locks recoverable without owner-only manual intervention.

**Origin:** Identified by the local `review.md` operating-model review (findings 1, 3, 5). The current `WORKBOARD.md` schema (`Task ID | Clickstop | Description | Agent ID | Worktree | Branch | PR | Started`) cannot encode the state transitions the documented workflow requires (claimed → implementing → validating → pr_open → local_review → copilot_review → ready_to_merge → blocked). The board also has no way to distinguish active from stale work, no `Last Updated` column, and no defined recovery path when the owner session is unavailable. As an operations artifact today it is low-signal: it can answer "who claimed what" but not "what state is it in" or "is it still alive".

---

## Problem

Three coupled gaps:

1. **Schema thinness.** Current columns capture ownership but not state, last-update timestamp, or next action. Reviewers and orchestrators cannot tell whether a row is in flight, parked at review, or stalled.
2. **No state vocabulary.** `INSTRUCTIONS.md` describes state transitions in prose (start → milestone → validation → PR created → review round → ready to merge → blocked) but never names them as discrete states. There is no canonical list, no validation, no shared mental model across orchestrators.
3. **Manual stale-lock recovery only.** Locks persist until a human edits `WORKBOARD.md`. There is no timeout, no policy for who may release a stale lock, and no automated reclamation. Combined with owner-only ruleset bypass for direct-main commits, this creates a single operational choke point.

## Approach

Four changes, ordered by dependency:

1. **Define the state machine.** Add a canonical state vocabulary to `INSTRUCTIONS.md` with allowed transitions, sub-agent → orchestrator reporting protocol (sub-agents report events, orchestrator alone updates State), and event → state mapping. Contract that everything else depends on.
2. **Define stale-lock + row-ownership policy.** Strict ownership default (only edit your own rows). Stale at **24 hours** since `Last Updated` (warning). Reclaimable at **7 days** (any orchestrator may take over by editing the original row in place + announcing on the related PR/issue).
3. **Upgrade the WORKBOARD.md schema** to carry State + supporting columns. Single Active Work table — no Queued or Recently Completed sections. Migrate the (one) existing entry.
4. **Extend the CS43-2 consistency checker** with state-vocabulary validation (CS44-5a) and threshold validation (CS44-5b). These two extensions can ship in parallel.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS44-1 | Define WORKBOARD state machine in INSTRUCTIONS.md | ✅ Done | Add a new subsection under § WORKBOARD.md — Live Coordination listing canonical states and allowed transitions. States: `claimed`, `implementing`, `validating`, `pr_open`, `local_review`, `copilot_review`, `ready_to_merge`, `blocked`.Allowed transitions: linear forward, plus any → `blocked`, `blocked` → previous state. **Sub-agent → orchestrator reporting protocol:** sub-agents report milestone events back to the orchestrator (via final report or interim ping) — orchestrator alone updates the State column. Document the event → state mapping (e.g. "lint+tests pass" → `validating`, "PR opened" → `pr_open`, "Copilot review approved" → `ready_to_merge`). Sub-agent task prompts must explicitly instruct the agent to report each state-change event. Landed in PR [#207](https://github.com/henrik-me/guesswhatisnext/pull/207). |
| CS44-2 | Define stale-lock policy + row-ownership rule in INSTRUCTIONS.md | ⬜ Pending | Two related rules. **Row ownership (strict):** orchestrators may ONLY edit their own rows in WORKBOARD.md (their entry in the Orchestrators table + Active Work rows they own). They must NOT change another agent's status (including marking offline), claim another agent's work item, or remove another agent's row, **except** under the reclamation procedure below. **Stale-lock policy:** thresholds are time-since-`Last Updated`. > **24 hours** → `stale` (warning, original owner still authoritative). > **7 days** → `reclaimable` (any orchestrator may take over). **Reclamation procedure:** the reclaimer edits the original row in place — replaces Owner with their own ID, sets State appropriately (`claimed` if restarting, `implementing` if continuing), and bumps `Last Updated`. Reclamation must be announced via a comment on the related PR/issue and a brief note in the row's Blocked Reason or Next Action column referencing the prior owner. The CS44-5 checker enforces the thresholds; manual reclamation before 7 days is not permitted. |
| CS44-3 | Upgrade WORKBOARD.md schema | ⬜ Pending | Replace current Active Work columns with: `Task ID \| Clickstop \| State \| Owner \| Worktree \| Branch \| PR \| Last Updated \| Next Action \| Blocked Reason`. **Single Active Work table only — do NOT add Queued or Recently Completed sections** (queue lives in clickstop task tables; completion is visible via `git log` on `project/clickstops/done/`). Update the "Orchestrators" table to include `Last Seen` and a clearer status vocabulary (e.g. `🟢 Active`, `🟡 Idle`, `⚪ Offline`). Migrate the existing CS42-1 entry to the new schema. `Next Action` is free-form prose for now — flagged for re-evaluation in a future clickstop because it may be redundant with State. |
| CS44-4 | Update INSTRUCTIONS.md workflow descriptions to reference state values | ⬜ Pending | Wherever the docs say "update WORKBOARD.md on milestone X", make it specific: "sub-agent reports `validating` to orchestrator after lint/test/e2e pass; orchestrator updates State." The Agent Progress Reporting section is the primary target. Also update the standard sub-agent prompt template (or example prompts in INSTRUCTIONS.md) so dispatched agents know they must report state transitions back. The goal is to make state transitions mechanical rather than judgement calls. |
| CS44-5a | Extend consistency checker with state-vocabulary validation | ✅ Done | **Depends on CS43-2 (landed) + CS44-1 vocab.** Add checker rules: (a) every Active Work `State` value must be one of the canonical states; (b) `Last Updated` must parse as ISO 8601; (c) `Owner` must appear in the Orchestrators table. Use the same `<!-- check:ignore -->` escape-hatch convention. **Can run in parallel with CS44-5b.** Landed in PR <!-- pr-link --> with conditional activation: rules are silent until CS44-3 adds the new columns. |
| CS44-5b | Extend consistency checker with stale/reclaimable threshold validation | ⬜ Pending | **Depends on CS43-2 (landed) + CS44-2 thresholds.** Add checker rules: emit warning when `Last Updated` is older than 24 hours (`stale`); emit error when older than 7 days (`reclaimable`). Thresholds are constants at the top of the checker. **Can run in parallel with CS44-5a.** |
| CS44-6 | Update issue #198 with CS44 completion summary | ⬜ Pending | Final task. Comment on [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) listing the workboard/operating-model items now fixed (state machine, stale-lock policy, schema upgrade, checker extension). Note that CS44 addresses review.md findings 1, 3, and 5. **Note on completion history:** rather than restoring a "Recently Completed" section to WORKBOARD.md, point readers at `git log --diff-filter=A -- project/clickstops/done/` (file-creation events on the `done/` folder) for chronological CS completion history. Do not close the issue — product/code findings remain. |

---

## Will not be done as part of this update

- **`.ops/workboard.json` machine-readable backing file with rendered Markdown** (review.md improvement 5). Considered as a way to make validation easier and prevent format drift. Rejected for now: introduces a JSON source-of-truth + a renderer + a CI step that would conflict with the simplicity goal of having Markdown be the authoritative human-editable format. The consistency checker (CS44-5a/5b) gives most of the validation benefit without the tooling cost. Revisit only if CS44-3's schema turns out to be too error-prone to maintain by hand.
- **Queued and Recently Completed sections on WORKBOARD.md.** Explicitly omitted. Queue lives in clickstop task tables (the source of truth for what comes next per CS); completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`. Adding either section would be restatement (violates the CS43-1 link-don't-restate principle) and require manual upkeep.
- **Automated lock reclamation** (e.g. a bot that rewrites WORKBOARD.md after the threshold). Out of scope. CS44-2 only defines the *policy*; orchestrators apply it manually. Automation may be considered in a future clickstop if reclamation events become frequent enough to warrant it.
- **Notifications when a lock goes stale** (e.g. issue, slack, email). Out of scope. The consistency checker's CI warning is the only signal in v1.

---

## Design Considerations

- **The state machine must be consistent with how PRs already work.** `pr_open`, `local_review`, `copilot_review`, `ready_to_merge` map to observable PR/review events; `claimed`, `implementing`, `validating` map to pre-PR work. Don't invent states that don't correspond to something an orchestrator can observe.
- **Sub-agent → orchestrator reporting is the linchpin.** Without disciplined event reporting from sub-agents, the State column is fiction. CS44-1 must spell out the protocol; CS44-4 must propagate it into the standard sub-agent prompt template.
- **`Next Action` may be redundant with State.** Kept free-form for v1 because we want to learn before constraining the format. Flag for re-evaluation: if the column ends up being a verbose restatement of State (e.g. State=`copilot_review`, Next Action="wait for copilot review"), drop the column in a follow-up.
- **Stale thresholds chosen aggressively.** 24 hours / 7 days reflects this project's actual cadence (multiple touches per day). Tune later if reclamation events are too frequent or too rare.
- **Reclamation edits the original row in place.** Trade-off: simpler schema, but loses chain-of-custody in the file itself. Mitigated by requiring an announcement comment on the related PR/issue and a Blocked Reason / Next Action note referencing the prior owner. `git log` + `git blame` retain full history.
- **Schema migration is tiny right now.** Only one Active Work row exists (CS42-1). Doing this clickstop sooner is cheaper than doing it later when the board is full.
- **CS44-5a and CS44-5b are deliberately split** so they can ship in parallel and so vocabulary validation can land even if threshold tuning needs more iteration.
- **Depends on CS43.** CS44-5a/5b specifically require CS43-2 (✅ landed) and the strict `--strict` gate from CS43-7 (✅ landed). CS44-1 through CS44-4 have no CS43 dependency.

## Acceptance Criteria

- [ ] Canonical state list and allowed transitions are documented in `INSTRUCTIONS.md`.
- [ ] Sub-agent → orchestrator state-reporting protocol is documented in `INSTRUCTIONS.md` and reflected in the standard sub-agent prompt template.
- [ ] Stale-lock policy (24h stale / 7d reclaimable, in-place edit + announcement) is documented in `INSTRUCTIONS.md`.
- [ ] `WORKBOARD.md` uses the new schema with no Queued or Recently Completed sections; existing CS42-1 entry is migrated.
- [ ] Agent Progress Reporting section in `INSTRUCTIONS.md` references state transitions explicitly.
- [ ] Consistency checker validates state values, ISO 8601 timestamps, and Owner-in-Orchestrators-table (CS44-5a).
- [ ] Consistency checker emits stale warning at 24h and reclaimable error at 7d (CS44-5b).
- [ ] No regression in `npm run check:docs`.

