# CS39 — CI E2E Chromium Crashes

**Status:** ✅ Complete
**Goal:** Investigate and fix Chromium SEGFAULT crashes that cause E2E test failures in GitHub Actions CI. Tests pass 100% locally but 2–3 tests consistently crash in CI with Chromium process SIGSEGV.
**PRs:** #165, #166

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS39-1 | Analyze crash patterns | ✅ Done | 15 failed CI runs analyzed. 7 different tests across 5 spec files affected. All crashes are Chromium SEGFAULT (SharedImageManager GPU error). Zero assertion failures — every failure was a browser crash. |
| CS39-2 | Investigate runner environment | ✅ Done | Chromium headless shell 147 on ubuntu-latest. Tried Playwright update (1.58.2→1.59.1) and `--disable-gpu`/`--disable-software-rasterizer` flags. GPU flags didn't help — crash is at binary level, not GPU configuration. |
| CS39-3 | Implement fix | ✅ Done | Kept Playwright 1.59.1 update. Added per-test CI retries (2) via `process.env.CI` check in `playwright.config.mjs`. Reverted GPU flags (didn't fix crash, reduced test fidelity). |
| CS39-4 | Validate fix across multiple CI runs | ✅ Done | 5 parallel CI runs: 5/5 passed (100%). 1 run hit a crash → retry succeeded (marked flaky). Previous crash rate was 40% (2/5 without retries). |

---

## Crash Analysis Data

### Most frequently crashed tests (from 15 historical failures)

| Crashes | Test | Spec File |
|---------|------|-----------|
| 6 | button hidden when flag off (line 16) | community.spec.mjs |
| 5 | multiplayer visible after login (lines 90–91) | auth.spec.mjs |
| 3 | browse button hidden (line 21) | community.spec.mjs |
| 3 | preview renders (line 50) | moderation.spec.mjs |
| 2 | button hidden when logged out (line 38) | my-submissions.spec.mjs |
| 1 | auth token in error (line 152) | telemetry.spec.mjs |
| 1 | clicking login shows auth (line 32) | auth.spec.mjs |

### Crash signature

```
[pid=XXXX][err] Received signal 11 SEGV_MAPERR
[pid=XXXX][err] SharedImageManager::OnContextLost
[pid=XXXX][err] [end of stack trace]
```

All crashes are Chromium process SIGSEGV — not test assertion failures.

### Root cause

Chromium headless shell 147 on ubuntu-latest has a GPU-related crash in SharedImageManager. The crash is at the binary level — launch flags (`--disable-gpu`, `--disable-software-rasterizer`) do not prevent it. The fix is per-test retries in CI, which catches the rare crash and re-runs the test successfully.

### Fix applied

1. **Playwright 1.59.1** — updated from 1.58.2 (newer Chromium, better stability)
2. **Per-test CI retries (2)** — `retries: process.env.CI ? 2 : 0` in `playwright.config.mjs`
3. **GPU flags reverted** — `--disable-gpu`/`--disable-software-rasterizer` didn't fix crash and reduced test fidelity

### Validation results

- 5 parallel CI runs post-fix: **5/5 passed (100%)**
- 1 run hit a crash → retry succeeded → test marked flaky (expected behavior)
- Pre-fix crash rate: **40%** (2/5 runs failed without retries)

---

## Completion Checklist

- [x] All tasks done and merged
- [x] README updated — N/A (CI infrastructure, no user-facing changes)
- [x] INSTRUCTIONS.md updated — N/A (no architectural/workflow changes)
- [x] CONTEXT.md updated with final state
- [x] Tests added/updated — N/A (test config updated: per-test CI retries in playwright.config.mjs)
- [x] Performance/load test evaluation — N/A
- [x] Data structure changes documented — N/A
- [x] Staging deployed and verified — N/A (CI-only change)
- [x] Production deployed and verified — N/A (CI-only change, validated via 5 CI runs)
