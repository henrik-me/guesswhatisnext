// @ts-check
import { expect } from '@playwright/test';

/**
 * Play through one full round: click an option, wait for result, click next-round.
 * Returns true when the game-over screen appears.
 */
export async function playOneRound(page) {
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
