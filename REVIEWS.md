# REVIEWS

This file contains review procedures for sub-agents during PR work (local review loop, Copilot review loop, thread resolution). For orchestrator workflow policy see `INSTRUCTIONS.md`; for code/test conventions see `CONVENTIONS.md`. For day-to-day workflow procedures see `OPERATIONS.md`. For clickstop/workboard lifecycle see `TRACKING.md`.

<!-- OPERATIONS.md and TRACKING.md are created by CS45-2 and CS45-4 (parallel with this PR); once both land the references above can be upgraded from code spans to markdown links. -->

## Local Review Loop

Before requesting Copilot PR review, sub-agents **must** run a local review loop using the `code-review` agent with GPT 5.5 or higher (use the newest available GPT release; `gpt-5.5` is the floor). This catches issues in ~60 seconds vs the 2-10 minute Copilot polling cycle.

**Local review procedure:**
1. After pushing changes and creating the PR, launch a local review:
   ```
   task agent_type=code-review model=gpt-5.5:  # GPT 5.5 or higher
     "Review changes on branch <branch-name> in <worktree-path>.
      Run `git --no-pager diff main...HEAD` to see changes.
      Focus on: bugs, security, correctness, broken links, factual accuracy.
      Only flag issues that genuinely matter."
   ```
2. Address all issues found by the local review — commit fixes
3. Re-run the local review until clean (no issues found)
4. **Then** proceed to Copilot review or skip, based on PR type:

