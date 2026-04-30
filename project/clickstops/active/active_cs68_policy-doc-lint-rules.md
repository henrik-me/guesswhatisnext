# CS68 — Policy Doc Lint Rules

**Status:** 🔄 In Progress
**Substatus:** CS68-1 merged; CS68-2 awaiting soak window (see Earliest claim date below)
**Owner:** unassigned (CS68-1 was completed by yoga-gwn; CS68-2 is open for any orchestrator to claim)
**Earliest claim date (CS68-2):** **2026-05-07** (7 days after CS68-1 merged on 2026-04-30T03:29Z). Claiming earlier defeats the soak intent — see [§ CS68-2 Pickup Instructions](#cs68-2--pickup-instructions) for the three reasons.
**Depends on:** CS68-1 (merged in [PR #319](https://github.com/henrik-me/guesswhatisnext/pull/319), squash `d04286b`, 2026-04-30T03:29Z) + ≥1 week soak window
**Parallel-safe with:** CS47, CS55, CS56, CS57, CS59, CS63, CS69 (any CS not touching `scripts/check-docs-consistency.js`); rebase coordination required if CS65 follow-ups, CS66, CS67, or another rule-adding PR is open simultaneously since they share the same surface file
**Open sub-tasks:** **CS68-2 only** — warn → error flip for `brittle-step-reference` in `--strict` mode. See [§ CS68-2 Pickup Instructions](#cs68-2--pickup-instructions) and the Tasks table below.
**Claim history:** CS68-1 claimed 2026-04-30T02:47Z by yoga-gwn; merged 2026-04-30T03:29Z.
**Origin:** PR #311 (`OPS-checklist-session-start`, merged 2026-04-29) local-review round 2 caught a brittle `step 6` cross-doc reference in `TRACKING.md § Claim effectiveness` that pointed at `OPERATIONS.md § Orchestrator Startup Checklist` step 6 — but that step had just been renumbered (5 → removed, 6 → 5, 7 → 6) in the same PR. The bug shipped because nothing flagged it; it was caught only by a careful gpt-5.5 reviewer. The general pattern — "step N" cross-doc references silently rotting when the target doc renumbers — is lintable.

## Problem

Today, when a live policy doc (INSTRUCTIONS.md, OPERATIONS.md, TRACKING.md, REVIEWS.md) refers to a numbered list item in another live policy doc by step number — e.g. "see OPERATIONS.md § Orchestrator Startup Checklist step 6" — the reference becomes stale the moment the target doc's list is renumbered. Nothing in `npm run check:docs` catches this; it only surfaces if a reader follows the link, counts steps, and notices the mismatch.

PR #311 demonstrated this concretely: `TRACKING.md § Claim effectiveness` referenced `OPERATIONS.md § Orchestrator Startup Checklist` "step 6" while PR #311 was renumbering that very list. The reviewer (`code-review` agent + gpt-5.5, round 2) caught it. The fix the sub-agent applied was to refer by **description** instead of step number — a robust pattern that should be the default.

CS65's plan-file-schema rules are orthogonal — they enforce that planned/active CS files have the right frontmatter and section structure. CS68's rules enforce that live **policy docs** don't carry brittle cross-doc step references.

## Goals

1. Add a `brittle-step-reference` rule (warn-only) to `scripts/check-docs-consistency.js`.
2. Audit the live policy doc set so the rule lands clean (no spurious warnings on first run).
3. Document the pattern in `CONVENTIONS.md § Documentation Conventions` so authors prefer descriptive cross-doc references over step numbers.
4. Land warn-only first; flip to error in a future follow-up CS once the baseline is stable for ≥1 week (CS43-2 / CS43-7 / CS62 pattern).

## Scope

- **In scope (rule fires here):** INSTRUCTIONS.md, OPERATIONS.md, TRACKING.md, REVIEWS.md, README.md, CONTEXT.md, WORKBOARD.md, LEARNINGS.md, and any other top-level live policy `.md` file.
- **Out of scope (rule skips):** `project/clickstops/{planned,active,done}/` — clickstop files are append-only history that may legitimately reference old step numbers from a prior version of policy docs (e.g. `done_cs46_*.md:17` references the pre-CS46 OPERATIONS.md step 6). Forcing them to update would be revisionist.
- **Same-file step references skipped:** `step \d+` inside the same file (e.g. "see step 3 above") is a normal procedural reference, not a brittle cross-doc one.

## Heuristic

For each live policy doc, scan for `\bstep\s+\d+\b` (case-insensitive). For each match, look for a markdown link (the standard `text-in-brackets` followed by `target-in-parens` form, with optional `#anchor`) within ±80 characters in the same paragraph. If the link's resolved target file differs from the current file → emit a warning:

```
WARNING <file>:<line> — brittle "step <N>" reference near link to <other>.md (renumbering breaks this; refer by description instead)
```

Edge cases the heuristic must handle correctly:
- **Same-file links** (anchor-only links — bracketed text followed by a parens block whose target starts with `#`) → not flagged.
- **External links** (`https://`, `mailto:`) → not flagged.
- **Reference-style links** (the bracketed `text` followed by a second bracketed `ref`, with `ref` defined elsewhere as `[ref]: path`) → must resolve the ref first; v1 of the rule may skip these and add support later if false negatives matter.
- **Code blocks / inline code** → match must not fire inside fenced code or backtick-delimited inline code.
- **`<!-- check:ignore brittle-step-reference -->` escape hatch** — required, mirroring the existing pattern in the script.

## Tasks

| Task ID | Description | Parallel? |
|---------|-------------|-----------|
| CS68-1a | ✅ Done in [PR #319](https://github.com/henrik-me/guesswhatisnext/pull/319): implement the `brittle-step-reference` rule in `scripts/check-docs-consistency.js`. Include tests under `tests/check-docs-consistency.test.js` with at least one passing fixture (same-file step ref, code-block step ref, clickstop-file step ref) and one failing fixture (cross-doc step ref in INSTRUCTIONS.md). | parallel |
| CS68-1b | ✅ Done in [PR #319](https://github.com/henrik-me/guesswhatisnext/pull/319): audit live policy docs (`npm run check:docs` after the rule lands). Fix any pre-existing legitimate hits by replacing step numbers with descriptions, OR add `<!-- check:ignore brittle-step-reference -->` annotations with a justifying comment. (The 2026-04-29 audit on the post-PR-#311 tree showed zero hits, so this task may be a no-op.) | parallel after 1a |
| CS68-1c | ✅ Done in [PR #319](https://github.com/henrik-me/guesswhatisnext/pull/319): add a short bullet to `CONVENTIONS.md § Documentation Conventions` describing the convention: "When cross-doc references point at a numbered list item, refer by description ('the WORKBOARD registration item') not by step number ('step 6'). Step numbers in target docs change; descriptions are stable. Enforced by `brittle-step-reference` lint rule." | parallel |
| CS68-2 | ⬜ Pending (earliest claim 2026-05-07): after the rule has been clean for ≥1 week of normal repo activity, flip it from warn to error in `--strict` mode (mirrors CS43-7 and CS65-2). Separate commit/PR. | sequential after 1* + soak |

CS68-1a/1b/1c land in one PR. CS68-2 is a follow-up commit after the soak window.

## CS68-2 — Pickup Instructions

**When (earliest claim date):** **2026-05-07** (one full week after CS68-1 merged on 2026-04-30T03:29Z). Earlier pickups are not blocked by tooling but contradict the soak intent — wait the full week.

**Why a soak window:**
1. **Detect false positives in real authoring.** The `brittle-step-reference` heuristic is regex-based with edge-case handling (anchor-only links, external links, code blocks, escape-hatch comments). A week of normal authoring across multiple agents exposes regex blind spots that the unit-test fixtures didn't cover. If anyone hits a false positive during the soak, fix the heuristic FIRST and restart the soak window.
2. **Avoid CI-blocking surprises.** Flipping warn → error converts "annotation in PR diff" into "merge blocker." Doing this with a fresh, unproven rule risks blocking unrelated PRs on a rule bug. The soak gives confidence the rule fires only on the intended pattern.
3. **Established repo precedent.** CS43-7 (PR after CS43-2) and CS65-2 (PR #318 after CS65-1*) both followed the same one-week soak-then-flip cadence. CS68-2 mirrors this on purpose.

**Pre-flight check before claiming CS68-2:**
1. `git pull` and `git log --since="2026-04-30" --grep="brittle-step-reference"` — look for any post-merge commits that touched the rule (would indicate a false-positive fix that resets the soak clock).
2. `npm run check:docs` — the `brittle-step-reference` rule should report **zero warnings** against the live tree. If non-zero, those are either real findings to fix in CS68-2's PR or false positives that need the rule itself adjusted (in which case do that first as CS68-1d, restart soak).
3. Look for any `<!-- check:ignore brittle-step-reference -->` comments added during the soak — each one is a signal that either (a) an author legitimately needed to write a cross-doc step ref (rare; document the case in CS68-2's PR body), or (b) the rule is over-firing (fix the rule, not the doc).

**What to do (concrete steps for CS68-2):**

1. **Locate the rule registration in `scripts/check-docs-consistency.js`.** CS68-1 added `brittle-step-reference` to whichever rule-registry list controls warn-vs-error promotion in `--strict` mode. Search for the string `brittle-step-reference` in the script — it should appear in (a) the rule-name registry, (b) the rule's emit-warning call site. The flip is typically achieved by either:
   - Adding the rule name to the `--strict`-promoted list (look at how CS65-2 PR #318 promoted its 7 rules — `0e5213c` is the canonical reference commit), OR
   - Changing the rule's `severity: 'warning'` to `severity: 'error'` if the script uses per-rule severity records.

   Read CS65-2's PR #318 diff (`gh pr diff 318`) — that's the most recent canonical example of the warn→error flip pattern in this script and shows the exact mechanical change shape.

2. **Update the rule's docstring/comment in the script** to note the flip date and reference CS68-2's PR (mirrors how CS43-7 and CS65-2 documented the flip in-source).

3. **Run `npm run check:docs:strict` locally** — must return 0 errors. If it errors on a `brittle-step-reference` finding, that finding needs to be fixed (rewrite the step ref to a description) BEFORE the PR can land — the flip has zero tolerance for outstanding warnings.

4. **No new tests required** — the existing CS68-1 unit tests already cover both severities (the rule's emit logic is unchanged; only the `--strict` promotion changes). Optionally add one strict-mode test asserting the rule is in the promoted list.

5. **Update this CS file:** mark CS68-2 ✅ Done with PR link, set CS68 frontmatter Status to ✅ Done with Closed timestamp, then move the file `active/` → `done/` as part of the closing commit (orchestrator step, not the implementation PR).

6. **Update WORKBOARD.md** to add a CS68-2 row when claimed and remove it on merge — same lifecycle as CS68-1.

**PR characteristics:**
- Tooling-only PR (touches `scripts/check-docs-consistency.js` and possibly one new test). Not docs-only — Copilot review is required (same allowlist analysis as CS68-1's PR #319).
- Should be a single commit; very small diff (likely <20 lines in the script).
- Container Validation: not applicable (tooling-only).
- Telemetry Validation: not applicable.

**Reverse coordination:** CS69 ([planned](../planned/planned_cs69_workboard-row-colspan.md)) depends on **CS65-2** being settled, not CS68-2 — so CS68-2 doesn't unblock anything else and can land at its own pace.

## Acceptance

- `brittle-step-reference` rule implemented with passing + failing fixtures.
- `npm run check:docs` is clean against the live policy doc set after CS68-1b cleanup (zero warnings from the new rule, or all remaining warnings are escape-hatched with justifications).
- `npm run check:docs:strict` returns 0 errors (warn-only landing).
- Rule documented in `CONVENTIONS.md § Documentation Conventions`.
- CS68-2 (the warn → error flip) is a separate follow-up commit, not part of the initial PR.

## Cross-references

- PR #311 (`OPS-checklist-session-start`, squash `19b9c7d`) — the bug that motivated this CS; local-review round 2 dispositions are the audit trail.
- CS43-2 — original docs-consistency linter; established the warn-only landing pattern.
- CS43-7 — flipped CS43-2 rules from warn to error after baseline cleanup; canonical "flip" precedent.
- CS62 — landed `clickstop-h1-matches-filename` and `workboard-title-matches-h1` warn-only.
- CS65 — plan-file-schema linter rules. **Coordination:** CS65 and CS68 both add rules to `scripts/check-docs-consistency.js`. Different scope (plan files vs live policy docs), so semantically independent, but textually concurrent — whichever PR lands second will rebase against the first.
- `scripts/check-docs-consistency.js` — the linter being extended.
- `tests/fixtures/check-docs-consistency/` — fixture directory for new tests.
