# CS70 — Role Change JWT Invalidation

**Status:** ⬜ Planned
**Depends on:** none
**Parallel-safe with:** any (touches `server/auth/`, `server/middleware/auth.js`, and admin role-change routes; no overlap with current CS work)
**Origin:** Carve-out from architecture review issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) finding G ("auth and integrity controls"). The umbrella finding bundled token refresh + revocation + role-change invalidation + moderation audit; the first three are large feature work, but **role-change invalidation is a small, real security gap** worth filing on its own. Filed by `yoga-gwn-c4` 2026-04-30 during issue triage.

## Problem

When an admin demotes a user from `admin` (or any elevated role) to a lower role, the demoted user's existing JWT continues to carry the old `role` claim until natural token expiry. Because role checks read the JWT claim (not a fresh DB lookup), the demoted user retains admin access for the remainder of their token TTL.

Concrete impact:

- A revoked admin can continue calling admin-only endpoints (community-puzzle moderation, ranked-puzzle seeding, game-config writes, etc.) until their JWT expires.
- A user whose account is suspended or banned can keep using the app on their existing token.
- There is no operator-side mechanism to force-revoke a session after the role change is committed in the DB.

This is a real authorization gap with a small, bounded fix surface — no need for a full token-revocation infrastructure (CS-G-equivalent) to address it.

## Goal

Make role-change effective **immediately** for the affected user, without waiting on JWT TTL, while keeping the change surface small (no token-blacklist store, no refresh-token redesign).

## Approach (proposed)

Pick **one** of the following at planning-rubber-duck time; both are bounded:

1. **Per-user `role_version` / `token_epoch` column.** Add an integer column to `users` (default `0`). Bump it whenever role changes. Embed `role_version` as a JWT claim at issue time. The auth middleware validates `claim.role_version === user.role_version` on every authenticated request (one indexed lookup per request — already happens for user hydration on most routes; fold into existing query). Mismatch ⇒ 401, client must re-login.

2. **Issued-after timestamp + per-user `tokens_invalidated_at`.** Same shape but compares JWT `iat` against the user's `tokens_invalidated_at` column.

Either approach:
- Adds **one column + one comparison** in the auth middleware path.
- Requires no token store, no Redis, no refresh-token rotation.
- Survives the SQLite ↔ MSSQL split (single nullable INT column).
- Is reversible — if it causes incidents, the comparison can be feature-flagged off.

## Tasks

| Task ID | Title | Notes |
|---------|-------|-------|
| CS70-1 | Design + rubber-duck (pick approach 1 vs 2) | Decide on `role_version` vs `tokens_invalidated_at`. Capture in a follow-up edit to this file. |
| CS70-2 | DB migration + JWT issuance change | Add column, bump on role change, embed claim at sign-in. Both SQLite + MSSQL adapters. |
| CS70-3 | Middleware enforcement | Validate claim against current user value on every auth-required request. 401 + clear-cookie on mismatch. |
| CS70-4 | E2E test | Admin promotes user → user logs in → admin demotes user → user's next request returns 401. |
| CS70-5 | Telemetry + observability | Pino warn + App Insights custom event on `role_version_mismatch`; KQL in [`docs/observability.md`](../../../docs/observability.md). |

## Acceptance

- A user whose role is changed in the DB receives `401` on their next authenticated request without waiting for JWT expiry.
- E2E test (CS70-4) demonstrates the flow end-to-end (promote → login → demote → 401).
- Telemetry signal exists with a documented KQL (CS70-5) so operators can observe mismatches in production.
- All existing auth E2E tests still pass; no measurable regression in p50/p95 latency on `/api/*` (one extra integer compare per request, no extra DB call if folded into existing user-hydration query).
- `docs/observability.md` includes the new KQL query.
- `## Container Validation` and `## Telemetry Validation` sections in the implementing PR per CONVENTIONS gates.

## Cross-references

- Architecture review issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) finding G (parent).
- [`server/middleware/auth.js`](../../../server/middleware/auth.js) — JWT issuance + auth enforcement.
- [CONVENTIONS.md § Database & Data](../../../CONVENTIONS.md#database--data) — DB rules.
- [CONVENTIONS.md § 4a Telemetry & Observability](../../../CONVENTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work) — telemetry gate.

## Out of scope

- General token revocation list / blacklist store.
- Refresh-token rotation.
- Moderation audit log (also from issue #198 finding G — separate future CS if/when needed).
- Forced logout of *all* sessions globally (only the affected user's sessions are invalidated).
