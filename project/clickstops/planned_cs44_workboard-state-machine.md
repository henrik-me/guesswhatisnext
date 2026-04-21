# CS44 — WORKBOARD State Machine & Stale-Lock Handling

**Status:** ⬜ Planned
**Goal:** Make `WORKBOARD.md` faithfully represent the workflow state machine that `INSTRUCTIONS.md` already implies, and make stale work locks recoverable without owner-only manual intervention.

**Origin:** Identified by the local `review.md` operating-model review (findings 1, 3, 5). The current `WORKBOARD.md` schema (`Task ID | Clickstop | Description | Agent ID | Worktree | Branch | PR | Started`) cannot encode the state transitions the documented workflow requires (claimed → implementing → validating → pr_open → local_review → copilot_review → ready_to_merge → blocked). The board also has no way to distinguish active from stale work, no `Last Updated` column, and no defined recovery path when the owner session is unavailable. As an operations artifact today it is low-signal: it can answer "who claimed what" but not "what state is it in" or "is it still alive".

---

## Problem

Three coupled gaps:

1. **Schema thinness.** Current columns capture ownership but not state, last-update timestamp, or next action. Reviewers and orchestrators cannot tell whether a row is in flight, parked at review, or stalled.
2. **No state vocabulary.** `INSTRUCTIONS.md` describes state transitions in prose (start → milestone → validation → PR created → review round → ready to merge → blocked) but never names them as discrete states. There is no canonical list, no validation, no shared mental model across orchestrators.
3. **Manual stale-lock recovery only.** Locks persist until a human edits `WORKBOARD.md`. There is no timeout, no policy for who may release a stale lock, and no automated reclamation. Combined with owner-only ruleset bypass for direct-main commits, this creates a single operational choke point.

## Approach

Three changes, ordered by dependency:

1. **Define the state machine.** Add a canonical state vocabulary to `INSTRUCTIONS.md` with allowed transitions and ownership rules. This is the contract everything else depends on.
2. **Upgrade the WORKBOARD.md schema** to carry the state. Add `State`, `Last Updated`, `Next Action`, `Blocked Reason` columns. Migrate the (one) existing entry.
3. **Define and document stale-lock policy.** Threshold (e.g. 7 days no update → `stale` warning; 14 days → reclaim allowed). Who can release. How reclamation is announced.

Optional enhancement (decide during implementation): extend the consistency check from CS43-2 to validate state values against the canonical list and emit `stale` warnings against the threshold.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS44-1 | Define WORKBOARD state machine in INSTRUCTIONS.md | ⬜ Pending | Add a new subsection under § WORKBOARD.md — Live Coordination listing canonical states and allowed transitions. Recommended states (from review.md): `claimed`, `implementing`, `validating`, `pr_open`, `local_review`, `copilot_review`, `ready_to_merge`, `blocked`. Allowed transitions: linear forward, plus any → `blocked`, `blocked` → previous state. Document who sets each state (sub-agent vs orchestrator) and on which event. |
| CS44-2 | Define stale-lock policy in INSTRUCTIONS.md | ⬜ Pending | Add timeout thresholds (suggest: `Last Updated` > 7 days → mark `stale`, > 14 days → reclaim allowed by any orchestrator). Define how reclamation is announced (e.g. comment on the abandoned PR, note in the new WORKBOARD entry). Define what happens to the abandoned branch (kept for reference; sub-agent decides whether to cherry-pick). Make explicit that owner-only ruleset bypass is not required for stale-lock recovery — any orchestrator may reclaim past the threshold. |
| CS44-3 | Upgrade WORKBOARD.md schema | ⬜ Pending | Replace current Active Work columns with: `Task ID \| Clickstop \| State \| Owner \| Worktree \| Branch \| PR \| Last Updated \| Next Action \| Blocked Reason`. Restore the "Queued (ready, no dependencies blocking)" and "Recently Completed" sections that existed in earlier revisions. Update the "Orchestrators" table to include `Last Seen` and a clearer status vocabulary (e.g. `🟢 Active`, `🟡 Idle`, `⚪ Offline`). Migrate the existing CS42-1 entry to the new schema. |
| CS44-4 | Update INSTRUCTIONS.md workflow descriptions to reference state values | ⬜ Pending | Wherever the docs say "update WORKBOARD.md on milestone X", make it specific: "set State to `validating` after lint/test/e2e pass". The Agent Progress Reporting section is the primary target. The goal is to make state transitions mechanical rather than judgement calls. |
| CS44-5 | Extend consistency checker (CS43-2) with state-vocabulary and stale-lock validation | ⬜ Pending | **Depends on CS43-2 landing.** Add: (a) every Active Work `State` value must be one of the canonical states; (b) `Last Updated` must parse as ISO 8601; (c) emit warning when `Last Updated` is older than the stale threshold; (d) emit error when `Last Updated` is older than the reclaim threshold. Use the same `<!-- check:ignore -->` escape-hatch convention. |
| CS44-6 | Update issue #198 with CS44 completion summary | ⬜ Pending | Final task. Comment on [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) listing the workboard/operating-model items now fixed (state machine, stale-lock policy, schema upgrade, checker extension). Note that CS44 addresses review.md findings 1, 3, and 5. Do not close the issue — product/code findings remain. |

