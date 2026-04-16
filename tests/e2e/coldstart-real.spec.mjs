// @ts-check
/**
 * Cold Start E2E Tests — validates progressive loading UX with REAL server delays.
 *
 * These tests run against the MSSQL Docker stack with the delay overlay enabled
 * (docker-compose.mssql.delay.yml). The delay middleware injects real latency into
 * API responses, cycling through a pattern (default: 45s, 16s, 0, 0, 0, 0).
 *
 * IMPORTANT: The delay pattern is server-side state shared across ALL tests.
 * Tests run serially and each consumes pattern steps. The tests are ordered so
 * that step 0 (45s) is consumed first, step 1 (16s) second, etc.
 *
 * Prerequisites:
 *   npm run dev:mssql:coldstart
 *   bash scripts/wait-for-healthy.sh https://localhost
 *
 * Run:
 *   GWN_COLDSTART_TEST=true BASE_URL=https://localhost SYSTEM_API_KEY=test-system-api-key \
 *     npx playwright test tests/e2e/coldstart-real.spec.mjs
 *
 * These tests are SLOW by design (45s+ waits) and are skipped unless both
 * BASE_URL and GWN_COLDSTART_TEST=true are set.
 */
import { test, expect } from '@playwright/test';

const isEnabled = process.env.BASE_URL && process.env.GWN_COLDSTART_TEST === 'true';

// Skip the entire file when not in cold start mode
test.skip(!isEnabled, 'Cold start tests require BASE_URL and GWN_COLDSTART_TEST=true');

// Retries must be disabled because any retry would consume the wrong delay-pattern step.
test.describe.configure({ mode: 'serial', retries: 0, timeout: 120000 });

test.describe('Cold Start — Real Server Delays', () => {
  // Test 1 — Pattern step 0 (45s delay): progressive message + retry button
  test('progressive message and retry on first navigation (45s delay)', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    await page.goto('/');

    // Navigate to leaderboard — first API call hits the 45s delay step
    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    // The progressive loading message should appear almost immediately
    const container = page.locator('[data-bind="leaderboard-table"]');
    await expect(container.locator('.progressive-message')).toBeVisible({ timeout: 5000 });

    const messageText = await container.locator('.progressive-message').textContent();
    expect(messageText).toContain('Fetching the rankings');

    // The 45s delay exceeds the 15s ProgressiveLoader timeout, so retry should appear
    await expect(container.locator('.progressive-retry-btn')).toBeVisible({ timeout: 25000 });

    await context.close();
  });

  // Test 2 — Pattern step 1 (16s delay): retry button works, clicking retries the fetch
  // After test 1 consumed step 0, this test gets step 1 (16s — above the 15s timeout).
  test('retry button works — clicking retry re-fetches data', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    await page.goto('/');

    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    const container = page.locator('[data-bind="leaderboard-table"]');

    // Step 1 (16s) is above the 15s ProgressiveLoader timeout — retry button should appear.
    await expect(container.locator('.progressive-retry-btn')).toBeVisible({ timeout: 25000 });

    // By the time retry is visible, the gap since the delayed request is already >2s,
    // so the delay middleware will advance to step 2 (0ms) without any extra wait.
    // Click retry — step 2 has 0ms delay, so data should load immediately
    await container.locator('.progressive-retry-btn').click();

    // After retry with 0ms delay, data (or empty state) should appear quickly
    await expect(
      container.locator('.leaderboard-row').first()
        .or(container.locator('.leaderboard-empty'))
    ).toBeVisible({ timeout: 15000 });

    await context.close();
  });

  // Test 3 — Pattern steps 3+ (0ms delay): instant load, no progressive UX
  // After tests 1 and 2 consumed steps 0–2, this test gets step 3 (0ms delay).
  test('subsequent navigations load instantly (0ms delay)', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();

    await page.goto('/');

    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    const container = page.locator('[data-bind="leaderboard-table"]');

    // With 0ms delay, data should load within 10s and should not require retry UI
    await expect(
      container.locator('.leaderboard-row').first()
        .or(container.locator('.leaderboard-empty'))
    ).toBeVisible({ timeout: 10000 });
    await expect(container.locator('.progressive-retry-btn')).toBeHidden();

    await context.close();
  });
});
