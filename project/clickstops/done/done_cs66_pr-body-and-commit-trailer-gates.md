# CS66 — PR Body And Commit Trailer Gates

**Status:** 🔄 In Progress
**Origin:** 2026-04-29 conversation (omni-gwn) about enforcing the sub-agent review process. The Sub-Agent Checklist requires a local GPT-5.5 review and a `## Local Review` log in the PR body, but nothing mechanical verifies the orchestrator pasted the checklist or the sub-agent ran the review. Hand-written prompts can drift; this CS catches the drift via CI.
**Depends on:** CS64 (uses the dep/parallelism conventions in the new gate's PR-body schema docs)
**Parallel-safe with:** CS65, CS67

## Problem

The Sub-Agent Checklist (OPERATIONS.md § Sub-Agent Checklist, step 9) requires every sub-agent to run a local review with GPT-5.5+ and document findings in the PR body under `## Local Review`. This is enforced **socially only**: orchestrators are supposed to paste the checklist verbatim into dispatch prompts; sub-agents are supposed to follow it. Failures are caught only when a human notices the missing section.

Symptoms today:
- A sub-agent that skips the local review and goes straight to Copilot review wastes 10+ minutes of polling that catches lower-signal issues.
- An orchestrator that paraphrases the checklist may omit `STATE:` markers, the trailers, or the validation step.
- The `## Container Validation` and `## Telemetry Validation` PR-body sections are also enforced socially — a code/config PR can be merged without them if no human reviewer notices.

## Goals

1. **Mechanically gate** that every non-trivial PR's body contains the required sections.
2. **Mechanically gate** that every non-merge commit on a feature branch carries `Co-authored-by: Copilot ...` and `Agent: <id>/<wt>` trailers.
3. **Surface failures early** — as a CI check on `pull_request` open/sync, not just at merge time.
4. **Avoid false positives** for genuinely-exempt PR types (docs-only, dependabot, manual orchestrator commits on main).

## Tasks

| Task ID | Description | Parallel? |
|---------|-------------|-----------|
| CS66-1a | ✅ Done in PR [#315](https://github.com/henrik-me/guesswhatisnext/pull/315): Add `scripts/check-pr-body.js`: reads PR body and commits via `gh pr view`, reads the complete changed-file list via paginated `gh api`, asserts `## Local Review` section exists with at least one Round ≥ 1 row whose Fix references a PR commit SHA (or a clean-review row). For docs-only PRs (only `.md` or `project/clickstops/**` changed), the assertion accepts `not applicable (docs-only)`. Same shape for `## Container Validation` and `## Telemetry Validation`, with documented docs/CI/tooling escapes. | parallel |
| CS66-1b | ✅ Done in PR [#315](https://github.com/henrik-me/guesswhatisnext/pull/315): Add `scripts/check-commit-trailers.js`: walks `git log origin/main..HEAD --no-merges`, asserts each commit message contains `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` and `Agent: <token>/<token>` (loose regex). Excludes merge commits and a documented allowlist of "manual orchestrator main commits" (WORKBOARD.md updates, plan file additions). | parallel |
| CS66-1c | ✅ Done in PR [#315](https://github.com/henrik-me/guesswhatisnext/pull/315): Add unit tests under `tests/check-pr-body.test.js` and `tests/check-commit-trailers.test.js` with fixture PR bodies and fixture git logs. Cover: passing cases, each failure mode, docs-only escape, allowlist behavior. | parallel after 1a + 1b interfaces stabilize |
| CS66-1d | ✅ Done in PR [#315](https://github.com/henrik-me/guesswhatisnext/pull/315): Add `package.json` scripts: `check:pr-body`, `check:commit-trailers`. | parallel |
| CS66-1e | ✅ Done in PR [#315](https://github.com/henrik-me/guesswhatisnext/pull/315): Add `.github/workflows/pr-checks.yml` jobs that run both gates on `pull_request: [opened, synchronize, edited]`. The PR-body check runs from the action context; the commit-trailer check uses `actions/checkout@v4` with `fetch-depth: 0`. | parallel after 1a + 1b exist |
| CS66-2 | ✅ Done — soak window cut short by user direction on 2026-05-01 ("enforce these rules now"). Soak findings cataloged in CS66-2a (PR #323) and used to drive the failure-message + docs improvements in CS66-3. | sequential after 1* |
| CS66-2a | ✅ Done in PR [#323](https://github.com/henrik-me/guesswhatisnext/pull/323): Tighten `scripts/check-pr-body.js` to eliminate the false-positive patterns surfaced by the 2026-05-01 audit: inline clarification text in operational `not applicable (<category>)` markers, hybrid `+` category markers, and operational `N/A` synonyms now pass when the changed-file predicates support them. Local Review remains table-required (FP-3 is by design). Failure messages now include canonical templates, and fixture tests cover each new accept/reject case. | parallel within CS66-2 |
| CS66-3 | 🔄 In Progress — sub-agent landing PR [#324](https://github.com/henrik-me/guesswhatisnext/pull/324); orchestrator will flip to required after merge. Promote both checks to **required** status checks in repository branch protection. Update CONVENTIONS.md and OPERATIONS.md to document the gate (with PR-body schema example), ensure each PR-body section's canonical spec is unambiguous, and link the failure messages directly to the docs so authors can self-fix without ping-pong. | sequential after 2 |

## Acceptance

- A PR opened without `## Local Review` fails CI on the PR-body check.
- A PR opened without trailer-bearing commits fails CI on the trailer check.
- A docs-only PR with `## Local Review: not applicable (docs-only)` (or with the section present and populated) passes.
- WORKBOARD/plan-file commits made on main by the orchestrator do not fire the trailer check (they're allowlisted).
- After CS66-3 lands, `--admin` is the only escape hatch for missing sections, putting the friction in the right place.

## Open questions

1. **PR-body check needs `gh` access from a CI workflow** — this works with the default `GITHUB_TOKEN` for `gh pr view` on the same repo's PRs. Needs verification that fork-PRs (if any) don't break.
2. **Allowlist for trailer check** — initial allowlist: commits where the only changed paths are `WORKBOARD.md` or `project/clickstops/**`. Refine in CS66-2 based on observed false positives.

## Cross-references

- CS64 — planning conventions for dep/parallelism notation.
- CS65 — plan-file schema linter (independent surface; same warn-then-flip philosophy).
- CS67 — canonical sub-agent checklist file; CS66's gate is the runtime enforcement of what CS67 documents.
- REVIEWS.md § Local Review Loop — defines the `## Local Review` section format CS66-1a checks for.
- CONVENTIONS.md § 5 Git Workflow — defines the trailer convention CS66-1b checks for.
- OPERATIONS.md § Cold-start container validation — defines `## Container Validation` section format.
- CONVENTIONS.md § 4a Telemetry & Observability — defines `## Telemetry Validation` section format.