**Local-review checklist (must verify in addition to whatever the model surfaces):**
- No new code introduces a `setInterval` / `setTimeout` / cron / scheduler that issues a DB query without an explicit user/operator action (CS53 / [§ Database & Data in CONVENTIONS.md](CONVENTIONS.md#database--data)).
- PR body has a `## Container Validation` section with at least one passing cycle dated within the last hour, OR the PR is exempt as docs-only / CI-config-only / docs/CI-only / tooling-only (or a supported combination) per [§ Cold-start container validation in OPERATIONS.md](OPERATIONS.md#cold-start-container-validation).

**Documenting review findings:**
After each local review round, update the PR description with a `## Local Review` section. This is the canonical PR-body schema for the local-review gate:

- The heading must be exactly `## Local Review`. For docs-only PRs, the section may instead be headed `## Local Review: not applicable (docs-only)` with optional clarification text after the category.
- The body must be a markdown table with the columns `Round`, `Finding`, and `Fix`. Bullet lists and prose-only summaries are not accepted by the gate.
- At least one row must have a numeric `Round` (`1` or higher). The `Fix` cell must reference a PR commit SHA, or the row must contain `clean — no issues found` / `clean - no issues found` to document a clean review round.

```
## Local Review
| Round | Finding | Fix |
|-------|---------|-----|
| 1 | CONTEXT.md workflow text still says "pre-branch-protection" | Fixed in [`abc1234`](commit-url) |
| 2 | CS26-8 references WORKBOARD.md instead of INSTRUCTIONS.md | Fixed in [`def5678`](commit-url) |
| 3 | Clean — no issues found | clean — no issues found |
```
This preserves the review audit trail in the PR for future reference.

**PR type determines Copilot review requirement:**

| PR Type | Local Review | Copilot Review | Rationale |
|---------|-------------|----------------|-----------|
| **Code changes** (features, fixes, refactors) | ✅ Required | ✅ Required | Code needs both fast local + thorough Copilot review |
| **Docs-only** (clickstop files, CONTEXT.md, README, INSTRUCTIONS.md) | ✅ Required | ⏭️ Skip | Local review is sufficient; Copilot review adds 10+ min overhead for no additional value |
| **Config/CI changes** (workflows, Dockerfile, docker-compose) | ✅ Required | ✅ Required | Security-sensitive changes need Copilot review |

**Docs-only PR definition:** A PR is docs-only if it modifies ONLY files with extensions `.md`, or files anywhere under `project/clickstops/` (including the `planned/`, `active/`, and `done/` subdirectories). If ANY non-docs file is changed, treat it as a code PR.

**Merge gates by PR type:**
- **Code/config/CI PRs:** Copilot clean (`COMMENTED` with no new comments and all inline threads resolved, or `APPROVED`) + local review clean + CI green. Copilot review is mandatory; skipping it on a non-docs PR is a process violation. If GitHub branch protection still blocks because Copilot did not emit `APPROVED`, use the normal `gh pr merge --squash --admin` path documented in [OPERATIONS.md § Merge gate: Copilot COMMENTED with all threads resolved](OPERATIONS.md#merge-gate-copilot-commented-with-all-threads-resolved).
- **Docs-only PRs:** local review clean + CI green. Copilot is skipped by design; any `--admin` merge for a docs-only PR requires explicit user approval because the Copilot gate was intentionally skipped.

**Copilot PR Review Policy:**
- Every code/config/CI PR must be reviewed by Copilot before merging (docs-only PRs may skip — see Local Review Loop above)
- Categorize comments as **Fix** (real bugs, security, correctness), **Skip** (cosmetic, by-design), or **Accept suggestion** (correct code improvement)
- Fix valid issues, reply with disposition + commit SHA/change rationale on each thread, then resolve all threads
- If Copilot re-reviews after fixes, repeat the cycle

**Copilot-review checklist (must verify before merge, in addition to Copilot's own findings):**
- No new code introduces a `setInterval` / `setTimeout` / cron / scheduler that issues a DB query without an explicit user/operator action (CS53 / [§ Database & Data in CONVENTIONS.md](CONVENTIONS.md#database--data)).
- PR body's `## Container Validation` section has a fresh passing cycle from after the last fix push, OR the PR is exempt as docs-only / CI-config-only / docs/CI-only / tooling-only (or a supported combination) per [§ Cold-start container validation in OPERATIONS.md](OPERATIONS.md#cold-start-container-validation).

**Copilot Review — Detailed Workflow:**

Requesting review (requires gh CLI ≥ 2.88.0): `gh pr edit <PR#> --add-reviewer "@copilot"`

**Review loop (repeat until clean):**
1. Read all review comments and suggestions
2. Categorize each as **Fix** (real bugs, security, correctness), **Skip** (cosmetic, by-design), or **Accept suggestion** (correct code improvement)
3. Decide the disposition for each comment, fix valid issues, and commit the fixes
4. Reply to each thread before resolving it. For fixes, the reply MUST cite the fixing commit SHA; for skips/by-design/duplicates/not-applicable findings, the reply MUST give the concrete rationale or target thread/change. Empty resolution without a reply is a process violation.

   Good reply:
   > Fixed in `abc1234`: switched to atomic write to avoid the race.

   Bad reply:
   > OK

5. Re-request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"`
6. Repeat from step 1 until Copilot review is clean — the latest Copilot review is `COMMENTED` with no new comments and all inline threads resolved, OR `APPROVED`. The Copilot bot does not always issue `APPROVED`; in this repo it almost always converges as `COMMENTED` with no new comments, and that state — combined with all inline threads resolved — is effective approval per the normal merge gate. See [OPERATIONS.md § Merge gate: Copilot COMMENTED with all threads resolved](OPERATIONS.md#merge-gate-copilot-commented-with-all-threads-resolved) for the full criteria.

### Waiting for Copilot Review

**CRITICAL:** After requesting review, Copilot takes **2–5 minutes** to post its review. **DO NOT** assume an empty review list means approval — it means Copilot hasn't responded yet. Poll every 60 seconds, up to 10 times (10 minutes total). After 10 attempts, report a timeout to the orchestrating agent. Compare Copilot review count before/after using:
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/<PR#>/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer")] | length'
```
Check latest review state (`APPROVED`, `CHANGES_REQUESTED`, or `COMMENTED`):
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/<PR#>/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer")] | last | .state'
```

**Replying to review comments (REST API):**
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/comments/<COMMENT_ID>/replies --method POST -f "body=YOUR_REPLY"
```

**Reply conventions:** Fixed → MUST reference commit hash (`Fixed in abc1234: switched to atomic write`). Skip/by design → explain rationale (`Skip — by design: endpoint intentionally stays read-only because <reason>`). Not applicable → note why observation is incorrect (`Not applicable: <why>`). Duplicate → reference original thread or fixing commit (`Duplicate of thread <id>; fixed in abc1234`). Reply first, then resolve the thread.

**Resolving review threads (GraphQL API):**
```powershell
# Get unresolved thread IDs
gh api graphql -f query='{ repository(owner: "henrik-me", name: "guesswhatisnext") { pullRequest(number: {PR#}) { reviewThreads(first: 100) { nodes { id isResolved comments(first: 1) { nodes { databaseId path } } } } } } }'

# Resolve a thread
gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "THREAD_ID" }) { thread { isResolved } } }'
```

**Large-diff PR behavior:** On large diffs, Copilot may re-post comments on unchanged lines. When comments reference already-fixed code, reply with the fix commit hash and resolve.

**Resolved threads may resurface in the UI:** A thread that was replied-to and resolved in a prior round may still appear unresolved in some UI views, and `gh api .../comments?commit_id=...` filtering can return file/line-anchored review comments regardless of which commit originally created them. Note that every Copilot review round gets a fresh review `id` and `submitted_at` even when it generates no new comments, so those fields alone do **not** prove a thread is new. To verify a recurring thread is actually a new finding, check the **inline comment itself**: a new comment has a new `id` and a new `created_at` later than the prior round. If the most recent Copilot review reports "generated no new comments" and the thread's latest comment `created_at` predates that review, treat the previously-resolved thread as already-addressed. Threads that were never resolved still need to be addressed normally — this guidance applies only to threads that were resolved in a prior round and have no newer Copilot comment.
