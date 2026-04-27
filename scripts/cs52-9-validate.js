#!/usr/bin/env node
/**
 * scripts/cs52-9-validate.js — CS52-9 production-shape validation driver.
 *
 * Exercises the live `npm run dev:mssql` stack (MSSQL 2022 + Caddy HTTPS +
 * OTLP collector) over HTTPS through Caddy. Designed to be run *after*
 * `npm run dev:mssql` has brought the stack up.
 *
 * Scenarios covered (CS52-9 § B):
 *   (a)  Ranked Free Play + Ranked Daily through Caddy HTTPS
 *   (d)  Admin route PUT /api/admin/game-configs/:mode happy path
 *   (e1) Schema introspection — verifies CS52-2 migration tables/indexes
 *        applied cleanly to the empty MSSQL DB
 *   (f)  OTLP probe — hits each new endpoint then returns the list of
 *        request paths so the caller can grep traces.json afterwards
 *
 * Scenarios (b), (c), (e2) require dedicated harnesses (cold-start
 * docker-compose override, WS multiplayer driver, legacy-seed pre-migration
 * snapshot). They are documented separately in the PR body.
 *
 * Output is a JSON report to stdout (and to scripts/cs52-9-results.json).
 *
 * Usage:
 *   HTTPS_PORT=9443 SYSTEM_API_KEY=test-system-api-key \
 *     node scripts/cs52-9-validate.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const HTTPS_PORT = process.env.HTTPS_PORT || '9443';
const BASE_URL = process.env.BASE_URL || `https://localhost:${HTTPS_PORT}`;
// Required — must match the SYSTEM_API_KEY of the target stack. For the
// local `npm run dev:mssql` stack the value lives in docker-compose.mssql.yml
// (intentionally a non-secret local-only string). For staging/prod re-use,
// pass a real key in via env.
const SYSTEM_API_KEY = process.env.SYSTEM_API_KEY;
if (!SYSTEM_API_KEY) {
  console.error('Set SYSTEM_API_KEY (matches the target stack). For local dev:mssql use SYSTEM_API_KEY=test-system-api-key.');
  process.exit(2);
}
// Local Caddy serves a self-signed cert; staging/prod must validate the
// real CA. Default OFF (validate); set GWN_INSECURE_TLS=1 to skip — only
// intended for the local stack.
const insecure = process.env.GWN_INSECURE_TLS === '1';
const agent = new https.Agent({ rejectUnauthorized: !insecure });

async function req(method, urlPath, { body, headers = {} } = {}) {
  const url = `${BASE_URL}${urlPath}`;
  const init = {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    agent,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  // Use undici-fetch under node 20+
  const res = await fetch(url, { ...init, dispatcher: undefined });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, raw: text, headers: res.headers };
}

// Node 20 fetch + custom CA bypass: use node:https for full control.
function httpReq(method, urlPath, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body !== undefined ? JSON.stringify(body) : null;
    const r = https.request(`${BASE_URL}${urlPath}`, {
      method,
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
        resolve({ status: res.statusCode, body: json, raw: buf });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const results = { scenarios: {}, probedPaths: [], errors: [] };

function record(scenario, ok, notes) {
  results.scenarios[scenario] = { pass: !!ok, notes };
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${scenario} — ${notes}`);
}

async function ensureUser(username, password) {
  const reg = await httpReq('POST', '/api/auth/register', { body: { username, password } });
  if (reg.status === 201) return reg.body.token;
  const login = await httpReq('POST', '/api/auth/login', { body: { username, password } });
  if (login.status === 200) return login.body.token;
  throw new Error(`auth failed: register=${reg.status} login=${login.status} ${JSON.stringify(login.body)}`);
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
  let rounds = config.rounds;

  for (let i = 0; i < rounds; i++) {
    // Server requires elapsed_ms ≥ 50; add a small wait so the timing
    // floor is comfortably cleared on every round.
    await new Promise((r) => setTimeout(r, 120));
    // Submit answer (any string — server scores correctness; we just want completion)
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
      // inter_round_delay_ms is 0 for ranked configs, so /next-round is immediate
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

(async () => {
  const ts = Date.now().toString(36);
  const userA = `cs529u${ts}a`;
  const password = 'cs52-9-validate!';

  // ── (a) Ranked Free Play + Ranked Daily through Caddy HTTPS ──
  try {
    const token = await ensureUser(userA, password);

    const fp = await playRankedSession(token, 'ranked_freeplay');
    const fpOk = fp.ok && typeof fp.finish.score === 'number';
    record('a-freeplay',
      fpOk,
      fpOk ? `score=${fp.finish.score} correct=${fp.finish.correctCount}` : `failed at ${fp.step}: ${JSON.stringify(fp.body).slice(0,180)}`);

    // Ranked Daily — use a SEPARATE user so we don't collide with the
    // still-active freeplay session (one-active-session-per-user constraint).
    const tokenB = await ensureUser(`cs529u${ts}b`, password);
    const daily1 = await playRankedSession(tokenB, 'ranked_daily');
    const daily1Ok = daily1.ok;
    // Second daily attempt for the same user — must 409 (UNIQUE INDEX on daily_utc_date).
    const daily2 = await authed(tokenB, 'POST', '/api/sessions', { mode: 'ranked_daily' });
    const daily2Ok = daily2.status === 409;
    record('a-daily',
      daily1Ok && daily2Ok,
      `first=${daily1Ok ? 'ok' : JSON.stringify(daily1).slice(0,140)} secondAttempt=${daily2.status}`);
  } catch (e) {
    record('a-freeplay', false, `exception: ${e.message}`);
    record('a-daily', false, `exception: ${e.message}`);
  }

  // ── (d) Admin route PUT /api/admin/game-configs/:mode ──
  // Snapshot the existing row first so we can restore it after the probe;
  // the admin route persists immediately, and CS52-10/11 re-runs of this
  // script must NOT permanently mutate the target environment's mp config.
  let priorMpConfig = null;
  try {
    const probeRead = await httpReq('GET', '/api/admin/game-configs/multiplayer', {
      headers: { 'x-api-key': SYSTEM_API_KEY },
    });
    if (probeRead.status === 200) priorMpConfig = probeRead.body;
  } catch { /* ignore — admin route only exposes PUT, GET may 404 */ }
  try {
    const r1 = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
      body: { rounds: 7, round_timer_ms: 20000, inter_round_delay_ms: 3000 },
      headers: { 'x-api-key': SYSTEM_API_KEY },
    });
    const updateOk = r1.status === 200 && r1.body && r1.body.rounds === 7;
    results.probedPaths.push('PUT /api/admin/game-configs/:mode');

    // Validation: out-of-bounds rejected
    const r2 = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
      body: { rounds: 99, round_timer_ms: 20000, inter_round_delay_ms: 3000 },
      headers: { 'x-api-key': SYSTEM_API_KEY },
    });
    const rejectOk = r2.status === 400;

    // Auth: missing api key → 401
    const r3 = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
      body: { rounds: 5, round_timer_ms: 20000, inter_round_delay_ms: 3000 },
    });
    const authOk = r3.status === 401 || r3.status === 403;

    record('d-admin-route',
      updateOk && rejectOk && authOk,
      `update=${r1.status} bounds-reject=${r2.status} unauth=${r3.status}`);
    results.adminRoute = { update: r1.body, rejectStatus: r2.status, unauthStatus: r3.status };

    // Restore the prior config (if we snapshotted one) so re-runs in
    // staging/prod don't permanently mutate game shape.
    if (priorMpConfig && typeof priorMpConfig.rounds === 'number') {
      const restore = await httpReq('PUT', '/api/admin/game-configs/multiplayer', {
        body: {
          rounds: priorMpConfig.rounds,
          round_timer_ms: priorMpConfig.round_timer_ms,
          inter_round_delay_ms: priorMpConfig.inter_round_delay_ms,
        },
        headers: { 'x-api-key': SYSTEM_API_KEY },
      });
      results.adminRoute.restoreStatus = restore.status;
    }
  } catch (e) {
    record('d-admin-route', false, `exception: ${e.message}`);
  }

  // ── (e1) Schema introspection on empty MSSQL DB ──
  // We can't introspect MSSQL from here directly; we rely on a sibling
  // script `cs52-9-mssql-schema.js` invoked via docker exec. This driver
  // only flags the scenario as "needs companion script" — see PR body.
  results.scenarios['e-schema-empty'] = { pass: null, notes: 'see scripts/cs52-9-mssql-schema.js output' };

  // ── (f) OTLP probe — hit /api/sync to round out endpoint coverage ──
  try {
    const token = await ensureUser(`cs529u${ts}f`, password);
    // /api/sync requires X-User-Activity header (gesture-driven contract)
    const sync = await httpReq('POST', '/api/sync', {
      body: { queuedRecords: [], revalidate: {} },
      headers: {
        authorization: `Bearer ${token}`,
        'x-user-activity': '1',
      },
    });
    const ok = sync.status === 200 || sync.status === 202;
    results.probedPaths.push('POST /api/sync');
    record('f-otlp-probe-sync', ok, `status=${sync.status}`);
  } catch (e) {
    record('f-otlp-probe-sync', false, `exception: ${e.message}`);
  }

  // Summary
  const pass = Object.values(results.scenarios).filter((s) => s.pass === true).length;
  const fail = Object.values(results.scenarios).filter((s) => s.pass === false).length;
  const skipped = Object.values(results.scenarios).filter((s) => s.pass === null).length;
  console.log(`\n=== Summary: ${pass} pass, ${fail} fail, ${skipped} skipped ===`);

  fs.writeFileSync(
    path.join(__dirname, 'cs52-9-results.json'),
    JSON.stringify(results, null, 2),
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
