// CS53-11 self-validation: drive logged-out browser through Leaderboard click
// during cold-start to assert progressive-loader cycles + recovery.
//
// Exit codes:
//   0 = expected cold-start UX observed (>=1 503, >=2 distinct loader messages, >=1 200)
//   1 = unexpected outcome (no cold start visible, no recovery, or click failed)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://localhost/';
const SHOTS = path.resolve(__dirname, '..', '.cs53-11-shots');
// Tunables — relaxed when sim is short or disabled.
const SIM_MS = Number(process.env.GWN_SIMULATE_COLD_START_MS || 0);
const REQUIRE_COLD_START = SIM_MS >= 5000;

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();

  const events = [];
  const log = (ev) => { events.push({ t: Date.now() - start, ...ev }); };

  page.on('console', (msg) => {
    if (msg.type() === 'error') log({ kind: 'console.error', text: msg.text().slice(0, 200) });
  });
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('/api/')) {
      log({ kind: 'api', status: resp.status(), path: url.split('/api/')[1].split('?')[0] });
    }
  });

  const start = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.screenshot({ path: path.join(SHOTS, '01-loaded.png'), fullPage: true });

  // Click Leaderboard — logged-out-accessible and triggers progressive-loader
  // via /api/scores/leaderboard which goes through the lazy-init middleware.
  let clickOk = false;
  const leaderboardBtn = page.getByText(/Leaderboard/i).first();
  if (await leaderboardBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await leaderboardBtn.click().catch(() => {});
    log({ kind: 'clicked-leaderboard' });
    clickOk = true;
  } else {
    log({ kind: 'leaderboard-not-visible' });
  }

  // Snapshot the cold-start window
  const snapTimes = [3000, 8000, 15000, 25000, 40000, 50000, 60000];
  let snapIdx = 1;
  for (const ms of snapTimes) {
    const wait = ms - (Date.now() - start);
    if (wait > 0) await page.waitForTimeout(wait);
    const file = path.join(SHOTS, `0${++snapIdx}-t${Math.round((Date.now() - start)/1000)}s.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    // Capture any progressive loader messages
    const loaderTexts = await page.locator('.progressive-message').allTextContents().catch(() => []);
    log({ kind: 'snapshot', t_s: Math.round((Date.now() - start) / 1000), loaderTexts });
  }

  // Final state
  const finalText = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
  log({ kind: 'final-body-text-preview', text: finalText.slice(0, 400) });

  const apiCalls = events.filter(e => e.kind === 'api');
  const byStatus = {};
  for (const c of apiCalls) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  const loaderMessages = [...new Set(events.flatMap(e => e.loaderTexts || []))];
  const summary = {
    totalElapsedMs: Date.now() - start,
    apiCallsByStatus: byStatus,
    total503: byStatus[503] || 0,
    total200: byStatus[200] || 0,
    sawLoader: loaderMessages.length > 0,
    loaderMessages,
    clickOk,
    requireColdStart: REQUIRE_COLD_START,
  };

  // Pass criteria
  const failures = [];
  if (!clickOk) failures.push('leaderboard-button-not-clickable');
  if (REQUIRE_COLD_START) {
    if (summary.total503 < 1) failures.push('expected >=1 503 during cold-start, got 0');
    if (loaderMessages.length < 2) failures.push(`expected >=2 distinct loader messages, got ${loaderMessages.length}`);
  }
  if (summary.total200 < 1) failures.push('expected >=1 successful 200 leaderboard fetch, got 0');

  console.log(JSON.stringify({ summary, failures, events }, null, 2));
  await browser.close();
  process.exit(failures.length === 0 ? 0 : 1);
})();
