# CS46 — Workboard Claim Discipline (Push-Success Gating)

**Status:** ⬜ Planned
**Goal:** Make explicit in INSTRUCTIONS.md that a WORKBOARD.md claim (or reclamation) is not effective until the push to `origin/main` succeeds, and that no task work may proceed until then. Add the missing push-rejected recovery procedure.

**Origin:** Surfaced 2026-04-21 while reclaiming CS42-1 (see WORKBOARD git log, commits `6f535a8` → `a330f70`). An orchestrator (`omni-gwn-c2`) committed a workboard claim locally, the push was rejected because another agent pushed to `main` in between, and — absent an explicit rule — it was unclear whether the claim was effective and whether downstream task work could continue. The user had to state the principle verbally ("do not move forward unless you can claim work"). The rule is partially present in INSTRUCTIONS.md but never stated as a gating principle.

---

## Problem

INSTRUCTIONS.md today contains three fragments that *almost* say the right thing but never stitch them together into an actionable gate:

1. § WORKBOARD.md — Live Coordination: *"The push is critical — a local-only commit provides zero coordination value to other agents. Always commit and push together."* — frames push as a coordination-hygiene point, not as a claim-validity gate.
2. Same section, "Conflict handling": covers `git pull` producing conflicts in `WORKBOARD.md` (resolve additively). Does **not** cover the more common `git push --rejected` flow.
3. Orchestrator Startup Checklist step 6: *"commit and push immediately"* — says when to push but not what to do if the push is rejected, and does not tie subsequent task work to push success.

§ WORKBOARD Row Ownership & Stale-Lock Policy point C (reclamation) ends at step 3 *"Commit and push the row edit..."* — does not require confirmation of push success, even though reclamation is the contested-turf case where push success matters most.

There is also no orchestrator-side analogue to the sub-agent `STATE:` reporting discipline: nothing that says "do not transition to 'exploring' / 'planning' / 'dispatching' until the workboard claim is on origin."

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS46-1 | Add "Claim effectiveness" gating principle to INSTRUCTIONS.md | ⬜ Pending | New subsection (or bold paragraph) under § WORKBOARD.md — Live Coordination stating: *"A claim or reclamation is not effective until the commit has been pushed to `origin/main`. No task work — exploration, planning, sub-agent dispatch — may proceed while the row exists only in the local checkout."* Cross-reference from § Orchestrator Startup Checklist step 6 and § WORKBOARD Row Ownership point C step 3. |
| CS46-2 | Add explicit push-rejected recovery procedure | ⬜ Pending | Walk through the `git push` → rejected → `git pull` (conflict in WORKBOARD.md only) → resolve additively → `git commit` (merge resolution) → `git push` → verify loop. Explicitly permit the merge resolution on main (already the exception per "Conflict handling"). State: if conflict spans any other file, abort and hand off to a worktree as today. |
| CS46-3 | Tighten § Row Ownership point C step 3 | ⬜ Pending | Replace *"Commit and push the row edit..."* with *"Commit and push the row edit; if the push is rejected, follow the push-rejected recovery procedure. Do not take any further action on the reclaimed task until the push has landed on `origin/main`."* |
| CS46-4 | Cross-link from Agent Progress Reporting | ⬜ Pending | Add a short note to § Agent Progress Reporting stating that orchestrator state transitions in the workboard (e.g. `claimed`) are also push-gated — sub-agents' `STATE:` discipline is only half the contract. |
| CS46-5 | Extend `check-docs-consistency.js` (optional, stretch) | ⬜ Pending | Evaluate whether a mechanical check is feasible — e.g. the script could warn when an agent has an Active Work row whose most recent commit is not present on `origin/main`. Likely low-value vs. effort; document decision either way. |

---

## Design Considerations

- **Docs-only clickstop.** Tasks CS46-1..4 touch only INSTRUCTIONS.md (and possibly a one-line README pointer). Per § Local Review Loop, docs-only PRs skip Copilot review but must still pass `npm run check:docs:strict`.
- **Scope discipline.** Do *not* rewrite the Conflict handling paragraph — extend it. Existing text is correct; the gap is that the principle isn't promoted to a gate and the push-rejected case isn't walked through.
- **Interaction with CS45 (INSTRUCTIONS structural split).** If CS45 lands first, the new subsection should live in whichever sub-document ends up owning workboard procedures. Coordinate with `omni-gwn` before starting implementation.
- **Not in scope:** sub-agent-side push discipline (sub-agents already operate in worktrees where push rejection is normal and handled per-branch), the state machine itself (CS44 is done), or any change to the 24h/7d stale thresholds.

## Acceptance Criteria

- A reader of INSTRUCTIONS.md can answer, without consulting other docs or a human, the question *"I committed a workboard update, my push was rejected — what do I do and when am I allowed to continue working on the task?"*
- The principle "claim is not effective until push lands on origin" appears as a named rule, not just as scattered hygiene advice.
- Existing `npm run check:docs:strict` still passes on the PR.
