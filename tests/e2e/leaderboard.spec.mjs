// @ts-check
import { test, expect } from '@playwright/test';
import { playOneRound } from './helpers.mjs';

/** Generate a unique username for test isolation. */
function uniqueUser() {
  return `lb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Generate a unique IP to avoid rate-limit collisions. */
const ipSeed = ((Date.now() & 0xffff) ^ Math.floor(Math.random() * 0xffff)) >>> 0;
const ipOctet2 = (ipSeed % 254) + 1;
const ipOctet3 = Math.floor(ipSeed / 256) % 256;
let ipCounter = 0;
function uniqueIP() {
  const offset = ipCounter++;
  return `10.${ipOctet2}.${(ipOctet3 + Math.floor(offset / 254)) % 256}.${(offset % 254) + 1}`;
}

test.describe('Leaderboard', () => {
  test('logged-in user plays freeplay, score appears on leaderboard', async ({ page }) => {
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
  });
});
