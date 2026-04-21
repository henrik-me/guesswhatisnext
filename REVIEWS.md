# REVIEWS

This file contains review procedures for sub-agents during PR work (local review loop, Copilot review loop, thread resolution). For durable policy see `INSTRUCTIONS.md`. For day-to-day workflow procedures see `OPERATIONS.md`. For clickstop/workboard lifecycle see `TRACKING.md`.

<!-- OPERATIONS.md and TRACKING.md are created by CS45-2 and CS45-4 (parallel with this PR); once both land the references above can be upgraded from code spans to markdown links. -->

## Local Review Loop (GPT 5.4)

Before requesting Copilot PR review, sub-agents **must** run a local review loop using the `code-review` agent with model `gpt-5.4`. This catches issues in ~60 seconds vs the 2-10 minute Copilot polling cycle.

**Local review procedure:**
1. After pushing changes and creating the PR, launch a local review:
   ```
   task agent_type=code-review model=gpt-5.4:
     "Review changes on branch <branch-name> in <worktree-path>.
      Run `git --no-pager diff main...HEAD` to see changes.
      Focus on: bugs, security, correctness, broken links, factual accuracy.
      Only flag issues that genuinely matter."
   ```
2. Address all issues found by the local review — commit fixes
3. Re-run the local review until clean (no issues found)
4. **Then** proceed to Copilot review or skip, based on PR type:

**Documenting review findings:**
After each local review round, update the PR description with a log of findings and fixes:
```
### Local Review Log
| Round | Finding | Fix |
|-------|---------|-----|
| 1 | CONTEXT.md workflow text still says "pre-branch-protection" | Fixed in [`abc1234`](commit-url) |
| 2 | CS26-8 references WORKBOARD.md instead of INSTRUCTIONS.md | Fixed in [`def5678`](commit-url) |
| 3 | Clean — no issues found | — |
```
This preserves the review audit trail in the PR for future reference.

**PR type determines Copilot review requirement:**

| PR Type | Local Review | Copilot Review | Rationale |
|---------|-------------|----------------|-----------|
| **Code changes** (features, fixes, refactors) | ✅ Required | ✅ Required | Code needs both fast local + thorough Copilot review |
| **Docs-only** (clickstop files, CONTEXT.md, README, INSTRUCTIONS.md) | ✅ Required | ⏭️ Skip | Local review is sufficient; Copilot review adds 10+ min overhead for no additional value |
| **Config/CI changes** (workflows, Dockerfile, docker-compose) | ✅ Required | ✅ Required | Security-sensitive changes need Copilot review |

**Docs-only PR definition:** A PR is docs-only if it modifies ONLY files with extensions `.md`, or files anywhere under `project/clickstops/` (including the `planned/`, `active/`, and `done/` subdirectories). If ANY non-docs file is changed, treat it as a code PR.

**Copilot PR Review Policy:**
- Every code/config PR must be reviewed by Copilot before merging (docs-only PRs may skip — see Local Review Loop above)
- Categorize comments as **Fix** (real bugs, security, correctness), **Skip** (cosmetic, by-design), or **Accept suggestion** (correct code improvement)
- Fix valid issues, reply with rationale on each thread, resolve all threads
- If Copilot re-reviews after fixes, repeat the cycle

**Copilot Review — Detailed Workflow:**

Requesting review (requires gh CLI ≥ 2.88.0): `gh pr edit <PR#> --add-reviewer "@copilot"`

**Review loop (repeat until clean):**
1. Read all review comments and suggestions
2. Categorize each as **Fix** (real bugs, security, correctness), **Skip** (cosmetic, by-design), or **Accept suggestion** (correct code improvement)
3. Reply to each comment with disposition and rationale, then fix valid issues
4. Resolve all threads (fixed or acknowledged) — always reply BEFORE resolving
5. Re-request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"`
6. Repeat from step 1 until Copilot approves with no new comments

**Waiting for Copilot Review (CRITICAL):**

After requesting review, Copilot takes **2–5 minutes** to post its review. **DO NOT** assume an empty review list means approval — it means Copilot hasn't responded yet. Poll every 60 seconds, up to 10 times (10 minutes total). After 10 attempts, report a timeout to the orchestrating agent. Compare Copilot review count before/after using:
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

**Reply conventions:** Fixed → reference commit hash. Acknowledged (by design) → explain rationale. Not applicable → note why observation is incorrect. Duplicate → reference original thread.

**Resolving review threads (GraphQL API):**
```powershell
# Get unresolved thread IDs
gh api graphql -f query='{ repository(owner: "henrik-me", name: "guesswhatisnext") { pullRequest(number: {PR#}) { reviewThreads(first: 100) { nodes { id isResolved comments(first: 1) { nodes { databaseId path } } } } } } }'

# Resolve a thread
gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "THREAD_ID" }) { thread { isResolved } } }'
```

**Large-diff PR behavior:** On large diffs, Copilot may re-post comments on unchanged lines. When comments reference already-fixed code, reply with the fix commit hash and resolve.
