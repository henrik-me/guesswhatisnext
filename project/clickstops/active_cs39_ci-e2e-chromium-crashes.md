# Clickstop CS39: CI E2E Chromium Crashes

**Status:** ⬜ Planned
**Goal:** Investigate and fix Chromium SEGFAULT crashes that cause E2E test failures in GitHub Actions CI. Tests pass 100% locally but 2-3 tests consistently crash in CI with Chromium process SIGSEGV.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS39-1 | Analyze crash patterns | ⬜ Pending | — | Review CI logs across recent PRs to determine: which tests crash, is it random or specific tests, crash frequency, register dump patterns. Check if crashes correlate with specific test actions (e.g., navigation, auth, heavy DOM manipulation). |
| CS39-2 | Investigate runner environment | ⬜ Pending | CS39-1 | Check Chromium version on CI runner vs local, runner memory/CPU limits, missing system dependencies. Compare CI playwright config with local. Check if `--disable-gpu`, `--no-sandbox`, or other Chromium flags help. |
| CS39-3 | Implement fix | ⬜ Pending | CS39-2 | Options: update Playwright/Chromium version, add Chromium launch flags, increase runner resources, add per-test retries in CI only, split test shards. |
| CS39-4 | Validate fix across multiple CI runs | ⬜ Pending | CS39-3 | Run CI multiple times to confirm crashes are eliminated, not just masked. |

## Known Crash Details

**Affected tests (from recent CI runs):**
- `auth.spec.mjs:90` — "multiplayer button is visible after login"
- `moderation.spec.mjs:50` — "preview renders in moderation queue"
- `community.spec.mjs:16` — "community puzzles button is hidden on home screen when flag is off"

**Crash signature:**
```
[pid=XXXX][err] Received signal 11 SEGV_MAPERR
[pid=XXXX][err] [end of stack trace]
```
This is a Chromium process crash (SIGSEGV), not a test assertion failure.

**Environment:**
- CI: GitHub Actions ubuntu-latest runner
- Local: Windows (passes 62/62)
- Playwright version: check package.json

## Notes

- These crashes are NOT test logic failures — the Chromium browser process itself segfaults
- Tests pass 100% locally on Windows — this is CI-specific
- May be related to the runner's Chromium/system library versions
- CS34 (deprecated Node.js 20 actions) is separate but the overall CI runner environment may contribute
