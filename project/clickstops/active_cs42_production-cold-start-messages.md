# CS42 — Production Cold Start Progressive Messages

**Status:** 🔄 In Progress
**Goal:** Investigate why the progressive loading messages (friendly "waking up the database" UX) that appear during local cold-start testing do not show up in production when Azure SQL is auto-paused.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS42-1 | Investigate: why progressive messages don't appear in production | 🔄 In Progress | Compare local cold-start behavior vs production. Identify what's different about the request/response flow when Azure SQL is resuming. |
| CS42-2 | Plan fix based on findings | ⬜ Pending | Design solution once root cause is identified. |
| CS42-3 | Implement fix | ⬜ Pending | — |
| CS42-4 | Validate in production | ⬜ Pending | Verify progressive messages appear during Azure SQL cold start. |

---

## Investigation Notes

*To be filled during CS42-1.*
