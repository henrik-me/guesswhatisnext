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
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.goto('/');
    await page.click('[data-action="show-auth-login"]');
    await expect(page.locator('[data-screen="auth"]')).toHaveClass(/active/);
    await page.click('[data-action="auth-toggle-mode"]');
    await page.fill('#auth-username', username);
    await page.fill('#auth-password', password);
    await page.click('[data-action="auth-submit"]');
    await expect(page.locator('[data-screen="multiplayer"]')).toHaveClass(/active/, {
      timeout: 5000,
    });

    // Go home and start free play
    await page.locator('[data-screen="multiplayer"] [data-action="go-home"]').click();
    await page.click('[data-action="start-freeplay"]');
    await expect(page.locator('[data-screen="category"]')).toHaveClass(/active/);
    await page.locator('.category-btn').first().click();
    await expect(page.locator('[data-screen="game"]')).toHaveClass(/active/);

    // Play all rounds; listen for score submission during the game.
    // CS52-5: scores are submitted via the unified /api/sync endpoint.
    // Tightened predicate (Copilot R1): require a non-empty queuedRecords array
    // in the request body so a sign-in-triggered /api/sync (which carries an
    // empty/absent queuedRecords) doesn't satisfy the wait early.
    const scoreSubmitted = page.waitForResponse(
      (resp) => {
        if (!resp.url().includes('/api/sync') || resp.request().method() !== 'POST') return false;
        try {
          const body = JSON.parse(resp.request().postData() || '{}');
          return Array.isArray(body.queuedRecords) && body.queuedRecords.length > 0;
        } catch {
          return false;
        }
      },
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

    // CS52-5 free play games are submitted via /api/sync as `offline`
    // (self-reported). CS52-6 defaults the public LB to `Ranked`, so we
    // must flip to the `Offline` source tab to see the row we just
    // submitted. The 3-way segmented control is the new provenance UI.
    const offlineTab = page.locator('[data-action="leaderboard-source"][data-source="offline"]');
    await expect(offlineTab).toBeVisible({ timeout: 5000 });
    await offlineTab.click();

    // Wait for leaderboard table to load and contain our username
    const table = page.locator('[data-bind="leaderboard-table"]');
    await expect(table).toContainText(username, { timeout: 10000 });

    // Verify current-user highlighting and "You" badge
    const userRow = table.locator('.current-user');
    await expect(userRow).toBeVisible({ timeout: 5000 });
    await expect(userRow.locator('.you-badge')).toHaveText('You');

    // CS52-6: per-row provenance badge — offline submissions get the
    // "Offline" pill so users immediately see this is a self-reported
    // (not server-validated) score.
    await expect(userRow.locator('.provenance-badge.provenance-offline')).toBeVisible();

    // Verify personal bests section shows stats
    const personalBests = page.locator('[data-bind="personal-bests"]');
    await expect(personalBests).toContainText('My Personal Bests', { timeout: 10000 });
    await expect(personalBests).toContainText('Free Play');
  });

  test('leaderboard shows sign-in message for personal bests when not logged in', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.goto('/');

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

  // CS52-6: 3-way source toggle (Ranked / Offline / All) renders a
  // segmented control on Free Play and Daily LBs, and hides on Multiplayer.
  test('CS52-6: source toggle visible on Free Play, hidden on Multiplayer', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': uniqueIP() });
    await page.goto('/');
    await page.click('[data-action="show-leaderboard"]');
    await expect(page.locator('[data-screen="leaderboard"]')).toHaveClass(/active/, { timeout: 5000 });

    const sourceTabs = page.locator('[data-bind="leaderboard-source-tabs"]');
    await expect(sourceTabs).toBeVisible();
    // CS52-followup-1: default selection is `all` (was `ranked` per CS52-6
    // § Decision #6) — flipped per user feedback so users see their own
    // Practice scores by default. Persisted in localStorage `gwn_lb_source`.
    await expect(page.locator('.leaderboard-source-tab.active')).toHaveAttribute('data-source', 'all');

    // Daily mode tab is present and source filter still applies.
    await page.click('[data-action="leaderboard-mode"][data-mode="daily"]');
    await expect(sourceTabs).toBeVisible();

    // Multiplayer hides the source tabs (server-validated only).
    await page.click('[data-action="leaderboard-mode"][data-mode="multiplayer"]');
    await expect(sourceTabs).toBeHidden();
  });

  // CS52-6: variant routing — server returns 400 if `variant` is missing
  // on the non-multiplayer LB endpoint.
  test('CS52-6: GET /api/scores/leaderboard requires variant param', async ({ request }) => {
    const missing = await request.get('/api/scores/leaderboard');
    expect(missing.status()).toBe(400);

    const ok = await request.get('/api/scores/leaderboard?variant=freeplay');
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(Array.isArray(body.rows)).toBeTruthy();
    expect(body.variant).toBe('freeplay');
    expect(body.source).toBe('ranked');

    const daily = await request.get('/api/scores/leaderboard?variant=daily');
    expect(daily.status()).toBe(200);
    const dailyBody = await daily.json();
    expect(dailyBody.variant).toBe('daily');
  });
});