---

## Will not be done as part of this update

- **`.ops/workboard.json` machine-readable backing file with rendered Markdown** (review.md improvement 5). Considered as a way to make validation easier and prevent format drift. Rejected for now: introduces a JSON source-of-truth + a renderer + a CI step that would conflict with the simplicity goal of having Markdown be the authoritative human-editable format. The consistency checker (CS44-5) gives most of the validation benefit without the tooling cost. Revisit only if CS44-3's schema turns out to be too error-prone to maintain by hand.
- **Automated lock reclamation** (e.g. a bot that rewrites WORKBOARD.md after the threshold). Out of scope. CS44-2 only defines the *policy*; orchestrators apply it manually. Automation may be considered in a future clickstop if reclamation events become frequent enough to warrant it.
- **Notifications when a lock goes stale** (e.g. issue, slack, email). Out of scope. The consistency checker's CI warning is the only signal in v1.

---

## Design Considerations

- **The state machine must be consistent with how PRs already work.** `pr_open`, `local_review`, `copilot_review`, `ready_to_merge` map to observable PR/review events; `claimed`, `implementing`, `validating` map to pre-PR work. Don't invent states that don't correspond to something an orchestrator can observe.
- **`Next Action` is the single most useful column for orchestrators returning to the board after a break.** Resist the temptation to make it free-form prose; encourage short imperative phrases ("merge", "respond to review", "rebase", "blocked: waiting on X"). Listing examples in INSTRUCTIONS.md helps.
- **Stale thresholds should be generous.** Most "stale" entries are real work that the agent will return to after a meeting/lunch/sleep. A 7-day warn / 14-day reclaim window is conservative; tune later based on actual usage patterns.
- **Schema migration is tiny right now.** Only one Active Work row exists (CS42-1). Doing this clickstop sooner is cheaper than doing it later when the board is full.
- **Depends on CS43.** CS44-5 specifically requires CS43-2 (the consistency checker) to exist. CS44-1 through CS44-4 can ship before, after, or interleaved with CS43, but the natural order is to do CS43 first so the schema upgrade can be validated automatically from the start.

## Acceptance Criteria

- [ ] Canonical state list and allowed transitions are documented in `INSTRUCTIONS.md`.
- [ ] Stale-lock policy (thresholds, who may reclaim, how) is documented in `INSTRUCTIONS.md`.
- [ ] `WORKBOARD.md` uses the new schema; existing entries are migrated.
- [ ] Agent Progress Reporting section in `INSTRUCTIONS.md` references state transitions explicitly.
- [ ] Consistency checker validates state values and emits stale warnings (assuming CS43-2 has landed).
- [ ] No regression in `npm run check:docs`.
