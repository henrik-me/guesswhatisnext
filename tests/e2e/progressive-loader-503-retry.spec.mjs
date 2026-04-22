// @ts-check
/**
 * E2E tests for the ProgressiveLoader 503 auto-retry path (CS42-3).
 *
 * Uses page.route() interception (not delay middleware) to script deterministic
 * 503-then-200 sequences for /api/scores/leaderboard.
 *
 * Variant A: 503 with Retry-After header → message escalation visible,
 *            no Retry button, data renders after retry.
 * Variant B: 503 without retry signal (simulates SW offline fallback) →
 *            Retry button immediate, no auto-retry.
 */
import { test, expect } from '@playwright/test';

test.describe('ProgressiveLoader 503 Retry Path', () => {

  // Variant A ─────────────────────────────────────────────────────────
  // Multiple 503 responses with Retry-After → escalation messages visible,
  // then 200 → data renders, no Retry button ever shown.
  test('503 with Retry-After: message escalation visible, data renders after retry', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      await page.goto('/');

      let leaderboardHits = 0;
      const succeedAfter = 5; // first 4 calls → 503, 5th → stubbed 200

      await page.route(/\/api\/scores\/leaderboard/, async (route) => {
        leaderboardHits++;
        if (leaderboardHits < succeedAfter) {
          await route.fulfill({
            status: 503,
            headers: { 'Retry-After': '3' },
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          // Stubbed 200 — deterministic, no real DB dependency
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ leaderboard: [] }),
          });
        }
      });

      // Navigate to leaderboard
      await page.click('[data-action="show-leaderboard"]');
      await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

      const container = page.locator('[data-bind="leaderboard-table"]');

      // 0s — initial message
      await expect(container.locator('.progressive-message')).toContainText(
        'Fetching the rankings', { timeout: 5000 },
      );
      // No Retry button at this point
      await expect(container.locator('.progressive-retry-btn')).toHaveCount(0);

      // ~3s — "Tallying up everyone's scores" escalation message
      await expect(container.locator('.progressive-message')).toContainText(
        'Tallying up', { timeout: 8000 },
      );
      await expect(container.locator('.progressive-retry-btn')).toHaveCount(0);

      // ~6s — "coffee break ☕" escalation message
      await expect(container.locator('.progressive-message')).toContainText(
        'coffee break', { timeout: 12000 },
      );
      await expect(container.locator('.progressive-retry-btn')).toHaveCount(0);

      // ~10s — "Waking up the database" escalation message
      await expect(container.locator('.progressive-message')).toContainText(
        'Waking up', { timeout: 10000 },
      );
      await expect(container.locator('.progressive-retry-btn')).toHaveCount(0);

      // Data renders after the retry succeeds (empty leaderboard from stub)
      await expect(container.locator('.leaderboard-empty')).toBeVisible({ timeout: 15000 });

      // Confirm Retry button never appeared
      await expect(container.locator('.progressive-retry-btn')).toHaveCount(0);

      // Verify the endpoint was hit multiple times (retries happened)
      expect(leaderboardHits).toBeGreaterThanOrEqual(succeedAfter);
    } finally {
      await context.close();
    }
  });

  // Variant B ─────────────────────────────────────────────────────────
  // 503 with NO Retry-After header and NO retryAfter body field
  // (simulates the SW offline fallback at public/sw.js:79-85).
  // The ProgressiveLoader treats this as a non-retryable error →
  // Retry button appears immediately, no auto-retry.
  test('503 without retry signal: Retry button immediately, no auto-retry', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      await page.goto('/');

      let leaderboardHits = 0;

      await page.route(/\/api\/scores\/leaderboard/, async (route) => {
        leaderboardHits++;
        // 503 with NO retry signal — simulates SW offline fallback
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service unavailable' }),
        });
      });

      // Navigate to leaderboard
      await page.click('[data-action="show-leaderboard"]');
      await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

      const container = page.locator('[data-bind="leaderboard-table"]');

      // Retry button should appear quickly (no auto-retry, no escalation wait)
      await expect(container.locator('.progressive-retry-btn')).toBeVisible({ timeout: 10000 });

      // Endpoint was hit exactly once — no auto-retry occurred
      expect(leaderboardHits).toBe(1);
    } finally {
      await context.close();
    }
  });
});
