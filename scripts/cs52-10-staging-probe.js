#!/usr/bin/env node
/**
 * scripts/cs52-10-staging-probe.js — CS52-10 ad-hoc operator validation
 * driver against the live `gwn-staging` Container App.
 *
 * Differs from `scripts/cs52-9-validate.js` (the local production-shape
 * driver) in three ways:
 *
 *   1. Cold-wakes the target via /healthz first and records the wake
 *      latency (informational; staging is at minReplicas=0 per CS58).
 *   2. Adds scenario (b) — two parallel POST /api/sessions for the same
 *      user → exactly one 200/201 + one 409 (UNIQUE INDEX
 *      `idx_ranked_sessions_user_active` enforces, not application logic).
 *   3. Calls GET /api/admin/migrations to confirm migration 008
 *      (`add-ranked-sessions-tables` etc.) is in the `applied` set on the
 *      live DB — strong evidence the new UNIQUE INDEXes
 *      `idx_ranked_sessions_user_active` and
 *      `idx_ranked_sessions_user_daily` exist (since migrations are
 *      recorded only after CREATE INDEX succeeded).
 *
 * Scenarios (a), (d), (f) re-use the same shape as cs52-9-validate.js.
 * Scenario (e) — App Insights confirmation — is performed out-of-band
 * by the operator running an `az monitor app-insights query` and
 * pasting the result into the PR body; this script only emits the
 * paths it probed so the operator can grep them.
 *
 * Usage:
 *   $env:BASE_URL="https://gwn-staging.<region>.azurecontainerapps.io"
 *   $env:SYSTEM_API_KEY="<staging key>"
 *   node scripts/cs52-10-staging-probe.js
 *
 * Exits 0 only if every required scenario passes. Scenario (e) is a
 * manual checkbox so it is reported as `skipped` here.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
  console.error('Set BASE_URL=https://gwn-staging.<region>.azurecontainerapps.io');
  process.exit(2);
}
const SYSTEM_API_KEY = process.env.SYSTEM_API_KEY;
if (!SYSTEM_API_KEY) {
  console.error('Set SYSTEM_API_KEY (staging key from `az containerapp show`)');
  process.exit(2);
}
const insecure = process.env.GWN_INSECURE_TLS === '1';
const agent = new https.Agent({ rejectUnauthorized: !insecure });

const COLD_WAKE_BUDGET_MS = parseInt(process.env.COLD_WAKE_BUDGET_MS || '120000', 10);

function httpReq(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const u = new URL(urlPath, BASE_URL);
    const r = https.request({
      method,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: {
        'content-type': 'application/json',
        ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
      agent,
    }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        let json;
        try { json = buf ? JSON.parse(buf) : null; } catch { json = buf; }
        resolve({ status: res.statusCode, body: json, raw: buf, headers: res.headers });
      });
    });
    r.on('error', reject);
    r.setTimeout(60000, () => r.destroy(new Error('socket timeout')));
    if (data) r.write(data);
    r.end();
  });
}

const results = { scenarios: {}, probedPaths: [], errors: [] };

function record(scenario, ok, notes, extra) {
  results.scenarios[scenario] = { pass: ok === null ? null : !!ok, notes, ...(extra || {}) };
  const tag = ok === null ? 'SKIP' : (ok ? 'PASS' : 'FAIL');
  console.log(`[${tag}] ${scenario} — ${notes}`);
}

async function ensureUser(username, password) {
  const reg = await httpReq('POST', '/api/auth/register', { body: { username, password } });
  if (reg.status === 201) return reg.body.token;
  const login = await httpReq('POST', '/api/auth/login', { body: { username, password } });
  if (login.status === 200) return login.body.token;
  throw new Error(`auth failed: register=${reg.status} login=${login.status} ${JSON.stringify(login.body).slice(0, 200)}`);
}

async function authed(token, method, urlPath, body) {
  return httpReq(method, urlPath, {
    body,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function playRankedSession(token, mode) {
  const create = await authed(token, 'POST', '/api/sessions', { mode });
  if (create.status !== 201) {
    return { ok: false, step: 'create', status: create.status, body: create.body };
  }
  results.probedPaths.push('POST /api/sessions');
  const { sessionId, config, round0 } = create.body;
  let current = round0;
  const rounds = config.rounds;

  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 120));
    const ans = await authed(token, 'POST', `/api/sessions/${sessionId}/answer`, {
      round_num: current.round_num,
      puzzle_id: current.puzzle.id,
      answer: (current.puzzle.options && current.puzzle.options[0]) || 'a',
      client_time_ms: 1500,
    });
    if (ans.status !== 200) {
      return { ok: false, step: `answer[${i}]`, status: ans.status, body: ans.body };
    }
    if (i === 0) results.probedPaths.push('POST /api/sessions/:id/answer');
    if (i < rounds - 1) {
      const nxt = await authed(token, 'POST', `/api/sessions/${sessionId}/next-round`);
      if (nxt.status !== 200) {
        return { ok: false, step: `next-round[${i}]`, status: nxt.status, body: nxt.body };
      }
      if (i === 0) results.probedPaths.push('POST /api/sessions/:id/next-round');
      current = nxt.body;
    }
  }
  const finish = await authed(token, 'POST', `/api/sessions/${sessionId}/finish`);
  if (finish.status !== 200) {
    return { ok: false, step: 'finish', status: finish.status, body: finish.body };
  }
  results.probedPaths.push('POST /api/sessions/:id/finish');
  return { ok: true, sessionId, finish: finish.body };
}

async function coldWake() {
  const start = Date.now();
  const deadline = start + COLD_WAKE_BUDGET_MS;
  let attempt = 0;
  let lastStatus = null;
  let lastErr = null;
  while (Date.now() < deadline) {
    attempt++;
    try {
      const r = await httpReq('GET', '/healthz');
      lastStatus = r.status;
      if (r.status === 200) {
        const elapsed = Date.now() - start;
        results.coldWake = { elapsedMs: elapsed, attempts: attempt };
        console.log(`[cold-wake] /healthz 200 after ${elapsed}ms (${attempt} attempts)`);
        return elapsed;
      }
    } catch (e) {
      lastErr = e.message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`cold-wake exceeded ${COLD_WAKE_BUDGET_MS}ms (last status=${lastStatus} lastErr=${lastErr})`);
}

(async () => {
  console.log(`[probe] target=${BASE_URL}`);
  await coldWake();

  const ts = Date.now().toString(36);
  const password = 'cs52-10-staging-probe!';

  // ── (a) Ranked Free Play + Ranked Daily ──
  let userAToken;
  try {
    userAToken = await ensureUser(`cs5210u${ts}a`, password);
    const fp = await playRankedSession(userAToken, 'ranked_freeplay');
    const fpOk = fp.ok && typeof fp.finish.score === 'number';

    const tokenB = await ensureUser(`cs5210u${ts}b`, password);
    const daily1 = await playRankedSession(tokenB, 'ranked_daily');
    const daily2 = await authed(tokenB, 'POST', '/api/sessions', { mode: 'ranked_daily' });
    const dailyOk = daily1.ok && daily2.status === 409;

    record('a-freeplay-and-daily',
      fpOk && dailyOk,
      `freeplay score=${fpOk ? fp.finish.score : 'FAIL@' + fp.step}; daily-once-per-day: first=${daily1.ok ? 'ok' : 'FAIL@' + daily1.step} secondAttempt=${daily2.status}`,
      { freeplay: fp.ok ? { score: fp.finish.score, correctCount: fp.finish.correctCount } : fp,
        daily: { first: daily1.ok ? 'ok' : daily1, secondAttempt: daily2.status } });
  } catch (e) {
    record('a-freeplay-and-daily', false, `exception: ${e.message}`);
  }

  // ── (b) Concurrent active-session race ──
  // Two parallel POST /api/sessions from the same user must produce
  // exactly one created (201) + one conflict (409). The 409 is enforced
  // by the partial UNIQUE INDEX `idx_ranked_sessions_user_active`, NOT
  // application logic — proving the index is live in the staging DB.
  try {
    const raceUser = `cs5210u${ts}race`;
    const raceToken = await ensureUser(raceUser, password);
    const [r1, r2] = await Promise.all([
      authed(raceToken, 'POST', '/api/sessions', { mode: 'ranked_freeplay' }),
      authed(raceToken, 'POST', '/api/sessions', { mode: 'ranked_freeplay' }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    // Accept (201, 409). Reject any other shape (two 201s = no index;
    // two 409s = both lost; 500s = error).
    const ok = statuses[0] === 201 && statuses[1] === 409;
    record('b-active-session-race', ok,
      `parallel POST /api/sessions statuses=[${r1.status}, ${r2.status}] expected one 201 + one 409`,
      { statuses: [r1.status, r2.status] });

    // Note: the winning session is left in_progress; the session will
    // expire naturally per server reaper, and this user is namespaced
    // by `ts` so subsequent probe runs use a fresh user. /finish would
    // 400 here without prior /answer calls, so we do not attempt it.
  } catch (e) {
    record('b-active-session-race', false, `exception: ${e.message}`);
  }

  // ── (c) /api/sync happy path ──
  // Cold-DB 202 path is not deterministically reproducible against a
  // long-warm staging replica; we exercise the happy path here and
  // document the cold-DB limitation in the PR body.
  try {
    const syncUser = `cs5210u${ts}sync`;
    const syncToken = await ensureUser(syncUser, password);
    const sync = await httpReq('POST', '/api/sync', {
      body: { queuedRecords: [], revalidate: { scores: { since: 0 } } },
      headers: {
        authorization: `Bearer ${syncToken}`,
        'x-user-activity': '1',
      },
    });
    results.probedPaths.push('POST /api/sync');
    // Per CS52-7e the 200 response shape is { acked, rejected, entities }
    // and is mutually exclusive with the 202 { queuedRequestIds } shape.
    // Empty queuedRecords + revalidate.scores must produce 200 with
    // both `acked` (array) and `entities` (object) present.
    const body = sync.body || {};
    const shapeOk = sync.status === 200
      && Array.isArray(body.acked)
      && body.entities && typeof body.entities === 'object'
      && !('queuedRequestIds' in body);
    record('c-sync-happy', shapeOk,
      `POST /api/sync status=${sync.status} acked=${Array.isArray(body.acked) ? body.acked.length : 'missing'} entities=${body.entities ? Object.keys(body.entities).join(',') : 'missing'} queuedRequestIds=${'queuedRequestIds' in body ? 'PRESENT(should-be-absent)' : 'absent'}`,
      { status: sync.status, body: sync.body });
  } catch (e) {
    record('c-sync-happy', false, `exception: ${e.message}`);
  }

  // ── (d) Admin route flips MP rounds, verifies, reverts ──
  // The admin route only exposes PUT (no GET), so a snapshot is not
  // available via HTTP. Per CS52-10 spec we revert to the documented
  // multiplayer code-default (rounds=5, round_timer_ms=20000,
  // inter_round_delay_ms=3000); operators who intentionally configured
  // something else in staging must re-apply post-probe.
  try {
    const flip = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
      body: { rounds: 7, round_timer_ms: 20000, inter_round_delay_ms: 3000 },
      headers: { 'x-api-key': SYSTEM_API_KEY },
    });
    results.probedPaths.push('PUT /api/admin/game-configs/:mode');
    const flipOk = flip.status === 200 && flip.body && flip.body.rounds === 7;

    const reject = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
      body: { rounds: 99, round_timer_ms: 20000, inter_round_delay_ms: 3000 },
      headers: { 'x-api-key': SYSTEM_API_KEY },
    });
    const rejectOk = reject.status === 400;

    const unauth = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
      body: { rounds: 5, round_timer_ms: 20000, inter_round_delay_ms: 3000 },
    });
    const unauthOk = unauth.status === 401 || unauth.status === 403;

    const revertBody = { rounds: 5, round_timer_ms: 20000, inter_round_delay_ms: 3000 };
    const revert = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
      body: revertBody,
      headers: { 'x-api-key': SYSTEM_API_KEY },
    });
    const revertOk = revert.status === 200 && revert.body && revert.body.rounds === 5;

    record('d-admin-route', flipOk && rejectOk && unauthOk && revertOk,
      `flip-to-7 status=${flip.status} bounds-reject=${reject.status} unauth=${unauth.status} revert(rounds=5)=${revert.status}`,
      { flipBody: flip.body, revertBody, revertStatus: revert.status });
  } catch (e) {
    record('d-admin-route', false, `exception: ${e.message}`);
  }

  // ── (e) App Insights — manual ──
  record('e-app-insights', null,
    'Manual: run `az monitor app-insights query` against gwn-ai-staging — see PR body Telemetry Validation section. Probe paths recorded in results.probedPaths.');

  // ── (f) Schema migration ran cleanly (via /api/admin/migrations) ──
  // Migration 008 (`cs52-ranked-schema`, see
  // server/db/migrations/008-cs52-ranked-schema.js) creates the two
  // UNIQUE INDEXes and the new tables; if it is in the `applied` set
  // and the route reports `status === 'ok'`, the CREATE INDEX
  // statements committed. The behavioural test (b) is the independent
  // confirmation that `idx_ranked_sessions_user_active` is actually
  // enforcing on the live DB.
  try {
    const m = await httpReq('GET', '/api/admin/migrations', {
      headers: { 'x-api-key': SYSTEM_API_KEY },
    });
    const ok = m.status === 200 && m.body && m.body.status === 'ok';
    const names = (m.body && m.body.names) || [];
    const hasCs52 = names.includes('cs52-ranked-schema');
    record('f-schema-migration', ok && hasCs52,
      `GET /api/admin/migrations status=${m.status} migrations.status=${m.body && m.body.status} applied=${m.body && m.body.applied}/${m.body && m.body.expected} cs52-ranked-schema-applied=${hasCs52}`,
      { migrations: m.body });
  } catch (e) {
    record('f-schema-migration', false, `exception: ${e.message}`);
  }

  // Summary
  const pass = Object.values(results.scenarios).filter((s) => s.pass === true).length;
  const fail = Object.values(results.scenarios).filter((s) => s.pass === false).length;
  const skipped = Object.values(results.scenarios).filter((s) => s.pass === null).length;
  console.log(`\n=== Summary: ${pass} pass, ${fail} fail, ${skipped} skipped ===`);
  console.log(`Cold-wake: ${results.coldWake ? results.coldWake.elapsedMs + 'ms (' + results.coldWake.attempts + ' attempts)' : 'n/a'}`);
  console.log(`Probed paths: ${[...new Set(results.probedPaths)].join(', ')}`);

  fs.writeFileSync(
    path.join(__dirname, 'cs52-10-staging-results.json'),
    JSON.stringify(results, null, 2),
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
