# CS62 — WORKBOARD readability restructure

**Status:** ✅ Done (yoga-gwn-c4, merged 2026-04-27T03:16Z via PR [#294](https://github.com/henrik-me/guesswhatisnext/pull/294), squash commit `2a01d58`)
**Origin:** UX/process iteration with the orchestrator (yoga-gwn-c4 session, 2026-04-26). The current `## Active Work` table on `WORKBOARD.md` packs ~10 columns into a single markdown row; the rightmost `Next Action` cell wraps to a thin column and is unreadable in practice. Restructure for readability without giving up the docs-consistency parser guarantees.

## Goal

1. Make per-entry status scannable AND make the per-entry "what's next" prose actually readable.
2. Establish a single source of truth for clickstop human titles (the H1 in the CS file) and keep filename slug, H1, and WORKBOARD `Title` cell aligned by mechanical check.
3. Do all of the above without breaking `npm run check:docs` and without doubling the per-update edit surface.

## Non-goals

- No change to the Orchestrators table.
- No change to the `## Active Work` heading itself, the claim/release lifecycle, the canonical state vocabulary (CS44-1), or the stale-lock thresholds (CS44-2).
- No new CS file naming convention beyond the existing `(planned|active|done)_cs(\d+)_(<slug>)\.md` pattern.

## Decisions (locked with orchestrator before planning)

| Decision | Choice |
|---|---|
| Layout | **Markdown** (Option A from the planning preview) — two pipe rows per entry: a status row, then a description-continuation row whose `CS-Task ID` cell is blank. |
| Title source | **H1** of the CS file. New consistency rule keeps H1 ↔ filename slug ↔ WORKBOARD Title aligned. |
| Worktree + Branch columns | **Folded into the Title cell** as lines 2–3, e.g. `**Title**<br>WT: ` `worktree`<br>B:&nbsp; `branch` `. The dedicated `Worktree` and `Branch` columns are removed. |
| `PR` column | **Removed.** PR refs live inline in the description as `[#NNN](https://github.com/henrik-me/guesswhatisnext/pull/NNN)`; multi-PR entries (e.g. CS41) get all PRs linked. |
| Parent-CS column | **None.** Rely on the `CS\d+` prefix of the `CS-Task ID` cell; the orphan-rule extracts it. |
| New H1 rule rollout | **Warn-only on landing.** Existing CS files are not auto-migrated in this CS — they get touched as they are next opened. A follow-up CS may flip to error-mode once the baseline is clean (mirrors the CS43-2 / CS43-7 pattern). |

## Final schema

`## Active Work` table — **6 columns**:

```
| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
```

Per-entry shape — **two markdown rows**:

```markdown
| CS62-1 | **Short human title**<br>WT: `wt-cs62-1`<br>B:&nbsp; `yoga-gwn-c4/cs62-1-impl` | claimed | yoga-gwn-c4 | 2026-04-26T17:00Z | — |
|  | _One-paragraph what's-next, with [PR #NNN](https://github.com/henrik-me/guesswhatisnext/pull/NNN) inline once it exists._ |  |  |  |  |
```

Conventions:
- **Title cell line 1** is bolded human title (no `CSnn —` prefix in the cell — the prefix lives in column 1).
- **Title cell line 2** is `WT: ` + backticked worktree path or directory name.
- **Title cell line 3** is `B:&nbsp; ` + backticked branch name (`&nbsp;` indents the value to align with the worktree value above).
- **Description row** has a blank `CS-Task ID` cell — that is the parser signal "skip this row for per-row checks." All other trailing cells are blank.
- **Description prose** is wrapped in `_…_` italics so the eye separates it from status rows. PR refs use `[#NNN](https://github.com/…)`.

## Tasks

| Task | Description | State |
|---|---|---|
| CS62-1 | **Parser update — schema rename + description-row guard.** In `scripts/check-docs-consistency.js`: rename header lookup from `^task\s*id$` to `^cs[-\s]*task\s*id$` (affects `checkActiveRowFreshness` line 713 and the section in `checkLastUpdatedIso8601`). Add a description-row guard to every per-row check: skip rows whose `CS-Task ID` cell is empty (current row-level checks: `state-in-vocabulary`, `last-updated-iso8601`, `owner-in-orchestrators`, `active-row-stale`, `active-row-reclaimable`, `no-orphan-active-work`). Update `checkNoOrphanActiveWork` to read the CS-Task ID column by header lookup (instead of the hard-coded `cells[2]` index it uses today, which depended on the old column order) and extract `^CS\d+` for the done-set comparison. Tests: extend `tests/check-docs-consistency.test.js` with fixtures for the new shape, including the negative cases (orphan parent-CS in the CS-Task ID column, stale row, blank description row does not trigger any rule). | ✅ Done |
| CS62-2 | **Parser update — new H1 ↔ filename rule (warn-only).** Add `clickstop-h1-matches-filename`: walk every file under `project/clickstops/{planned,active,done}/`, parse the filename against `(planned\|active\|done)_(cs\d+)_(<slug>)\.md`, parse the first non-blank line of the file against `^#\s+(CS\d+)\s+—\s+(.+)$`, then assert (a) the CSIDs match (case-insensitive) and (b) `kebab-case(human title)` equals the filename slug. Kebab-casing rules: lowercase, ampersand → `and`, replace runs of non-alphanumeric with `-`, strip leading/trailing `-`. Severity: **warning** (warn-only baseline per CS43-2 precedent). Honors the existing `<!-- check:ignore clickstop-h1-matches-filename -->` escape hatch. Tests: positive (slug matches), negative (slug drift, CSID drift, malformed H1, missing H1, em-dash variants — `—` only, not `-` or `--`). Document in the script's header comment that this rule is warn-only and a follow-up CS will flip it to error once the baseline is clean. | ✅ Done |
| CS62-3 | **Parser update — new `workboard-title-matches-h1` rule (warn-only).** Walks `## Active Work` rows; for each row, takes the `CS-Task ID` cell, extracts the parent CSID via `^(CS\d+)`, finds the corresponding `*_<csid>_*.md` file under `project/clickstops/{planned,active,done}/`, parses its H1, and asserts the row's `Title` cell — specifically the bolded line 1 of the multi-line cell, before the first `<br>` — exactly equals the human-title portion of the H1. Severity: **warning**. Honors `<!-- check:ignore workboard-title-matches-h1 -->`. Tests: positive + negatives (Title drifted, missing CS file, parent-CS prefix matches multiple files). | ✅ Done |
| CS62-4 | **Parser cleanup — drop stale CS44-3 references.** CS44-3 already landed in PR #211; the comments at `scripts/check-docs-consistency.js` lines 499, 617, 642, and 791 still say "until CS44-3 upgrades the schema" and treat the schema as future. Delete those comments / rewrite to past tense. Also update `TRACKING.md:242` ("Until CS44-3 lands…") to remove the stale caveat. Pure docs/comments; no behavior change. | ✅ Done |
| CS62-5 | **Migrate `WORKBOARD.md` to the new shape.** Mechanically translate every Active Work row into the two-row form, dropping `Worktree` / `Branch` / `PR` columns and folding their data into the Title cell + description per § Final schema. Bump the `Last updated` stamp to the migration time. **Do not** modify any agent's row content beyond the format translation — preserve every owner's prose verbatim (escape pipes as `\|` if any prose contains them). | ✅ Done |
| CS62-6 | **Docs — INSTRUCTIONS / OPERATIONS / TRACKING.** Update the Quick Reference Checklist bullet on WORKBOARD updates to point at a new "WORKBOARD entry template" sub-section (in OPERATIONS or TRACKING — author's pick; the section becomes the source of truth for the template). Add the template (the markdown snippet above), the multi-line Title cell convention, the H1 format `# CSnn — Human Title`, and a one-liner "rename the file → must update the H1" note pointing at the new consistency rules. If `CONTEXT.md` restates the WORKBOARD column list anywhere, replace the restatement with a link to OPERATIONS/TRACKING. | ✅ Done |
| CS62-7 | **Cross-agent broadcast.** Other orchestrators (yoga-gwn, yoga-gwn-c2, yoga-gwn-c3, yoga-gwn-c5) are mid-flight on PRs and may add WORKBOARD rows during the merge window. Mitigations: (a) checklist line 10 already requires `git pull` before reading project files — no new rule needed; (b) the parser changes do not break old-shape rows because the rename is hard-cut and migration of all existing rows lands in the same PR; (c) post-merge, the orchestrator landing this CS pings each active orchestrator's session (or leaves a note in WORKBOARD's header) so they pull and re-read INSTRUCTIONS before their next claim. | ✅ Done |

## Lift / risk

- **Parser rewrite is contained** (one file, one test file, existing patterns).
- **Atomic cutover risk:** between PR merge and other orchestrators pulling, an agent could push a row in the old shape directly to main. They lose only on their *next* PR's docs-consistency check, which is exactly the right failure surface (warns them to pull + re-template). Acceptable.
- **Description-row parsing risk:** every existing per-row check needs the blank-`CS-Task ID` guard added. Easy to forget one. Mitigation: extend the test fixture so EVERY rule has a "description row present, must not fire" assertion.
- **Title widens column 2:** longest description in column 2 sets the Title column's width; for entries with no description (rare) the column will still be wide. Acceptable trade-off vs Option B's HTML+colspan complexity.

## Acceptance

- `npm test` passes (includes feature-flag policy + Vitest with new fixtures).
- `npm run check:docs:strict` passes against the migrated WORKBOARD.
- Local code-review pass with `gpt-5.4` returns 0 findings.
- Copilot PR review approves with 0 unresolved threads.
- Container-validate gate: **N/A** (no server/client/DB code touched — only `scripts/`, tests, and `.md`). Note this in `## Container Validation` of the PR body.
- Telemetry gate: **N/A** (no new code path, error path, dependency call, or background activity). Note this in `## Telemetry Validation`.

## Out of scope (deferred — explicitly NOT in this CS)

- Flipping the new H1 / Title-matches-H1 rules from warn-only to error-mode. Tracked as a future CS once the baseline is clean (mirrors CS43-2 / CS43-7 precedent).
- Auto-migrating existing CS files whose H1 or filename slug doesn't conform. Files get touched as their owning CS is next worked.
- Any change to the Orchestrators table.

## Refs

- CS44-3 (already landed) — established the current 10-column schema this CS replaces.
- CS44-5a — the per-row checks (state vocab / ISO 8601 / owner) that need a description-row guard added.
- CS44-5b / CS44-2 — `active-row-stale` and `active-row-reclaimable` thresholds that also need the description-row guard.
- CS43-2 / CS43-7 — warn-only-then-flip-to-error precedent for new docs-consistency rules.
- Original planning notes: session `0a2fee72-e7a9-40b3-824c-4d6c37636f8b` plan.md and files/workboard-preview.md.

## CS65-2 follow-up

Flip-to-error completed in CS65-2 PR [#318](https://github.com/henrik-me/guesswhatisnext/pull/318).
