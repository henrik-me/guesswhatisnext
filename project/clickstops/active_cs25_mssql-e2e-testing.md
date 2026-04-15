# CS25 — MSSQL E2E Testing

**Status:** 🔄 In Progress
**Goal:** Create E2E tests that run against the Docker MSSQL stack to validate application flows work end-to-end with the MSSQL backend.

**Deferred from:** [CS19 — Community Puzzle Navigation & Testing](done_cs19_community-puzzle-navigation.md) (task CS19-4)
**Reason deferred:** Docker MSSQL E2E testing requires additional infrastructure setup beyond the scope of the CS19 navigation changes. The MSSQL Docker stack (`docker-compose.mssql.yml`) was set up as part of CS18 but E2E test automation against it has not been implemented yet.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-1 | Create MSSQL E2E test runner | ⬜ Pending | Set up a test configuration that starts the app against the Docker MSSQL stack (`docker-compose.mssql.yml`) and runs Playwright E2E tests against it. |
| CS25-2 | Validate puzzle submission flows on MSSQL | ⬜ Pending | Run community puzzle submission E2E tests (create, edit, delete, moderate) against MSSQL backend. Verify SQL rewriting handles all submission queries. Originally CS19-4. |
| CS25-3 | Validate core game flows on MSSQL | ⬜ Pending | Run auth, freeplay, daily challenge, and leaderboard E2E tests against MSSQL to verify broader compatibility. |
| CS25-4 | Add CI integration for MSSQL E2E | ⬜ Pending | Consider adding a CI workflow or job that runs E2E tests against MSSQL (may require Docker-in-Docker or service containers in GitHub Actions). |

---

## Design Decisions

- **Scope:** This covers E2E browser tests against MSSQL, not unit-level adapter tests (those already exist in `tests/mssql-adapter.test.js`).
- **Docker stack:** Uses the existing `docker-compose.mssql.yml` which includes SQL Server 2022 + Caddy HTTPS reverse proxy.
- **CI consideration:** GitHub Actions supports service containers, which could run SQL Server alongside E2E tests. Evaluate feasibility vs cost.
