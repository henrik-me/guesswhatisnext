# CS46 — Workboard Claim Discipline (Push-Success Gating)

**Status:** 🔄 Active
**Linked PR:** #220 (CS46-1..4)
**Goal:** Make explicit in TRACKING.md that a WORKBOARD.md claim (or reclamation) is not effective until the push to `origin/main` succeeds, and that no task work may proceed until then. Add the missing push-rejected recovery procedure.

**Origin:** Surfaced 2026-04-21 while reclaiming CS42-1 (see WORKBOARD git log, commits `6f535a8` → `a330f70`). An orchestrator (`omni-gwn-c2`) committed a workboard claim locally, the push was rejected because another agent pushed to `main` in between, and — absent an explicit rule — it was unclear whether the claim was effective and whether downstream task work could continue. The user had to state the principle verbally ("do not move forward unless you can claim work"). The rule is partially present in the workboard procedures (TRACKING.md) but never stated as a gating principle.

---

## Problem

INSTRUCTIONS.md today contains three fragments that *almost* say the right thing but never stitch them together into an actionable gate (post-CS45 split: the workboard procedures now live in `TRACKING.md` and the orchestrator checklist in `OPERATIONS.md`):

1. TRACKING.md § WORKBOARD.md — Live Coordination: *"The push is critical — a local-only commit provides zero coordination value to other agents. Always commit and push together."* — frames push as a coordination-hygiene point, not as a claim-validity gate.
2. Same section, "Conflict handling": covers `git pull` producing conflicts in `WORKBOARD.md` (resolve additively). Does **not** cover the more common `git push --rejected` flow.
3. OPERATIONS.md Orchestrator Startup Checklist step 6: *"commit and push immediately"* — says when to push but not what to do if the push is rejected, and does not tie subsequent task work to push success.

TRACKING.md § WORKBOARD Row Ownership & Stale-Lock Policy point C (reclamation) ends at step 3 *"Commit and push the row edit..."* — does not require confirmation of push success, even though reclamation is the contested-turf case where push success matters most.

There is also no orchestrator-side analogue to the sub-agent `STATE:` reporting discipline: nothing that says "do not transition to 'exploring' / 'planning' / 'dispatching' until the workboard claim is on origin."

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS46-1 | Add "Claim effectiveness" gating principle to TRACKING.md | ✅ Done | New subsection (or bold paragraph) under TRACKING.md § WORKBOARD.md — Live Coordination stating: *"A claim or reclamation is not effective until the commit has been pushed to `origin/main`. No task work — exploration, planning, sub-agent dispatch — may proceed while the row exists only in the local checkout."* Cross-reference from OPERATIONS.md Orchestrator Startup Checklist step 6 and TRACKING.md § WORKBOARD Row Ownership point C step 3. |
| CS46-2 | Add explicit push-rejected recovery procedure | ✅ Done | Walk through the `git push` → rejected → `git pull` (conflict in WORKBOARD.md only) → resolve additively → `git commit` (merge resolution) → `git push` → verify loop. Explicitly permit the merge resolution on main (already the exception per "Conflict handling"). State: if conflict spans any other file, abort and hand off to a worktree as today. |
| CS46-3 | Tighten TRACKING.md § Row Ownership point C step 3 | ✅ Done | Replace *"Commit and push the row edit..."* with *"Commit and push the row edit; if the push is rejected, follow the push-rejected recovery procedure. Do not take any further action on the reclaimed task until the push has landed on `origin/main`."* |
| CS46-4 | Cross-link from Agent Progress Reporting | ✅ Done | Add a short note to OPERATIONS.md § Agent Progress Reporting stating that orchestrator state transitions in the workboard (e.g. `claimed`) are also push-gated — sub-agents' `STATE:` discipline is only half the contract. |
| CS46-5 | Extend `check-docs-consistency.js` (optional, stretch) | ⬜ Pending (deferred — see Decisions) | Evaluate whether a mechanical check is feasible — e.g. the script could warn when an agent has an Active Work row whose most recent commit is not present on `origin/main`. Likely low-value vs. effort; document decision either way. |

---

## Design Considerations

- **Docs-only clickstop.** Tasks CS46-1..4 touch only TRACKING.md / OPERATIONS.md (and possibly a one-line README pointer). Per REVIEWS.md § Local Review Loop, docs-only PRs skip Copilot review but must still pass `npm run check:docs:strict`.
- **Scope discipline.** Do *not* rewrite the Conflict handling paragraph — extend it. Existing text is correct; the gap is that the principle isn't promoted to a gate and the push-rejected case isn't walked through.
- **Interaction with CS45 (INSTRUCTIONS structural split).** CS45 landed before CS46 starts, so workboard procedures now live in `TRACKING.md` and orchestrator workflow in `OPERATIONS.md`. Section references above have been updated accordingly.
- **Not in scope:** sub-agent-side push discipline (sub-agents already operate in worktrees where push rejection is normal and handled per-branch), the state machine itself (CS44 is done), or any change to the 24h/7d stale thresholds.

## Acceptance Criteria

- A reader of TRACKING.md / OPERATIONS.md can answer, without consulting other docs or a human, the question *"I committed a workboard update, my push was rejected — what do I do and when am I allowed to continue working on the task?"*
- The principle "claim is not effective until push lands on origin" appears as a named rule, not just as scattered hygiene advice.
- Existing `npm run check:docs:strict` still passes on the PR.

## Decisions

- **CS46-5 (consistency-checker push-sync warning) evaluated and deferred — low value vs. effort.** The strict checker already catches stale rows via `active-row-stale` (warn >24h, reclaim >7d), which is the signal that actually matters for stuck orchestrators. A dedicated push-sync rule would have to fetch `origin/main` and correlate per-row commits — a meaningful amount of new logic — to flag a window (local-committed but not pushed) that is almost always seconds long in practice. The named "Claim effectiveness" rule added in CS46-1 plus the push-rejected recovery procedure in CS46-2 address the documentation gap that actually burned us on 2026-04-21; a mechanical check would duplicate an existing signal without materially improving agent experience. Revisit if this becomes a recurring pain point.
