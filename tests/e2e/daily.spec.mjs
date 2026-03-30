// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Daily Challenge', () => {
  test('start daily, answer puzzle, see result with share button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/);

    await page.click('[data-action="start-daily"]');
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Answer the daily puzzle
    const option = page.locator('[data-screen="game"] .option-btn:not([disabled])').first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();

    // Result screen appears after feedback delay
    await expect(page.locator('[data-screen="result"]')).toHaveClass(/active/, { timeout: 5000 });
    await page.click('[data-action="next-round"]');

    // Game over screen (daily has only 1 round)
    await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/active/, { timeout: 5000 });

    // Share button should be visible
    await expect(page.locator('[data-action="share-result"]')).toBeVisible();
  });

  test('reload after completing daily shows locked state', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-action="start-daily"]');
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Complete the daily puzzle
    const option = page.locator('[data-screen="game"] .option-btn:not([disabled])').first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await expect(page.locator('[data-screen="result"]')).toHaveClass(/active/, { timeout: 5000 });
    await page.click('[data-action="next-round"]');
    await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/active/, { timeout: 5000 });

    // Reload the page (daily lock is persisted in localStorage)
    await page.reload();
    await expect(page.locator('[data-screen="home"]')).toHaveClass(/active/, { timeout: 5000 });

    // Try daily again — should show locked screen
    await page.click('[data-action="start-daily"]');
    await expect(page.locator('[data-screen="gameover"]')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('[data-screen="gameover"] .gameover-title')).toHaveText(
      "Today's Challenge Complete!"
    );
  });
});
