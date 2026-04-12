// @ts-check
import { expect } from '@playwright/test';

/** Generate a unique IP to avoid rate-limit collisions across tests and spec files. */
const ipSeed = ((Date.now() & 0xffff) ^ Math.floor(Math.random() * 0xffff)) >>> 0;
const ipBaseSecondOctet = (ipSeed % 254) + 1;
const ipBaseThirdOctet = Math.floor(ipSeed / 256) % 256;
let ipCounter = 0;
export function uniqueIP() {
  const offset = ipCounter++;
  const thirdOctet = (ipBaseThirdOctet + Math.floor(offset / 254)) % 256;
  const fourthOctet = (offset % 254) + 1;
  return `10.${ipBaseSecondOctet}.${thirdOctet}.${fourthOctet}`;
}

/**
 * Play through one full round: click an option, wait for result, click next-round.
 * Returns true when the game-over screen appears.
 */
export async function playOneRound(page) {
  const option = page.locator('[data-screen="game"] .option-btn:not([disabled])').first();
  await option.waitFor({ state: 'visible', timeout: 10000 });
  await option.click();

  // After the 600ms feedback delay the result screen appears
  await expect(page.locator('[data-screen="result"]')).toHaveClass(/active/, { timeout: 5000 });

  // Click next-round (may say "See Results →" on last round)
  await page.click('[data-action="next-round"]');

  // Wait for either the next game round or the game-over screen
  const gameScreen = page.locator('[data-screen="game"].active');
  const gameOver = page.locator('[data-screen="gameover"].active');
  await expect(gameScreen.or(gameOver)).toBeVisible({ timeout: 5000 });

  return gameOver.isVisible();
}
