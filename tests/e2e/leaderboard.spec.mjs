// @ts-check
import { test, expect } from '@playwright/test';
import { playOneRound, uniqueIP } from './helpers.mjs';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `lb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Leaderboard', () => {
  test('logged-in user plays freeplay, score appears on leaderboard with You badge', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    // Register via top bar
    await page.goto('/');
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.click('[data-action="show-auth-register"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-register"]');
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    // Go home and start free play
    await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
    await page.click('[data-action="start-freeplay"]');
    await expect(page.locator('[data-screen="category"]')).toHaveClass(/active/);
    await page.locator('.category-btn').first().click();
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Play all rounds; listen for score submission during the game
    const scoreSubmitted = page.waitForResponse(
      (resp) => resp.url().includes('/api/scores') && resp.request().method() === 'POST',
      { timeout: 30000 },
    );
    for (let i = 0; i < 10; i++) {
      const done = await playOneRound(page);
      if (done) break;
    }
    await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/active/);
    await scoreSubmitted;

    // Go to leaderboard
    await page.locator('[data-screen="gameover"] [data-action="go-home"]').click();
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);
    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    // Wait for leaderboard table to load and contain our username
    const table = page.locator('[data-bind="leaderboard-table"]');
    await expect(table).toContainText(username, { timeout: 10000 });

    // Verify current-user highlighting and "You" badge
    const userRow = table.locator('.current-user');
    await expect(userRow).toBeVisible({ timeout: 5000 });
    await expect(userRow.locator('.you-badge')).toHaveText('You');

    // Verify personal bests section shows stats
    const personalBests = page.locator('[data-bind="personal-bests"]');
    await expect(personalBests).toContainText('My Personal Bests', { timeout: 10000 });
    await expect(personalBests).toContainText('Free Play');
  });

  test('leaderboard shows sign-in message for personal bests when not logged in', async ({ page }) => {
    await page.goto('/');
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });

    // Go to leaderboard without logging in
    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    // Verify sign-in prompt in personal bests section
    const personalBests = page.locator('[data-bind="personal-bests"]');
    await expect(personalBests).toContainText('Sign in to track your scores', { timeout: 5000 });
  });

  test('home screen does not show high score element', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);

    // High score element should not exist
    await expect(page.locator('.high-score')).toHaveCount(0);
    await expect(page.locator('[data-bind="high-score"]')).toHaveCount(0);
  });
});
