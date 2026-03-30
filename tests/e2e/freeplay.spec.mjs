// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Play through one full round: click an option, wait for result, click next-round.
 * Returns true when the game-over screen appears.
 */
async function playOneRound(page) {
  // Wait for an enabled option button on the game screen
  const option = page.locator('[data-screen="game"] .option-btn:not([disabled])').first();
  await option.waitFor({ state: 'visible', timeout: 10_000 });
  await option.click();

  // After the 600ms feedback delay the result screen appears
  await expect(page.locator('[data-screen="result"]')).toHaveClass(/active/, { timeout: 5_000 });

  // Click next-round (may say "See Results →" on last round)
  await page.click('[data-action="next-round"]');

  // Wait for either the next game round or the game-over screen
  const gameScreen = page.locator('[data-screen="game"].active');
  const gameOver = page.locator('[data-screen="gameover"].active');
  await expect(gameScreen.or(gameOver)).toBeVisible({ timeout: 5_000 });

  return gameOver.isVisible();
}

test.describe('Free Play', () => {
  test('navigate from home to category screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);

    await page.click('[data-action="start-freeplay"]');
    await expect(page.locator('[data-screen="category"]')).toHaveClass(/active/);
  });

  test('select category, play rounds, reach game over with score', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-freeplay"]');
    await expect(page.locator('[data-screen="category"]')).toHaveClass(/active/);

    // Pick the first category (🎲 Random)
    await page.locator('.category-btn').first().click();
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Play all rounds (up to 10)
    for (let i = 0; i < 10; i++) {
      const done = await playOneRound(page);
      if (done) break;
    }

    // Verify game over screen with a numeric score
    await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/active/);
    const scoreText = await page.locator('[data-bind="final-score"]').textContent();
    expect(Number(scoreText)).toBeGreaterThanOrEqual(0);
  });
});
