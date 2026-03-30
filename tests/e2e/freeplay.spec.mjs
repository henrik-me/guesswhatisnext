// @ts-check
import { test, expect } from '@playwright/test';
import { playOneRound } from './helpers.mjs';

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
    const scoreEl = page.locator('[data-bind="final-score"]');
    await expect(scoreEl).not.toBeEmpty();
    const scoreText = await scoreEl.textContent();
    expect(scoreText).toMatch(/^\d+$/);
    expect(Number(scoreText)).toBeGreaterThanOrEqual(0);
  });
});
