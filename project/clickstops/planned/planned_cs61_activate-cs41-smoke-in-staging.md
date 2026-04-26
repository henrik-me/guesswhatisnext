# CS61 — Activate CS41 smoke validation in staging (seed gwn-smoke-bot inline)

**Status:** ⬜ Planned
**Origin:** CS41 close-out (2026-04-26) surfaced that staging deploys silently skip the entire CS41 validation chain (CS41-1 smoke, CS41-3 AI verify, CS41-12 old-rev smoke, CS41-5 rollback smoke) because staging uses container-local SQLite at `/tmp/game.db` ([staging-deploy.yml:476-477](../../../.github/workflows/staging-deploy.yml)) — every revision gets a fresh ephemeral DB, so `gwn-smoke-bot` (the user CS41-1's smoke logs in as) cannot be pre-seeded once via `scripts/setup-smoke-user.js` the way it's done for prod. The graceful-skip behavior is correct given current staging architecture, but the consequence is that **staging doesn't actually exercise any of CS41's runtime validation in real Azure infra** — only CI tests cover it. The first time the full flow runs against real Azure infra is when prod deploys.

**Filed by:** yoga-gwn-c2 (during CS41 close-out, in response to user question "why are these things not running in staging?").

## Goal

Make staging deploys actually exercise CS41's smoke + AI verify + ingest summary chain, so we catch CS41-validated regressions in staging before they reach prod. Use the cheapest possible approach: seed `gwn-smoke-bot` inline at deploy time against the freshly-deployed revision's SQLite, then proceed with smoke. No new Azure resource required.

**Out of scope (handled separately if at all):** moving staging to managed MSSQL is a different project (much larger; new Azure SQL resource; cost; relates to CS59 cost-soak verification). CS61 deliberately stays cheap so it can land immediately and unblock real staging validation.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS61-1 | **Inline smoke-bot seeding in staging deploy.** Add a workflow step that runs AFTER the new revision is deployed (at 0% traffic) and BEFORE CS41-12's old-rev smoke. The step calls a new `scripts/seed-smoke-user-via-api.js` that POSTs to `/api/auth/register` against the new revision's direct FQDN to create `gwn-smoke-bot` with the password from `secrets.SMOKE_USER_PASSWORD_STAGING`. Idempotent: if the user already exists (because the SQLite somehow persisted, or the script ran twice), the 400 "username taken" is treated as success. | ⬜ Pending | Cheaper than `scripts/setup-smoke-user.js` (which talks directly to the DB) — this version uses the public API so it works regardless of DB backend. |
| CS61-2 | **Drop the "skip if SMOKE_USER_PASSWORD_STAGING unset" branch** in CS41-1 / CS41-12 / CS41-5 staging steps (since the seed step in CS61-1 fails fast if the password is missing — same outcome but louder). Replace with hard-fail consistent with prod's behavior. | ⬜ Pending | Brings staging skip semantics in line with prod. Operator must set the secret before staging works — same contract as prod, mismatched today. |
| CS61-3 | **Verify end-to-end on next staging deploy.** After CS61-1 + CS61-2 land + operator sets `SMOKE_USER_PASSWORD_STAGING`, the next staging deploy should: (a) seed smoke-bot via API, (b) run CS41-12 old-rev smoke (against the OLD revision, which doesn't have the smoke-bot — caveat: see below), (c) run CS41-1 smoke against the new revision, (d) run CS41-3 AI verify, (e) traffic shift, (f) post-cutover summary. Confirm in workflow logs + AI staging that all rows appear. | ⬜ Pending | Verification, not new code. |
| CS61-4 | **Document the inline-seed pattern** in OPERATIONS.md alongside the existing "Deploy gates (CS41)" section added by CS41-10. Note explicitly that staging uses the inline-seed pattern while prod uses the persistent-user pattern. | ⬜ Pending | Docs-only. |
| CS61-5 | **Close** — move to `done/`, update WORKBOARD, summarize. | ⬜ Pending | Standard. |

## Caveat — CS41-12 against the OLD revision in staging

The OLD staging revision's SQLite was created when THAT revision was deployed. It was seeded with smoke-bot at THAT deploy's CS61-1 step (assuming CS61 has been live for at least one prior deploy). So CS41-12's smoke against the OLD revision SHOULD work — the smoke-bot exists in the OLD revision's `/tmp/game.db`.

**For the very first deploy after CS61 lands**: the OLD revision was deployed BEFORE CS61, so its SQLite has no smoke-bot. CS41-12 will fail. CS61-3 must document this expected one-deploy transition: the first post-CS61 deploy is allowed to fail at CS41-12, and the workflow will need a manual override (or just deploy twice — the second deploy will have smoke-bot in both old and new revisions).

Mitigations:
- Option (a): seed BOTH the old and new revision in CS61-1 — but this is messy (two FQDNs, two API calls) and the old revision is going away anyway.
- Option (b): document the one-time transition cost; first deploy after CS61 is expected to fail at CS41-12. Operator manually re-runs.
- Option (c): make CS41-12 graceful-skip in staging if the OLD revision lacks the smoke-bot user (detect via 401 from login → notice + skip).

**Recommend (c)** — keeps staging deployable indefinitely while still exercising CS41-12 in real life once both old and new revisions have been seeded.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Inline seed fails because the new revision is still cold-starting | LOW | CS61-1 calls the same poll-loop infrastructure CS41-1 uses; cold-start tolerance is built in. |
| Race: seed happens before app's startup migrations finish | MEDIUM | Wait for `/healthz` then `/api/features` (DB-touching) to return 200 before seeding — same warmup pattern as CS41-1's first phase. |
| `/api/auth/register` is rate-limited (5 per minute per IP per `auth.js:21-26`) | LOW | Each deploy seeds once; rate limit doesn't apply across deploys. |
| Seed succeeds but gwn-smoke-bot's password is wrong (stale secret) | LOW | The login step in CS41-1 will fail loudly if the password mismatches; operator rotates secret + re-deploys. |
| If CS61-2 lands first (without CS61-1), staging deploys hard-fail | HIGH | Strict ordering: CS61-1 lands AND is verified working before CS61-2 even opens a PR. |

## Acceptance criteria

- [ ] `scripts/seed-smoke-user-via-api.js` exists, has unit tests for the success / already-exists / cold-start / wrong-password paths.
- [ ] Staging deploy YAML has the seed step in the right position (after new-revision deploy, before CS41-12).
- [ ] On a real staging deploy: AI `gwn-ai-staging.requests` shows the CS41-1 smoke probes within 10 min (matching the CS41-3 contract).
- [ ] Skip behavior in CS41-1 / CS41-12 / CS41-5 staging steps is replaced with hard-fail when secret is missing (CS61-2).
- [ ] CS41-12 against the OLD revision either succeeds OR graceful-skips with a notice (per recommended mitigation (c) above).
- [ ] OPERATIONS.md "Deploy gates (CS41)" section documents the staging inline-seed pattern.
- [ ] All CS61 PRs include `## Container Validation` AND `## Telemetry Validation` sections per INSTRUCTIONS § 4a.

## Will not be done as part of this clickstop

- Moving staging to managed MSSQL (separate, larger CS — relates to CS59).
- Changing prod's persistent-user pattern (it's correct as-is for prod).
- Changing migration step behavior in staging (staging still uses `IF NOT EXISTS` migrations on startup — CS41-4's pre-deploy step stays no-op for staging until staging gets managed MSSQL).
- Smoke-bot data cleanup in staging (the bot's accumulated scores stay in /tmp/game.db, which gets recreated every revision anyway — no cleanup needed).

## Relationship to other clickstops

- **CS41** — predecessor; established the smoke + verify chain that this CS makes actually-runnable in staging.
- **CS59** — staging cost-soak verification; the inline-seed adds a known small amount of deterministic traffic per deploy that CS59-8 already accounts for.
- **CS54** — App Insights wiring; CS41-3 AI verify in staging starts producing real `gwn-ai-staging.requests` rows once CS61 lands.
- **Future CS for managed-MSSQL staging** (unfiled) — would supersede CS61's inline-seed approach with the prod-style persistent-user pattern.

## Pre-dispatch checklist

- [x] CS61 number verified free (highest existing was CS60).
- [x] Plan reflects user's explicit question + the recommended option from the orchestrator's response (Option A: seed inline at deploy).
- [ ] User reviews + approves before dispatch.
- [ ] After approval: claim CS61 in WORKBOARD, dispatch single sub-agent (small scope).
