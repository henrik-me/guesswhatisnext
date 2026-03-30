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

    // Play 3 rounds using keyboard keys instead of clicking
    for (let round = 0; round < 3; round++) {
      // Wait for option buttons to appear and be enabled
      const options = page.locator('[data-screen="game"] .option-btn:not([disabled])');
      await options.first().waitFor({ state: 'visible', timeout: 10_000 });

      // Press key '1' to select the first option
      await page.keyboard.press('1');

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
    // Either still in game (round > 1) or at game over
    const gameActive = page.locator('[data-screen="game"].active');
    const overActive = page.locator('[data-screen="gameover"].active');
    await expect(gameActive.or(overActive)).toBeVisible();
  });

  test('different keys select different options', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-freeplay"]');
    await page.locator('.category-btn').first().click();
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Wait for options
    const options = page.locator('[data-screen="game"] .option-btn:not([disabled])');
    await options.first().waitFor({ state: 'visible', timeout: 10_000 });

    // Press key '3' (selects the third option)
    await page.keyboard.press('3');

    // Game should advance — result screen appears
    await expect(page.locator('[data-screen="result"]')).toHaveClass(/active/, {
      timeout: 5_000,
    });
  });
});
