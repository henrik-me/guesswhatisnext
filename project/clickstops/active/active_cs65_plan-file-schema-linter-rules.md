# CS65 — Plan File Schema Linter Rules

**Status:** 🔄 In Progress
**Origin:** 2026-04-29 conversation (omni-gwn). Direct follow-up to CS62 (merged warn-only) and CS64 (planning conventions). The plan-file structural linter is CS62's intended path; this CS finishes that work and adds new rules to enforce CS64's conventions.
**Depends on:** CS64 (Conventions A and B must exist before they can be enforced)
**Parallel-safe with:** CS66, CS67

## Problem

`scripts/check-docs-consistency.js` already covers two structural rules for plan files (CS62, both warn-only):
- `clickstop-h1-matches-filename`
- `workboard-title-matches-h1`

CS62's docstring promised a follow-up to flip them to error once the baseline is clean ("mirroring the CS43-2 / CS43-7 pattern"); that follow-up was never filed.

Additionally, today's plan files have **no enforced section schema** — a future planned file could omit `**Status:**`, `## Acceptance`, or the new CS64 frontmatter, and nothing would catch it. CS63 happens to follow the convention because the author chose to; the convention is not enforced.

## Goals

1. **Close the CS62 loop.** Flip the two existing warn-only rules to error after baseline cleanup.
2. **Enforce CS64's conventions** mechanically — `**Depends on:**`, `**Parallel-safe with:**`, task-ID format.
3. **Enforce baseline plan-file schema** — required sections every CS file should have.
4. **Land warn-only first**, flip to error in a future follow-up CS once the baseline is clean (CS43-2 / CS43-7 / CS62 pattern).

## Tasks

| Task ID | Description | Parallel? |
|---------|-------------|-----------|
| CS65-1a | Add `plan-has-depends-on` rule (warn-only). Every `planned_*.md` and `active_*.md` matching the clickstop naming convention must contain a `**Depends on:**` line in the frontmatter (between H1 and first `##`). | parallel |
| CS65-1b | Add `plan-has-parallel-safe-with` rule (warn-only). Same scope as 1a, requires `**Parallel-safe with:**` line. | parallel |
| CS65-1c | Add `plan-has-status-line` rule (warn-only). Every clickstop file must contain `**Status:**` line in frontmatter with one of: `🆕 Planned`, `🔄 In Progress`, `✅ Done`, `🚫 Blocked`. (TRACKING.md § Status icons is the canonical list.) | parallel |
| CS65-1d | Add `plan-has-required-sections` rule (warn-only). Every clickstop file must contain `## Acceptance` and `## Cross-references` (or equivalent) sections. Section name list is documented in the rule's docstring. | parallel |
| CS65-1e | Add `plan-task-id-format` rule (warn-only). Task IDs appearing in Tasks tables (column header `Task ID` or similar) match `^CS\d+-\d+([a-z])?$`. | parallel |
| CS65-1f | Audit baseline: run all new rules against existing files in `project/clickstops/{planned,active,done}/`. Fix or escape-hatch (`<!-- check:ignore <rule> -->`) every legitimate exception in `done/` (historical files we won't retrofit). Document policy in INSTRUCTIONS.md § Documentation Conventions. | parallel |
| CS65-2 | After all CS65-1* land and soak ≥ 1 week with no false positives, flip CS62's two existing warn-only rules (`clickstop-h1-matches-filename`, `workboard-title-matches-h1`) AND CS65-1a/1b/1c/1d/1e to error in `--strict` mode. Update CS62's docstring promise to point at this commit. | sequential after 1* |

CS65-1a..CS65-1f are parallel — they each add one rule to the same file (`scripts/check-docs-consistency.js`) plus tests under `tests/check-docs-consistency.test.js` and fixtures under `tests/fixtures/check-docs-consistency/`. Within a single PR they may all land together; if split across PRs they need rebase coordination on the script file.

CS65-2 is a separate phase because flipping to error requires a soak window after baseline cleanup.

## Acceptance

- All five new rules implemented in `scripts/check-docs-consistency.js`, each with at least one passing-fixture and one failing-fixture test.
- `npm run check:docs` clean against the existing repo (warn-only landing — pre-existing baseline issues escape-hatched or fixed).
- `npm run check:docs:strict` returns 0 errors (warnings allowed).
- CS62's two rules and all CS65-1* rules survive in `--strict` mode without errors after the baseline-cleanup sweep in CS65-1f.
- CS65-2 commit flips them to errors only after the soak window — this is a follow-up commit, not part of the initial PR.

## Cross-references

- CS43-2 — original docs-consistency linter; established the warn-only landing pattern.
- CS43-7 — flipped CS43-2 rules from warn to error after baseline cleanup; canonical "flip" precedent.
- CS62 — landed `clickstop-h1-matches-filename` and `workboard-title-matches-h1` warn-only; CS65-2 closes its open promise.
- CS64 — defines Conventions A (task IDs), B (frontmatter dep/parallel lines), C (preference doc) that CS65-1a/1b/1e enforce.
- `scripts/check-docs-consistency.js` — the linter being extended.
- `tests/fixtures/check-docs-consistency/` — fixture directory for new tests.
