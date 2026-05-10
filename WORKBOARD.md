# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required. **Run `npm run check:docs:strict` locally before every direct-to-main push** (WORKBOARD or clickstop plan files) — direct push admin-bypasses ALL required status checks alongside the PR requirement, so the linter never runs server-side. [CS77](project/clickstops/active/active_cs77_pre-push-docs-lint-hook.md) provides a husky `pre-push` hook that runs the linter automatically; activate per-clone with `npm install` (verify via `npm run check:hook`).

> **Last updated:** 2026-05-10T18:50Z


## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-30T03:30Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-05-02T18:38Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-30T03:20Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-30T03:38Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | 🟢 Active | 2026-04-29T16:52Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |
| omni-gwn-c3 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-29T16:48Z |
| _unassigned_ | — | — | 🟡 Placeholder | n/a |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS75 | **Scale prod to zero**<br>WT: `..\guesswhatisnext_cs75-1` (CS75-1) + `..\guesswhatisnext_cs75-3` (CS75-3) (yoga-gwn)<br>B:&nbsp; `yoga-gwn/cs75-1-min-replicas-zero` + `yoga-gwn/cs75-3-prod-scale-zero-docs` (PRs pending) | implementing | yoga-gwn | 2026-05-10T18:50Z | **Claimed by yoga-gwn 2026-05-10T18:50Z.** CS73 dependency satisfied (merged + verified, prod live on revision 0000025 / `ffccb0f`). Plan: (1) **CS75-1** = one-line YAML change in `.github/workflows/prod-deploy.yml` (`--min-replicas 1` → `0`), Copilot review required (CI workflow); (2) **CS75-3** = docs update (CONTEXT/INSTRUCTIONS/OPERATIONS/infra/health-monitor audit), GPT-5.5 review only (docs-only); both dispatched in parallel as separate PRs. Then orchestrator runs (3) **CS75-2** `az containerapp update --min-replicas 0` against live prod + revision check, (4) **file CS76** cost-soak spin-off, (5) **CS75-5** `prod-deploy.yml workflow_dispatch` end-to-end validation (operator approval click required at GH Environments gate; background watcher per trip-wire #1). Out of scope: CS76 7-day cost soak (separate CS), keep-warm pinger (rejected during planning), `maxReplicas` change. Cold-start trade-off explicitly accepted by user during planning 2026-05-08. Plan file: [active_cs75_scale-prod-to-zero.md](project/clickstops/active/active_cs75_scale-prod-to-zero.md). |
| CS60 | **Post CS54 Observability Followup**<br>WT: _(none — between daily ticks)_<br>B:&nbsp; _(no PR yet — next tick CS60-3p)_ | blocked | _unassigned_ | 2026-05-10T17:30Z | **Unassigned by yoga-gwn 2026-05-10T17:30Z** after closing CS60-3 backfill (PR [#335](https://github.com/henrik-me/guesswhatisnext/pull/335) merged `0d72172`) — Days 0-14 fully recorded with closed-day CM data (Days 8-14 new as CS60-3i..CS60-3o; Days 0-7 re-captured in place with audit-preserving annotations); +7d roll-up refreshed (closed-day 8-day total 17.76 DKK vs original 15.11, **+2.65 DKK** delta); +14d midpoint roll-up added; CS60-3 first-pass extrapolation refreshed → second-pass projection (30-day projection **75-81 DKK / ~$10.80-$11.55 USD**, **122.7-169.0 MB ingest = 2.40-3.30% of 5GB free tier** → headroom **>4 GB/month under every scenario** → CS60-4/5/6 dispositions empirically resolved). Material finding documented in appendix +14d roll-up: **Days 6-9 CM compute-meter gap** (Standard *Idle/Active Usage meters never emitted for either Container App on UTC days 2026-05-01..2026-05-04 despite 8-9 days post-closure; Container Apps platform metrics confirm both apps were running normally). Day 7 staging finding: original mid-day capture missed staging waking after T18:30Z; first true zero-replica full UTC day is now Day 8 (not Day 7). **Next pickup: CS60-3p (Day 15 = 2026-05-10)**, claimable from approximately **2026-05-11T01:00Z UTC** (once CM closes the 2026-05-10 UTC day; daily cadence thereafter through CS60-3{Day30} on 2026-05-25). Any orchestrator may claim. **Whether to file a separate CS for the Days 6-9 CM gap (Azure support ticket / Consumption Usage Details API cross-check) is deferred to CS60-7 close-out.** |
|  | _CS60-3 backfill merged via PR [#335](https://github.com/henrik-me/guesswhatisnext/pull/335) (`0d72172`, 2026-05-10T17:30Z) by yoga-gwn (sub-agent dispatched for data collection): Days 0-14 cost + AI ingest + Container Apps metrics fully recorded with closed-day CM data; daily ticks CS60-3i..CS60-3o marked ✅. Material deltas Days 0-7 (vs original partial captures): Day 1 +1.15 DKK, Day 4 +1.45 DKK, Day 7 +0.05 DKK, others ≤±0.01. Days 8-14 high-level: **prod traffic rising** (AI ingest 1.59 → 3.55 MB/day, AppDependencies = 70.4% of 14-day workspace ingest), **staging falling** (AI 1.16 → 0.06 MB/day, CS58 fully effective post-Day-7), **Day 8 prod replica spike to 3** + 48 exceptions (other days steady at 1, 0-3 exceptions/day), **Day 13 prod 68 exceptions + first AppTraces row** in 14-day window — both worth a brief look but no action triggered yet. Sub-agent local review: 3 rounds with code-review agent (gpt-5.5 floor), final outcome LOCAL_REVIEW_APPROVED clean. CS60-2 close-out (PR [#325](https://github.com/henrik-me/guesswhatisnext/pull/325), 669fe4e) data superseded by this re-capture; original numbers preserved in commit history + per-section Notes. Detail in [`cs60-data-appendix.md`](project/clickstops/active/cs60-data-appendix.md)._ |  |  |  |  |
> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.


