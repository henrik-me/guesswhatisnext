// @ts-check
import { test, expect } from '@playwright/test';

test.describe('ProgressiveLoader warmup telemetry', () => {
  test('emits ux-events payload after retry-loop success', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await context.addInitScript(() => {
        navigator.sendBeacon = () => false;
      });

      const page = await context.newPage();
      let leaderboardHits = 0;

      await page.route(/\/api\/scores\/leaderboard/, async (route) => {
        leaderboardHits++;
        if (leaderboardHits === 1) {
          await route.fulfill({
            status: 503,
            headers: { 'Retry-After': '1' },
            contentType: 'application/json',
            body: JSON.stringify({ retryAfterMs: 1000 }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rows: [] }),
        });
      });

      await page.goto('/');
      const telemetryRequestPromise = page.waitForRequest('**/api/telemetry/ux-events');
      await page.click('[data-action="show-leaderboard"]');

      const req = await telemetryRequestPromise;
      const payload = JSON.parse(req.postData() || '{}');

      expect(payload).toMatchObject({
        event: 'progressiveLoader.warmupExhausted',
        screen: 'leaderboard',
        outcome: 'success',
      });
      expect(Number.isInteger(payload.attempts)).toBe(true);
      expect(payload.attempts).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(payload.totalWaitMs)).toBe(true);
      expect(payload.totalWaitMs).toBeGreaterThanOrEqual(0);
      expect(payload).not.toHaveProperty('environment');
      expect(leaderboardHits).toBeGreaterThanOrEqual(2);
    } finally {
      await context.close();
    }
  });
});
