#!/usr/bin/env node
/**
 * scripts/cs52-9-pending-writes-probe.js — Scenario (b) Variant B probe.
 *
 * Run with the MSSQL container in a state where `getDbUnavailability()`
 * returns a *permanent* descriptor (e.g. cold-start init incomplete, or
 * an MSSQL outage long enough that the transient classifier promotes to
 * permanent). Exercises CS52-7e:
 *
 *   - POST /api/sync → 202 + queuedRequestIds (Variant B)
 *
 * This probe DOES NOT cover Variant A (POST /api/sessions/:id/finish) or
 * Variant C (multiplayer match-completion) — those require an active
 * ranked session id / live WS handler respectively, and are exercised
 * by the integration suite (server/__tests__/sessions.finish.unavailable*
 * + server/ws/__tests__/matchHandler.unavailable*). This probe also does
 * NOT verify drain-on-recovery; that's the responsibility of the live
 * scenario runner (re-run cs52-9-validate.js after MSSQL warms back up
 * and assert the pending-writes/ directory drains to empty).
 */
'use strict';
const https = require('https');
const fs = require('fs');
const HTTPS_PORT = process.env.HTTPS_PORT || '9443';
const BASE = process.env.BASE_URL || `https://localhost:${HTTPS_PORT}`;
const insecure = process.env.GWN_INSECURE_TLS === '1';
const agent = new https.Agent({ rejectUnauthorized: !insecure });

function r(method, p, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(`${BASE}${p}`, {
      method, agent,
      headers: { 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}), ...headers },
    }, (res) => {
      let buf = ''; res.setEncoding('utf8');
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let j; try { j = buf ? JSON.parse(buf) : null; } catch { j = buf; }
        resolve({ status: res.statusCode, body: j, raw: buf });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // We need a token from the validation run still warm in memory? No — reuse a fresh user.
  // But auth itself touches DB which will be unavailable. So we use a pre-acquired token.
  const token = process.env.PROBE_TOKEN;
  if (!token) {
    console.error('Set PROBE_TOKEN env var (login while DB up; pass token in to this script)');
    process.exit(2);
  }

  const sync = await r('POST', '/api/sync', {
    body: {
      // Real /api/sync record shape — see server/routes/sync.js
      // normaliseRecord() (total_rounds, completed_at, payload_hash
      // computed server-side; fields below match the client L1 contract).
      queuedRecords: [{
        client_game_id: `cs52-9-probe-${Date.now()}`,
        mode: 'freeplay',
        score: 100,
        correct_count: 5,
        total_rounds: 5,
        completed_at: new Date().toISOString(),
        source: 'offline',
        variant: 'freeplay',
        schema_version: 1,
      }],
      revalidate: {},
    },
    headers: { authorization: `Bearer ${token}`, 'x-user-activity': '1' },
  });
  console.log('SYNC status', sync.status, JSON.stringify(sync.body).slice(0, 400));
  fs.writeFileSync('scripts/cs52-9-probe-result.json', JSON.stringify(sync, null, 2));
  process.exit(sync.status === 202 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
