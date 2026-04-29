# CS68 — Policy Doc Lint Rules

**Status:** ⬜ Planned
**Origin:** PR #311 (`OPS-checklist-session-start`, merged 2026-04-29) local-review round 2 caught a brittle `step 6` cross-doc reference in `TRACKING.md § Claim effectiveness` that pointed at `OPERATIONS.md § Orchestrator Startup Checklist` step 6 — but that step had just been renumbered (5 → removed, 6 → 5, 7 → 6) in the same PR. The bug shipped because nothing flagged it; it was caught only by a careful gpt-5.5 reviewer. The general pattern — "step N" cross-doc references silently rotting when the target doc renumbers — is lintable.
**Depends on:** none
**Parallel-safe with:** CS65, CS66, CS67 (different rule scope from CS65's plan-file-schema rules; same surface file `scripts/check-docs-consistency.js` so rebase coordination required if both PRs are open simultaneously)

## Problem

Today, when a live policy doc (INSTRUCTIONS.md, OPERATIONS.md, TRACKING.md, REVIEWS.md) refers to a numbered list item in another live policy doc by step number — e.g. "see OPERATIONS.md § Orchestrator Startup Checklist step 6" — the reference becomes stale the moment the target doc's list is renumbered. Nothing in `npm run check:docs` catches this; it only surfaces if a reader follows the link, counts steps, and notices the mismatch.

PR #311 demonstrated this concretely: `TRACKING.md § Claim effectiveness` referenced `OPERATIONS.md § Orchestrator Startup Checklist` "step 6" while PR #311 was renumbering that very list. The reviewer (`code-review` agent + gpt-5.5, round 2) caught it. The fix the sub-agent applied was to refer by **description** instead of step number — a robust pattern that should be the default.

CS65's plan-file-schema rules are orthogonal — they enforce that planned/active CS files have the right frontmatter and section structure. CS68's rules enforce that live **policy docs** don't carry brittle cross-doc step references.

## Goals

1. Add a `brittle-step-reference` rule (warn-only) to `scripts/check-docs-consistency.js`.
2. Audit the live policy doc set so the rule lands clean (no spurious warnings on first run).
3. Document the pattern in `INSTRUCTIONS.md § Documentation Conventions` so authors prefer descriptive cross-doc references over step numbers.
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
| CS68-1a | Implement the `brittle-step-reference` rule in `scripts/check-docs-consistency.js`. Include tests under `tests/check-docs-consistency.test.js` with at least one passing fixture (same-file step ref, code-block step ref, clickstop-file step ref) and one failing fixture (cross-doc step ref in INSTRUCTIONS.md). | parallel |
| CS68-1b | Audit live policy docs (`npm run check:docs` after the rule lands). Fix any pre-existing legitimate hits by replacing step numbers with descriptions, OR add `<!-- check:ignore brittle-step-reference -->` annotations with a justifying comment. (The 2026-04-29 audit on the post-PR-#311 tree showed zero hits, so this task may be a no-op.) | parallel after 1a |
| CS68-1c | Add a short bullet to `INSTRUCTIONS.md § Documentation Conventions` describing the convention: "When cross-doc references point at a numbered list item, refer by description ('the WORKBOARD registration item') not by step number ('step 6'). Step numbers in target docs change; descriptions are stable. Enforced by `brittle-step-reference` lint rule." | parallel |
| CS68-2 | After the rule has been clean for ≥1 week of normal repo activity, flip it from warn to error in `--strict` mode (mirrors CS43-7 and CS65-2). Separate commit. | sequential after 1* + soak |

CS68-1a/1b/1c land in one PR. CS68-2 is a follow-up commit after the soak window.

## Acceptance

- `brittle-step-reference` rule implemented with passing + failing fixtures.
- `npm run check:docs` is clean against the live policy doc set after CS68-1b cleanup (zero warnings from the new rule, or all remaining warnings are escape-hatched with justifications).
- `npm run check:docs:strict` returns 0 errors (warn-only landing).
- Rule documented in `INSTRUCTIONS.md § Documentation Conventions`.
- CS68-2 (the warn → error flip) is a separate follow-up commit, not part of the initial PR.

## Cross-references

- PR #311 (`OPS-checklist-session-start`, squash `19b9c7d`) — the bug that motivated this CS; local-review round 2 dispositions are the audit trail.
- CS43-2 — original docs-consistency linter; established the warn-only landing pattern.
- CS43-7 — flipped CS43-2 rules from warn to error after baseline cleanup; canonical "flip" precedent.
- CS62 — landed `clickstop-h1-matches-filename` and `workboard-title-matches-h1` warn-only.
- CS65 — plan-file-schema linter rules. **Coordination:** CS65 and CS68 both add rules to `scripts/check-docs-consistency.js`. Different scope (plan files vs live policy docs), so semantically independent, but textually concurrent — whichever PR lands second will rebase against the first.
- `scripts/check-docs-consistency.js` — the linter being extended.
- `tests/fixtures/check-docs-consistency/` — fixture directory for new tests.
