// @ts-check
import { test, expect } from '@playwright/test';
import { uniqueIP } from './helpers.mjs';

test.describe('Progressive Loading', () => {
  test('leaderboard renders after progressive loading', async ({ page }) => {
    await page.goto('/');

    // Click the leaderboard button
    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    // The leaderboard container should eventually show content (rows, empty, or retry)
    const container = page.locator('[data-bind="leaderboard-table"]');
    await expect(
      container.locator('.leaderboard-row').first().or(container.locator('.leaderboard-empty')).or(container.locator('.progressive-retry-btn'))
    ).toBeVisible({ timeout: 15000 });
  });

  test('leaderboard progressive message appears with slow response', async ({ browser }) => {
    // Use a fresh context with service workers disabled to avoid caching interference
    const context = await browser.newContext({
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    await page.goto('/');

    // Set up route interception for the leaderboard API
    await page.route(/\/api\/scores\/leaderboard/, async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ leaderboard: [] }),
      });
    });

    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    // With the 2s delay, the progressive message should be visible
    const container = page.locator('[data-bind="leaderboard-table"]');
    await expect(container.locator('.progressive-message')).toBeVisible({ timeout: 5000 });
    const messageText = await container.locator('.progressive-message').textContent();
    expect(messageText).toContain('Fetching the rankings');

    // Eventually the leaderboard empty state shows
    await expect(container.locator('.leaderboard-empty')).toBeVisible({ timeout: 15000 });
    await context.close();
  });

  test('achievements renders after progressive loading', async ({ page }) => {
    const username = `prog${Date.now().toString(36)}`;
    await page.goto('/');
    await page.click('[data-action="show-auth-login"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    await page.click('[data-action="auth-toggle-mode"]');
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', 'testpass123');
    await page.click('[data-action="auth-submit"]');
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, { timeout: 5000 });

    // Navigate to achievements
    await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
    await page.click('[data-action="show-achievements"]');
    await expect(page.locator('[data-screen="achievements"]')).toHaveClass(/active/);

    // Achievements should load — either achievement cards or the no-achievements message
    const container = page.locator('[data-bind="achievements-grid"]');
    await expect(
      container.locator('.achievement-card').first().or(container.locator('.achievements-loading'))
    ).toBeVisible({ timeout: 15000 });
  });

  test('retry button appears after timeout on slow response', async ({ browser }) => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    await page.goto('/');

    // Intercept leaderboard API with a delay just over the 15s timeout
    await page.route(/\/api\/scores\/leaderboard/, async (route) => {
      await new Promise(resolve => setTimeout(resolve, 16000));
      try { await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ leaderboard: [] }),
      }); } catch { /* request aborted or context closed */ }
    });

    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    // Retry button should appear after the 15s timeout (no auto-retries)
    const container = page.locator('[data-bind="leaderboard-table"]');
    await expect(container.locator('.progressive-retry-btn')).toBeVisible({ timeout: 20000 });

    await context.close();
  });

  test('retry button works — clicking it loads data on second attempt', async ({ browser }) => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    await page.goto('/');

    let requestCount = 0;
    await page.route(/\/api\/scores\/leaderboard/, async (route) => {
      requestCount++;
      if (requestCount === 1) {
        // First request: delay just over timeout to trigger Retry button
        await new Promise(resolve => setTimeout(resolve, 16000));
        try { await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ leaderboard: [] }),
        }); } catch { /* request aborted */ }
      } else {
        // Subsequent requests: respond immediately
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ leaderboard: [] }),
        });
      }
    });

    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/);

    // Wait for retry button to appear
    const container = page.locator('[data-bind="leaderboard-table"]');
    await expect(container.locator('.progressive-retry-btn')).toBeVisible({ timeout: 20000 });

    // Click retry — data should load on second attempt
    await container.locator('.progressive-retry-btn').click();

    // The leaderboard empty state should appear (fast response on retry)
    await expect(container.locator('.leaderboard-empty')).toBeVisible({ timeout: 10000 });

    await context.close();
  });
});

