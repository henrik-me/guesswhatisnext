/**
 * Tests for scripts/verify-ai.js (CS41-3).
 *
 * Drives the verifier with a fake `azRunner` and a synchronous `sleeper`
 * so the 10-min budget collapses to a microsecond test. Covers:
 *   - Happy path: rows >= expected on first attempt.
 *   - Late-ingest path: rows >= expected after several empty attempts.
 *   - Ingest-delay path: still empty after full retry budget → warning=true,
 *     error=null, threshold_met=false. (Does NOT fail the deploy.)
 *   - Mechanism-failure path: az exits non-zero → error set, warning=false.
 *   - Tables-envelope shape parses identically to flat-array shape.
 *   - KQL injection-defense: single quotes in revision name are escaped.
 */

import { describe, it, expect } from 'vitest';
import { verify, buildKql, parseQueryResult } from '../scripts/verify-ai.js';

function fakeAz(scripts) {
  // `scripts` is an array of `{ code, stdout, stderr }` objects, consumed
  // in order; subsequent calls reuse the last entry. Each invocation also
  // pushes the args it received to `seen` for assertions.
  const seen = [];
  let i = 0;
  const runner = async (args) => {
    seen.push(args);
    const r = scripts[Math.min(i, scripts.length - 1)];
    i++;
    return { code: 0, stdout: '[]', stderr: '', ...r };
  };
  runner.seen = seen;
  return runner;
}

const noWait = async () => {};
const tinyWaits = [0, 0, 0, 0, 0, 0];

function rowsTablesEnvelope(rows) {
  return JSON.stringify({
    tables: [{
      name: 'PrimaryResult',
      columns: [{ name: 'name' }, { name: 'resultCode' }, { name: 'count_' }],
      rows: rows.map((r) => [r.name, r.resultCode, r.count]),
    }],
  });
}

function rowsFlatArray(rows) {
  return JSON.stringify(rows.map((r) => ({ name: r.name, resultCode: r.resultCode, count_: r.count })));
}

const SIX_ROWS = [
  { name: 'GET /healthz', resultCode: '200', count: 1 },
  { name: 'GET /api/features', resultCode: '200', count: 1 },
  { name: 'POST /api/auth/login', resultCode: '200', count: 1 },
  { name: 'POST /api/scores', resultCode: '201', count: 1 },
  { name: 'GET /api/scores/me', resultCode: '200', count: 1 },
  { name: 'GET /api/health', resultCode: '200', count: 1 },
];

describe('CS41-3 verify-ai — happy path', () => {
  it('passes on first attempt when rows already ingested (tables envelope)', async () => {
    const az = fakeAz([{ code: 0, stdout: rowsTablesEnvelope(SIX_ROWS) }]);
    const r = await verify({
      revisionName: 'gwn-production--rev42-xy',
      aiResource: 'gwn-ai-production',
      expectedRows: 6,
      azRunner: az,
      sleeper: noWait,
      retryWaitsMs: tinyWaits,
    });
    expect(r.error).toBeNull();
    expect(r.warning).toBe(false);
    expect(r.threshold_met).toBe(true);
    expect(r.rows_total).toBe(6);
    expect(r.rows_by_route).toHaveLength(6);
    expect(r.query_attempts).toBe(1);
    // KQL passed to az includes the revision and ago(window).
    expect(az.seen[0]).toContain('--analytics-query');
    const kql = az.seen[0][az.seen[0].indexOf('--analytics-query') + 1];
    expect(kql).toContain("cloud_RoleInstance has 'gwn-production--rev42-xy'");
    expect(kql).toContain('ago(15m)');
  });

  it('parses flat-array az output identically to tables envelope', async () => {
    const az = fakeAz([{ code: 0, stdout: rowsFlatArray(SIX_ROWS) }]);
    const r = await verify({
      revisionName: 'rev', aiResource: 'gwn-ai-staging', expectedRows: 6,
      azRunner: az, sleeper: noWait, retryWaitsMs: tinyWaits,
    });
    expect(r.threshold_met).toBe(true);
    expect(r.rows_total).toBe(6);
  });
});

