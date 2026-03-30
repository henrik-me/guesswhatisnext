// @ts-check
import { test, expect } from '@playwright/test';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `lb${Date.now().toString(36)}`;
}

/**
 * Play one round: click an option, wait for result, click next-round.
 * Returns true when game-over screen appears.
 */
async function playOneRound(page) {
  const option = page.locator('[data-screen="game"] .option-btn:not([disabled])').first();
  await option.waitFor({ state: 'visible', timeout: 10_000 });
  await option.click();
  await expect(page.locator('[data-screen="result"]')).toHaveClass(/active/, { timeout: 5_000 });
  await page.click('[data-action="next-round"]');
  const gameOver = page.locator('[data-screen="gameover"].active');
  const gameScreen = page.locator('[data-screen="game"].active');
  await expect(gameScreen.or(gameOver)).toBeVisible({ timeout: 5_000 });
  return gameOver.isVisible();
}

test.describe('Leaderboard', () => {
  test('logged-in user plays freeplay, score appears on leaderboard', async ({ page }) => {
    const username = uniqueUser();
    const password = 'testpass123';

    // Register
    await page.goto('/');
    await page.click('[data-action="start-multiplayer"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-register"]');
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, {
      timeout: 5_000,
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
      { timeout: 30_000 },
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
      timeout: 5_000,
    });

    // Wait for leaderboard table to load and contain our username
    const table = page.locator('[data-bind="leaderboard-table"]');
    await expect(table).toContainText(username, { timeout: 10_000 });
  });
});
