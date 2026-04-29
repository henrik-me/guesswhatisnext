# Quick Reference Checklist

Re-read this section after every `git pull`, even if INSTRUCTIONS.md didn't change.

- Claiming a clickstop → update WORKBOARD.md (commit+push), rename CS file to active_, update content, commit to main
- Closing a clickstop → rename CS file to done_, move to `project/clickstops/done/`, update content with results, remove from WORKBOARD.md
- Preferred model: Claude Opus (4.7 or higher, 1M context variant when available) for both orchestrators and sub-agents, GPT (5.5 or higher) for reviews
- CS number conflicts → check done_, active_, AND planned_ files before picking a new number
- After claiming a task → prompt user to rename session: `/rename [{agent-id}]-{task-id}: {clickstop name}`
- When planning a CS, favor structures that allow parallel work. Use `<phase><letter>` (e.g. `CS65-1a`, `CS65-1b`) for parallel-safe siblings; use sequential numbers (`CS65-1`, `CS65-2`) only when a true ordering dependency exists. State `**Depends on:**` and `**Parallel-safe with:**` in the plan-file frontmatter so other orchestrators can pick up work without re-reading prose. See [§ Naming Conventions in TRACKING.md](TRACKING.md#naming-conventions) for the canonical format.
- These planning conventions apply to clickstop CS work only. Ad-hoc orchestrator work (deploys, quick fixes, investigations not yet a CS) continues to use the `OPS-<short-name>` WORKBOARD placeholder pattern with no plan file and no frontmatter — see [§ WORKBOARD.md — Live Coordination in TRACKING.md](TRACKING.md#workboardmd--live-coordination).
- Session start → `git pull`, then **derive your agent ID from `hostname`** as `{first-meaningful-hostname-segment-lowercase}-gwn[-c<N> if folder is `guesswhatisnext_copilot<N>`]` per [§ Agent Identification in TRACKING.md](TRACKING.md#agent-identification). Examples: `HENRIKM-YOGA` → `yoga-gwn`, `HENRIKM-OMNI` (in `…\guesswhatisnext_copilot3`) → `omni-gwn-c3`. NEVER infer agent ID from cwd path alone — multiple machines share identical folder layouts. (The first-response requirement is in the next bullet, alongside the reread receipt.)
- Session-start full reread (mandatory baseline) → at the start of every orchestrator run — including brand-new sessions, fresh repo clones, and any restored or resumed session (treat resume as session start for this rule) — view the entire `INSTRUCTIONS.md` (use multiple `view_range` calls if it exceeds the 50KB single-read cap) and, in your first response, explicitly state both your derived agent ID and `INSTRUCTIONS.md re-read complete @ <SHA>` before doing other work. Do this even if the session-start `git pull` was a no-op. The pull-driven re-read (next bullet) is incremental on top of this baseline. "I read it carefully" is not a substitute for the verifiable receipt.
- After every `git pull` → re-read this checklist (always, even on a no-op pull). Additionally, if the pull was non-empty AND its diff touches `INSTRUCTIONS.md`, repeat the full-file reread + receipt for the new SHA per the previous bullet. A no-op pull does NOT trigger the full-file reread on its own; the session-start reread already covered that.
- Never do implementation work in main checkout — dispatch to worktree sub-agents
- Never modify files related to another agent's active task — check WORKBOARD.md first
- Maximize parallelism — dispatch independent tasks simultaneously
- Update WORKBOARD.md Active Work when starting ANY work, not just clickstop tasks — use a non-empty `CS-Task ID` placeholder (e.g. `OPS-…`) for non-CS work; see [§ WORKBOARD entry template in TRACKING.md](TRACKING.md#workboard-entry-template) for the canonical 6-column / 2-row-per-entry shape
- Update WORKBOARD.md immediately on task claim/complete — commit AND push (use ISO datetime: `2026-04-12T18:27Z`)
- Only modify your own rows in WORKBOARD.md Active Work (both the status row and its description-continuation row count as your row)
- Check CS number conflicts before creating new clickstops
- Commit clickstop plan file to main BEFORE starting implementation work
- Deferred items → must land in a CS via one of four dispositions (add to current CS / file new `planned_` CS / add to existing planned-or-active CS / cancel with reason). Appendix-in-done-file alone is INSUFFICIENT — see [§ Deferred work policy in TRACKING.md](TRACKING.md#clickstop-completion-checklist). Never silently drop.
- Sub-agent prompts must include full Sub-Agent Checklist verbatim
- Sub-agent checklist canonical source: [docs/sub-agent-checklist.md](docs/sub-agent-checklist.md). OPERATIONS.md § Sub-Agent Checklist is the policy framing; the file is the verbatim list.
- Run local review loop (GPT 5.5 or higher) before Copilot review — skip Copilot for docs-only PRs
- Copilot review is MANDATORY for any PR touching server/client/scripts/tests/CI-workflows/Dockerfile/docker-compose/infra. Only docs-only PRs (only `.md` or `project/clickstops/**` changed) may skip per [REVIEWS.md PR-type matrix](REVIEWS.md#local-review-loop). Merging a non-docs PR without Copilot review is a process violation.
- Copilot's latest review being **COMMENTED with no new comments** AND **all inline threads resolved** AND **CI green** AND **local review clean** = effective APPROVAL. This is the normal merge gate, not an exception. Use `gh pr merge --squash --admin` (the Copilot bot does not issue APPROVED in this repo). Do NOT block waiting for an APPROVED state.
- For each Copilot review comment: reply with disposition + commit SHA in the format `Fixed in abc1234: <one-line>` (for fixes), `Skip — by design: <rationale>` (for skips), or `Not applicable: <why>` (for invalid findings) — THEN resolve the thread. Reply BEFORE resolving. Empty resolution without a reply is a process violation.
- Report progress to user after dispatching agents — never go silent; relay every sub-agent turn/state transition the same turn it lands, post a heartbeat update at least every ~10 min if nothing has transitioned, and on each heartbeat check the fallback progress signals (branch commits, PR state, file mtimes, `tool_calls_completed`) before claiming the agent is idle (see [§ Agent Progress Reporting in OPERATIONS.md](OPERATIONS.md#agent-progress-reporting) and [§ Fallback progress signals in OPERATIONS.md](OPERATIONS.md#fallback-progress-signals-when-sub-agent-is-silent))
- Commit after each meaningful step — don't batch unrelated changes
- Record local review findings in PR description
- Do not remove task from WORKBOARD.md until PR is merged and task is fully complete
- When removing content from INSTRUCTIONS.md, ensure it lands in CONTEXT.md or README.md — no information loss
- Never skip any part of the process without asking the user first — no self-decided shortcuts
- The process applies to all changes regardless of size — there is no "too small for a PR" threshold
- **No DB-waking background work**: no timer/watchdog/scheduler/poller may issue a DB query (incl. `SELECT 1`) on its own — the DB is touched only in response to real user requests, operator curl, or operator-invoked batch jobs (see [§ Database & Data in CONVENTIONS.md](CONVENTIONS.md#database--data))
- **Cold-start container validation gates check-in**: any PR touching server/client runtime or DB-touching code must run `npm run container:validate` (full restart + smoke probe) before each review request and after each fix push, and record the result in `## Container Validation` in the PR body (see [§ Cold-start container validation in OPERATIONS.md](OPERATIONS.md#cold-start-container-validation))
- **Telemetry & observability gate (mandatory)**: any PR adding/changing a code path, error path, dependency call, or background activity MUST add the matching telemetry signal AND a documented KQL query in [`docs/observability.md`](docs/observability.md) AND validate the signal across local container + staging + production. Record results in `## Telemetry Validation` in the PR body (see [§ 4a Telemetry & Observability in CONVENTIONS.md](CONVENTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work)). No "too small for telemetry" exemption.
- **Pre-prod validation gate is in CI, not Azure staging**: the enforced gate before a production deploy is the Ephemeral Smoke Test job in [`.github/workflows/staging-deploy.yml`](.github/workflows/staging-deploy.yml) plus local `npm run container:validate` cycles per [§ Database & Data in CONVENTIONS.md](CONVENTIONS.md#database--data). The Azure `gwn-staging` Container App is being moved to scale-to-zero (live state tracks [CS58-1/CS58-2](project/clickstops/done/done_cs58_scale-staging-to-zero.md)) and exists only for ad-hoc operator probing — it is not a release gate. See [§ Waking staging for ad-hoc validation in OPERATIONS.md](OPERATIONS.md#waking-staging-for-ad-hoc-validation).
- **Investigation artifacts → `shots/`** (gitignored): screenshots, repro captures, HAR-supplementary images go in top-level `shots/` named `[<orchestrator-id>][<CS-ID>-<TASK-ID>] <desc>.<ext>` (see [§ Investigation artifacts](#investigation-artifacts))
- **Never rename a branch with an open PR.** GitHub's branch-rename API does NOT migrate the open PR's `head.ref` — the PR auto-closes and a fresh PR must be opened from the renamed branch (with body + cross-link reproduced manually). Hit on PR #241 → #255 in CS53-23. If a branch needs renaming, close the PR first, then rename, then open a new PR with the cross-link.
- **PR descriptions with non-ASCII (em-dashes, §, ✅, etc.) — use `gh pr edit --body-file <utf8.md>`, NOT `--body "$here_string"`.** PowerShell here-strings mangle UTF-8 when piped to `gh pr edit --body` (— → `╬ô├ç├╢`, § → `Γö¼┬║`). Always write the body to a UTF-8 file and pass `--body-file` (also avoids shell-quoting headaches on multi-line bodies). Hit twice on PR #255.
- **Long-running PR + churning main: owner-approved `--admin` squash merge is the escape hatch from infinite-rebase loops** — repository owner / delegated admin only, and only after explicit user approval for the up-to-date bypass. Branch protection requires up-to-date branches and `gh pr merge --auto` is disabled in this repo, so a normal orchestrator cannot bypass that rule on its own. This is separate from the normal Copilot-clean merge gate above. See [§ Long-running PRs in fast-churning main in OPERATIONS.md](OPERATIONS.md#long-running-prs-in-fast-churning-main) for the full procedure (CI-green threshold, merge-tree sanity check, audit-trail comment) and [§ WORKBOARD.md — Live Coordination in TRACKING.md](TRACKING.md#workboardmd--live-coordination) for the broader owner-only-bypass framing.

---

---

# Development Instructions

INSTRUCTIONS.md is the orchestrator workflow Quick Reference and holds only orchestrator-facing daily workflow rules. For code/test/architecture/logging/telemetry conventions, see [CONVENTIONS.md](CONVENTIONS.md). For agent workflow procedures see [OPERATIONS.md](OPERATIONS.md); for review procedures see [REVIEWS.md](REVIEWS.md); for clickstop/workboard lifecycle see [TRACKING.md](TRACKING.md).

- [CONVENTIONS.md](CONVENTIONS.md) — architecture principles, coding guidelines, testing strategy, logging, telemetry, git commit conventions, database/data rules, documentation conventions, performance, and accessibility
- [OPERATIONS.md](OPERATIONS.md) — agent workflow, parallelism, deployment, branch/merge model
- [REVIEWS.md](REVIEWS.md) — local review loop, Copilot PR review policy, review comment handling
- [TRACKING.md](TRACKING.md) — clickstop lifecycle, WORKBOARD state machine, CONTEXT update protocol

For current project state and codebase architecture, see **CONTEXT.md**. For active/planned/done clickstops, browse `project/clickstops/{active,planned,done}/` (run `git pull` first). For live work coordination, see **WORKBOARD.md**. For architecture decisions and learnings, see **LEARNINGS.md**.

---

## Orchestrator-only workflow notes

Sub-agents performing code or documentation changes should read [CONVENTIONS.md](CONVENTIONS.md) before implementation; orchestrators should keep using the Quick Reference Checklist above as the daily workflow entry point.

---

## Investigation artifacts

Transient visual artifacts produced while investigating bugs or validating clickstops — screenshots, repro captures, HAR-supplementary images, container-state snapshots — live in a top-level `shots/` directory.

**Location:** `shots/` at the repo root. Gitignored (see [`.gitignore`](.gitignore)). These files routinely contain JWTs in URLs, user PII visible in UI screenshots, and internal/staging URLs — they must never be committed. They are working artifacts, not source.

**Naming convention:** `[<orchestrator-id>][<CS-ID>-<TASK-ID>] <short-description>.<ext>`

Examples:
- `[yoga-gwn][CS53-11] 01-loaded.png`
- `[yoga-gwn-c2][CS53-5] profile-direct.png`
- `[yoga-gwn][CS53-19] warm-boot-network.har`

The `<orchestrator-id>` matches the `<machine>-gwn[-cN]` format in [WORKBOARD.md](WORKBOARD.md)'s Orchestrators table. The `[CS-ID-TASK-ID]` prefix mirrors how clickstop+task IDs already prefix branches and PRs, so artifacts are searchable and attributable in cross-agent worktree setups.

**Lifecycle:** delete shots once the underlying CS task is closed, unless they're cited from a doc that needs them. They are working artifacts — do not let them accumulate indefinitely.

---

## Production deploys — approval gate is on the user

`prod-deploy.yml` uses GitHub Environment `production` with required reviewers. After `gh workflow run prod-deploy.yml ...` is dispatched, the run sits in **`waiting`** state until a human reviewer clicks **Approve** in the GitHub Actions UI. The workflow does **not** progress on its own.

**Orchestrator rule when triggering a prod deploy:** the response that triggers the deploy MUST surface the approval state prominently. Recommended template:

> ⚠️ **Production deploy `<run-id>` is now waiting on YOUR approval.**
> Approve here: `https://github.com/<owner>/<repo>/actions/runs/<run-id>`
> Image: `<sha>`. Replaces: `<previous-sha>`. Watcher will resume once you click Approve.

Do not bury the approval link inside a status table. Do not assume the user is watching the Actions tab. The deploy is blocked on them, and the orchestrator's job is to make that blocking state unmissable.

Staging deploys have no such gate (they auto-run when `vars.STAGING_AUTO_DEPLOY == 'true'` *or* when triggered via `workflow_dispatch`), so this rule is production-only. Note that Azure `gwn-staging` is being moved to `minReplicas: 0` (scale-to-zero, live state tracks [CS58-1/CS58-2](project/clickstops/done/done_cs58_scale-staging-to-zero.md)) and is not a pre-prod release gate — the enforced gate is the in-CI Ephemeral Smoke Test job in [`.github/workflows/staging-deploy.yml`](.github/workflows/staging-deploy.yml) plus local `npm run container:validate` cycles. See [§ Waking staging for ad-hoc validation in OPERATIONS.md](OPERATIONS.md#waking-staging-for-ad-hoc-validation) for the operator probe procedure.