describe('CS41-3 verify-ai — late ingest', () => {
  it('retries while empty and passes once rows appear', async () => {
    const az = fakeAz([
      { code: 0, stdout: '[]' },
      { code: 0, stdout: '[]' },
      { code: 0, stdout: rowsTablesEnvelope(SIX_ROWS) },
    ]);
    const r = await verify({
      revisionName: 'rev', aiResource: 'gwn-ai-production', expectedRows: 6,
      azRunner: az, sleeper: noWait, retryWaitsMs: tinyWaits,
    });
    expect(r.threshold_met).toBe(true);
    expect(r.warning).toBe(false);
    expect(r.query_attempts).toBe(3);
    expect(r.rows_total).toBe(6);
  });

  it('counts a partial ingest as still-below-threshold and keeps retrying', async () => {
    const az = fakeAz([
      { code: 0, stdout: rowsTablesEnvelope([{ name: 'GET /healthz', resultCode: '200', count: 1 }]) },
      { code: 0, stdout: rowsTablesEnvelope(SIX_ROWS) },
    ]);
    const r = await verify({
      revisionName: 'rev', aiResource: 'ai', expectedRows: 6,
      azRunner: az, sleeper: noWait, retryWaitsMs: tinyWaits,
    });
    expect(r.query_attempts).toBe(2);
    expect(r.threshold_met).toBe(true);
  });
});

describe('CS41-3 verify-ai — ingest-delay warning (NOT a failure)', () => {
  it('returns warning=true and error=null after exhausting all attempts', async () => {
    const az = fakeAz([{ code: 0, stdout: '[]' }]);
    const r = await verify({
      revisionName: 'rev', aiResource: 'gwn-ai-production', expectedRows: 6,
      azRunner: az, sleeper: noWait, retryWaitsMs: tinyWaits,
    });
    expect(r.warning).toBe(true);
    expect(r.error).toBeNull();
    expect(r.threshold_met).toBe(false);
    expect(r.rows_total).toBe(0);
    // 1 initial + 6 retries (matches RETRY_WAITS_MS.length default of 6).
    expect(r.query_attempts).toBe(7);
  });

  it('records the partial result when ingest comes in below threshold', async () => {
    const partial = [{ name: 'GET /healthz', resultCode: '200', count: 2 }];
    const az = fakeAz([{ code: 0, stdout: rowsTablesEnvelope(partial) }]);
    const r = await verify({
      revisionName: 'rev', aiResource: 'ai', expectedRows: 6,
      azRunner: az, sleeper: noWait, retryWaitsMs: tinyWaits,
    });
    expect(r.warning).toBe(true);
    expect(r.threshold_met).toBe(false);
    expect(r.rows_total).toBe(2);
    expect(r.rows_by_route).toEqual(partial);
  });
});

describe('CS41-3 verify-ai — mechanism failure (deploy failure)', () => {
  it('stops immediately and sets error when az exits non-zero', async () => {
    const az = fakeAz([{ code: 1, stdout: '', stderr: "ERROR: (AuthorizationFailed) The client does not have authorization." }]);
    const r = await verify({
      revisionName: 'rev', aiResource: 'gwn-ai-production', expectedRows: 6,
      azRunner: az, sleeper: noWait, retryWaitsMs: tinyWaits,
    });
    expect(r.error).toMatch(/az exited 1/);
    expect(r.error).toMatch(/AuthorizationFailed/);
    expect(r.warning).toBe(false);
    expect(r.threshold_met).toBe(false);
    expect(r.query_attempts).toBe(1);
  });

  it('stops on unparseable JSON (CLI version drift)', async () => {
    const az = fakeAz([{ code: 0, stdout: 'this is not json at all' }]);
    const r = await verify({
      revisionName: 'rev', aiResource: 'ai', expectedRows: 6,
      azRunner: az, sleeper: noWait, retryWaitsMs: tinyWaits,
    });
    expect(r.error).toMatch(/unparseable JSON/);
    expect(r.warning).toBe(false);
    expect(r.query_attempts).toBe(1);
  });
});

describe('CS41-3 verify-ai — KQL builder', () => {
  it('escapes single quotes in revision names (defensive)', () => {
    const kql = buildKql("rev'; drop table requests--", '10m');
    expect(kql).toContain("cloud_RoleInstance has 'rev''; drop table requests--'");
    expect(kql).toContain('ago(10m)');
  });

  it('falls back to the default time window when the input is malformed', () => {
    const kql = buildKql('rev', "10m) | extend p='x");
    // Unrecognized format ⇒ default 15m.
    expect(kql).toContain('ago(15m)');
    expect(kql).not.toContain('extend');
  });

  it('parseQueryResult handles empty array', () => {
    const r = parseQueryResult('[]');
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it('parseQueryResult flags unrecognized envelopes', () => {
    const r = parseQueryResult('{"unexpected":"shape"}');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unrecognized/);
  });
});
