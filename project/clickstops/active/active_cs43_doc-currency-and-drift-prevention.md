# CS43 — Documentation Currency & Drift Prevention

**Status:** 🔄 In Progress
**Goal:** Bring all project documentation into agreement with current reality, then prevent regression by encoding a single principle ("link, don't restate") and adding an automated consistency check that runs on every PR.

**Origin:** Discovered during evaluation of issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) and the local `review.md` operating-model review. Both reviews independently surfaced the same root cause: docs paraphrase facts that have an authoritative source elsewhere, so they rot whenever the source changes. Several specific drift symptoms are already live on `main` (e.g. `infra/README.md` claims production runs on container-local SQLite when it actually runs on Azure SQL; `CONTEXT.md` lists CS17 as ✅ Complete with task count 4/8; CS21 detail block links to a `planned_*` file that doesn't exist; health-monitor cadence is described as both "every 5 minutes" and "every 6 hours" in different docs).

---

## Problem

Three classes of doc problem coexist and reinforce each other:

1. **Restatement drift.** Docs paraphrase values that live authoritatively in workflow files, scripts, schema files, or the filesystem itself. When the source changes, the paraphrase is silently wrong. Every cross-doc factual conflict found to date (DB backend, replica counts, health-monitor cadence, staging auto-deploy claim, secrets list, environments setup) is a restatement-drift symptom.
2. **CONTEXT.md scope creep.** [`INSTRUCTIONS.md:595`](../../../INSTRUCTIONS.md) explicitly limits `CONTEXT.md` to short summaries with links to clickstop files, but several clickstops carry full prose detail blocks in `CONTEXT.md` itself, some of which are stale or contradict the summary table or link to non-existent files.
3. **No mechanical guardrail.** All consistency is human-enforced. Reviewers cannot reliably catch every drift symptom by eye, and most don't try.

## Approach

Three principles, applied in this order:

1. **Adopt "link, don't restate" as a written rule.** Docs may be a source of truth, or they may point at one — they may not paraphrase. This single principle prevents most future drift by removing the surface where it can occur.
2. **Bring current docs into compliance.** Restructure `CONTEXT.md` to its documented shape. Slim `infra/README.md` to the small core that has no other home. Sweep remaining docs for restatements.
3. **Add a consistency-check script** that runs on every PR and gates docs-only PRs (which currently skip Copilot review per the CS30 local-review-loop policy). Two-step rollout: warn-only first, hard gate after baseline cleanup.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS43-1 | Add "link, don't restate" principle to INSTRUCTIONS.md | ✅ Done ([#199](https://github.com/henrik-me/guesswhatisnext/pull/199)) | One-paragraph addition under § Documentation Conventions (or new subsection). Defines the rule: docs either are a source of truth or point at one; they do not paraphrase. Lists acceptable techniques (direct file link, anchor link, embedded codeblock with `<!-- include: -->` marker). Lists the anti-pattern (restating a value from a workflow/script/config file inline). One-PR docs-only change; baseline for everything that follows. |
| CS43-2 | Add `scripts/check-docs-consistency.js` (warn-only) + `npm run check:docs` + CI integration | ✅ Done ([#202](https://github.com/henrik-me/guesswhatisnext/pull/202)) | Node script, no new deps. Initial check set: (1) every relative link in `*.md` resolves; (2) every clickstop link in `CONTEXT.md` resolves; (3) clickstop file prefix matches CONTEXT.md status (`done_*` ↔ ✅, `active_*` ↔ 🔄, `planned_*` ↔ ⬜); (4) no CS number appears in two states; (5) no clickstop marked ✅ with `n/m` where `n < m` unless deferred work is documented; (6) WORKBOARD.md Active Work entries do not reference clickstops marked ✅; (7) WORKBOARD.md "Last updated" stamp is within 14 days (warn). Wire into `ci.yml` as a non-blocking step; record baseline violations in PR description. Provide `<!-- check:ignore <rule-name> -->` escape-hatch comment for legitimate exceptions. Add `tests/check-docs-consistency.test.js` with golden-file fixtures so the checker itself is tested. |
| CS43-3 | Restructure CONTEXT.md to documented shape | ✅ Done ([#203](https://github.com/henrik-me/guesswhatisnext/pull/203)) | Strict shape (recommended): summary table for **active + planned only**; one row per CS, no prose. Done clickstops discovered via the `project/clickstops/done/` folder listing on GitHub (no maintained index file — see "Will not be done"). Replace each per-clickstop prose block with deletion (info already lives in the clickstop file). Replace "GitHub Actions Workflows" inventory table with a one-line link to `.github/workflows/`. Replace "Test Inventory" table with a link to `npm test` output (no maintained inventory file — see "Will not be done"). Keep `## Current Codebase State` (architecture, server/client structure) and `## Blockers / Open Questions` — these are CONTEXT.md's actual reason to exist. Implementer should confirm strict-vs-looser shape with orchestrator before starting. |
| CS43-4 | Slim infra/README.md to Option A (~80 lines) | ✅ Done ([#201](https://github.com/henrik-me/guesswhatisnext/pull/201)) | Keep only: (a) quickstart pointer at `deploy.sh` / `deploy.ps1` with `--help` reference; (b) custom-domain one-time setup (DNS records, `az containerapp hostname` commands, `PROD_URL` gotcha — this section has no other home); (c) short troubleshooting cheat-sheet (`az containerapp logs show`, restart, list revisions); (d) link section pointing at workflow files, CONTEXT.md, deploy script source for everything that's currently restated. Delete: architecture diagram (in README.md), replica counts (in `prod-deploy.yml`), required secrets/vars list (in workflow files + `deploy.sh`), GitHub environments setup (in CS26 archive), CI/CD pipeline description (in workflow files + CONTEXT.md), storage section (wrong + restated in CONTEXT.md), health monitoring detail (in workflow file), branch protection table (in CS26 archive), duplicated GitHub Repository Settings section. Verify checker (CS43-2) passes on the slimmed file. |
| CS43-5 | Standardize clickstop file location convention | ✅ Done | PR [#206](https://github.com/henrik-me/guesswhatisnext/pull/206). Applied Option A: `planned/` + `active/` subdirs mirror existing `done/`. 6 clickstop files `git mv`-relocated (history preserved). Checker `prefix-matches-status` rule updated + fixtures restructured. INSTRUCTIONS.md lifecycle table and all cross-references in CONTEXT.md, WORKBOARD.md, and other clickstops rewritten. Checker: 0 findings post-move. |
| CS43-6 | Sweep remaining docs for restatements | ✅ Done | PR [#204](https://github.com/henrik-me/guesswhatisnext/pull/204). Baseline 4 checker violations fixed (INSTRUCTIONS.md anchor, 3 clickstop relative-path links). README.md restatements swept (CS25 "(planned)" framing, Health Monitor cadence → clickable workflow-file pointers). WORKBOARD.md fresh, copilot-instructions.md already pointer-only. LEARNINGS.md CS18/25/38/39 additions + broader README deployment-section restructure deferred to follow-up clickstops (see PR description). |
| CS43-7 | Flip consistency check to fail-on-error in `ci.yml` | ✅ Done | PR [#205](https://github.com/henrik-me/guesswhatisnext/pull/205). Flipped `.github/workflows/docs-check.yml` to run `npm run check:docs:strict` without `continue-on-error`. Added `check:docs:strict` npm script. Hard gate live — 7 invariants now enforced (link-resolves, clickstop-link-resolves, prefix-matches-status, unique-cs-state, done-task-count, no-orphan-active-work, workboard-stamp-fresh). |
| CS43-8 | Add LEARNINGS.md entry capturing the "link, don't restate" principle and rationale | ✅ Done ([#200](https://github.com/henrik-me/guesswhatisnext/pull/200)) | One paragraph, with citations to the drift symptoms that motivated it (issue #198, review.md, the specific CONTEXT.md/infra/README.md violations found). Future contributors should be able to read this and understand *why* the rule exists, not just the rule itself. |
| CS43-9 | Update issue #198 with CS43 completion summary | 🔄 In Progress | Final task. Comment on [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) listing the CS43 doc-rot items now fixed (CONTEXT.md restructure, infra/README.md slim, principle codified, checker live as hard gate). Cross-reference CS44 and CS45 for the remaining doc/process items. Do not close the issue — it also covers product/code findings (server-authoritative scoring, multiplayer state, MSSQL adapter, ORDER BY RANDOM, JWT) handled by future clickstops. |

---

## Design Considerations

- **Two-step rollout for the checker is non-negotiable.** Flipping it to a hard gate while violations exist trains people to ignore CI. Warn-only → baseline cleanup → hard gate.
- **Escape-hatch comments are required from day 1.** Some legitimate restatements will exist (e.g. for readability in onboarding sections). The checker must support `<!-- check:ignore <rule-name> -->` so authors aren't forced to choose between violating the principle and disabling the check globally.
- **The script is itself a doc.** It has the same drift risk as anything else. Keep it small (~200 lines), well-commented, and covered by tests with golden-file fixtures so a regression in the checker is itself caught by CI.
- **Link-resolution check is the highest-leverage single invariant.** It catches dead clickstop links (CS21 → `planned_cs21_highscore-sync.md`), wrong file paths after moves (CS35 reorganisation), and broken anchors. It also subsumes much of what cross-doc fact-alignment checks would do, because once `infra/README.md` *links* to `prod-deploy.yml` instead of restating its values, fact-alignment checks become unnecessary.
- **CONTEXT.md strict shape is recommended but the implementer of CS43-3 should confirm with the orchestrator before starting.** The looser alternative (one-line table for all CSs including done) keeps a discoverable history at the cost of ~40 hand-curated rows. Strict pushes that history to the filesystem (the `project/clickstops/done/` folder listing on GitHub).
- **Order matters.** CS43-1 (principle) must land before CS43-3 / CS43-4 / CS43-5 (which apply it). CS43-2 (checker, warn-only) should land before or concurrent with the application tasks so authors get fast feedback during the rewrite. CS43-5 (clickstop file relocation) should land before CS43-7 (hard gate) so the checker's prefix-vs-status rule reflects the new convention. CS43-7 (hard gate) must land last.

## Will not be done as part of this update

These items were considered and deliberately excluded because they would create *more* files or *more* maintenance surface — the opposite of what this clickstop is trying to achieve. They can be revisited in a future clickstop if the cost/benefit changes.

- **Auto-generated `project/clickstops/done/INDEX.md`.** Considered as a discovery surface for completed clickstops. Rejected: GitHub already renders `project/clickstops/done/` as a browsable file list, filenames already encode CS#/name/status, and an INDEX file would be one more artifact to keep in sync (or one more script and CI step to maintain). The folder listing is the index.
- **Auto-generated `docs/test-inventory.md`.** Considered as a way to keep the "Test Inventory" section of `CONTEXT.md` accurate without manual upkeep. Rejected for the same reason: `npm test` is the source of truth, and a generated file is just another mirror that can go stale (between regeneration runs) or fail in CI for reasons unrelated to the test suite. Anyone who needs the count can run the tests.
- **`.ops/workboard.json` as machine-readable backing for `WORKBOARD.md`** (recommended by review.md improvement 5). Considered as a way to make the workboard easier to validate. Rejected here: introducing a JSON source-of-truth with rendered Markdown adds tooling complexity and another file class to maintain. May be revisited as part of CS44 if the WORKBOARD state-machine work clearly benefits from it; not needed for the doc-currency goal of CS43.
- **Splitting `INSTRUCTIONS.md` into `OPERATIONS.md` / `REVIEWS.md` / `TRACKING.md`** (review.md finding 4). Tracked separately as **CS45**. Adding the "link, don't restate" principle (CS43-1) to today's `INSTRUCTIONS.md` is sufficient for this clickstop's goal.
- **WORKBOARD.md schema upgrade + state machine + stale-lock handling** (review.md findings 1, 3, 5). Tracked separately as **CS44**. CS43 may surface stale-stamp warnings via the consistency checker, but does not redesign the schema.
- **Issue #198 product/code findings** (multiplayer state, server-authoritative scoring, MSSQL adapter simplification, puzzle-selection scaling, JWT refresh/revocation, async friend challenges). Each warrants its own clickstop. Out of scope for any docs work.

## Acceptance Criteria

- [ ] `INSTRUCTIONS.md` contains the "link, don't restate" principle as a written rule.
- [ ] `npm run check:docs` exists and runs in `ci.yml` as a hard gate.
- [ ] The checker passes against `main` with zero violations.
- [ ] `CONTEXT.md` matches its documented shape (no per-CS prose blocks; structure as agreed in CS43-3).
- [ ] `infra/README.md` is ~80 lines or fewer, with the deleted material linked rather than restated.
- [ ] No relative link in any `*.md` file is broken.
- [ ] Cross-doc factual conflicts identified during this work (DB backend, health-monitor cadence, staging auto-deploy claim) are resolved by deleting restatements, not by paraphrasing them more carefully.
- [ ] LEARNINGS.md captures the principle and the drift symptoms that motivated it.
