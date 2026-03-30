// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Keyboard Navigation', () => {
  test('use keys 1-4 to answer game rounds', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-freeplay"]');
    await expect(page.locator('[data-screen="category"]')).toHaveClass(/active/);

    // Pick first category
    await page.locator('.category-btn').first().click();
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Cycle through keys 1–4 across rounds
    const keys = ['1', '2', '3', '4'];
    for (let round = 0; round < 3; round++) {
      // Wait for option buttons to appear and be enabled
      const options = page.locator('[data-screen="game"] .option-btn:not([disabled])');
      await options.first().waitFor({ state: 'visible', timeout: 10_000 });

      // Press a different key each round
      const key = keys[round % keys.length];
      await page.keyboard.press(key);

      // Result screen should appear
      await expect(page.locator('[data-screen="result"]')).toHaveClass(/active/, {
        timeout: 5_000,
      });

      // Advance to next round
      await page.click('[data-action="next-round"]');

      // Wait for either next round or game over
      const gameScreen = page.locator('[data-screen="game"].active');
      const gameOver = page.locator('[data-screen="gameover"].active');
      await expect(gameScreen.or(gameOver)).toBeVisible({ timeout: 5_000 });

      if (await gameOver.isVisible()) break;
    }

    // Verify the game progressed — we should be past round 1
    const gameActive = page.locator('[data-screen="game"].active');
    const overActive = page.locator('[data-screen="gameover"].active');
    await expect(gameActive.or(overActive)).toBeVisible();
  });

  test('pressing key 3 acts on the third option', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-freeplay"]');
    await page.locator('.category-btn').first().click();
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Wait for options
    const options = page.locator('[data-screen="game"] .option-btn');
    await options.first().waitFor({ state: 'visible', timeout: 10_000 });

    // Press key '3' (selects the third option, index 2)
    await page.keyboard.press('3');

    // The third option should get a feedback class (correct or wrong)
    const thirdOption = options.nth(2);
    await expect(thirdOption).toHaveClass(/correct|wrong/, { timeout: 2_000 });
  });
});
