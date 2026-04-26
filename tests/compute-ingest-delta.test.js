/**
 * Tests for scripts/compute-ingest-delta.js (CS41-7).
 *
 * DI-injected fakes for both `gh run list` and `az monitor app-insights
 * query`. Covers:
 *   - Happy path: prior successful run → AI query returns rows → totals.
 *   - First-deploy edge: gh returns [] → 24h fallback + used_fallback flag.
 *   - gh failure: exit non-zero → fallback + gh_error captured.
 *   - AI mechanism failure: az exit non-zero → result.error set, totals 0.
 *   - Unparseable AI JSON: error captured, totals 0.
 *   - Window calculation: prev ISO from gh threads through to window_start.
 *   - KQL injection defense: single quotes in prevIso are escaped.
 *   - Tables-envelope and flat-array response shapes both parse.
 *   - In-flight run flip case: gh returns 2 entries → second is used.
 */

import { describe, it, expect } from 'vitest';
import {
  computeIngestDelta,
  resolvePreviousSuccessIso,
  buildKql,
  parseQueryResult,
  normalizeRow,
} from '../scripts/compute-ingest-delta.js';

function fakeGh(scriptOrFn) {
  const calls = [];
  const fn = typeof scriptOrFn === 'function'
    ? scriptOrFn
    : () => ({ code: 0, stdout: '[]', stderr: '', ...scriptOrFn });
  const runner = async (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return fn();
  };
  runner.calls = calls;
  return runner;
}

function fakeAz(scriptOrFn) {
  const calls = [];
  const fn = typeof scriptOrFn === 'function'
    ? scriptOrFn
    : () => ({ code: 0, stdout: '[]', stderr: '', ...scriptOrFn });
  const runner = async (args, opts) => {
    calls.push({ args, opts });
    return fn();
  };
  runner.calls = calls;
  return runner;
}

function ghJson(entries) {
  return JSON.stringify(entries.map((iso) => ({ createdAt: iso })));
}

function envelope(rows) {
  return JSON.stringify({
    tables: [{
      name: 'PrimaryResult',
      columns: [{ name: 'itemType' }, { name: 'gb_ingested' }, { name: 'rows' }],
      rows: rows.map((r) => [r.itemType, r.gb_ingested, r.rows]),
    }],
  });
}

const FIXED_NOW = Date.parse('2026-04-26T22:15:00.000Z');
const fixedNow = () => FIXED_NOW;

describe('CS41-7 — buildKql', () => {
  it('scopes to explicit tables (no `union *`)', () => {
    const kql = buildKql('2026-04-26T19:30:00Z');
    expect(kql).toContain('union requests, dependencies, traces, customEvents, exceptions');
    expect(kql).not.toContain('union *');
  });

  it('escapes single quotes in prev ISO (KQL injection defense)', () => {
    const kql = buildKql("2026-04-26T19:30:00Z' | drop *");
    // Quote inside the user-supplied value should be doubled to neutralize.
    expect(kql).toContain("00Z'' | drop *");
  });

  it('filters non-identifier table names defensively', () => {
    const kql = buildKql('2026-04-26T00:00:00Z', ['requests', 'bad-name; drop', 'traces']);
    expect(kql).toContain('union requests, traces');
    expect(kql).not.toContain('bad-name');
  });
});

describe('CS41-7 — parseQueryResult', () => {
  it('parses tables-envelope shape', () => {
    const r = parseQueryResult(envelope([
      { itemType: 'requests', gb_ingested: 0.0021, rows: 32 },
      { itemType: 'traces', gb_ingested: 0.001, rows: 8 },
    ]));
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([
      { itemType: 'requests', gb_ingested: 0.0021, rows: 32 },
      { itemType: 'traces', gb_ingested: 0.001, rows: 8 },
    ]);
  });

  it('parses flat-array shape', () => {
    const r = parseQueryResult(JSON.stringify([
      { itemType: 'requests', gb_ingested: 0.0021, rows: 32 },
    ]));
    expect(r.ok).toBe(true);
    expect(r.rows[0].itemType).toBe('requests');
  });

  it('returns ok=false on unparseable JSON', () => {
    const r = parseQueryResult('not json');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unparseable JSON/);
  });

  it('handles empty tables', () => {
    const r = parseQueryResult(JSON.stringify({ tables: [{ columns: [], rows: [] }] }));
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });
});

describe('CS41-7 — normalizeRow defaults', () => {
  it('defaults missing fields to safe values', () => {
    expect(normalizeRow({})).toEqual({ itemType: '', gb_ingested: 0, rows: 0 });
    expect(normalizeRow({ itemType: 'requests', count_: 5 }))
      .toEqual({ itemType: 'requests', gb_ingested: 0, rows: 5 });
  });
});

describe('CS41-7 — resolvePreviousSuccessIso', () => {
  it('returns prior createdAt when gh returns one entry', async () => {
    const gh = fakeGh({ stdout: ghJson(['2026-04-26T19:30:00.000Z']) });
    const r = await resolvePreviousSuccessIso({
      workflow: 'prod-deploy.yml', ghRunner: gh, now: fixedNow, fallbackHours: 24,
    });
    expect(r.fallback).toBe(false);
    expect(r.iso).toBe('2026-04-26T19:30:00.000Z');
  });

  it('returns most recent createdAt (parsed[0]) — current in-flight run is not yet success', async () => {
    const gh = fakeGh({
      stdout: ghJson(['2026-04-26T19:30:00.000Z', '2026-04-25T10:00:00.000Z']),
    });
    const r = await resolvePreviousSuccessIso({
      workflow: 'prod-deploy.yml', ghRunner: gh, now: fixedNow, fallbackHours: 24,
    });
    expect(r.fallback).toBe(false);
    expect(r.iso).toBe('2026-04-26T19:30:00.000Z');
  });

  it('defensively excludes current run id when GITHUB_RUN_ID matches a returned entry', async () => {
    process.env.GITHUB_RUN_ID = '999';
    try {
      const gh = async () => ({
        code: 0,
        stdout: JSON.stringify([
          { databaseId: 999, createdAt: '2026-04-26T22:14:00.000Z' },
          { databaseId: 998, createdAt: '2026-04-26T19:30:00.000Z' },
        ]),
        stderr: '',
      });
      const r = await resolvePreviousSuccessIso({
        workflow: 'prod-deploy.yml', ghRunner: gh, now: fixedNow, fallbackHours: 24,
      });
      expect(r.fallback).toBe(false);
      expect(r.iso).toBe('2026-04-26T19:30:00.000Z');
    } finally {
      delete process.env.GITHUB_RUN_ID;
    }
  });

  it('falls back to N hours when gh returns no successful runs', async () => {
    const gh = fakeGh({ stdout: '[]' });
    const r = await resolvePreviousSuccessIso({
      workflow: 'prod-deploy.yml', ghRunner: gh, now: fixedNow, fallbackHours: 24,
    });
    expect(r.fallback).toBe(true);
    const expectedIso = new Date(FIXED_NOW - 24 * 3600 * 1000).toISOString();
    expect(r.iso).toBe(expectedIso);
  });

  it('falls back when gh exits non-zero, captures error', async () => {
    const gh = fakeGh({ code: 1, stdout: '', stderr: 'auth failed' });
    const r = await resolvePreviousSuccessIso({
      workflow: 'prod-deploy.yml', ghRunner: gh, now: fixedNow, fallbackHours: 12,
    });
    expect(r.fallback).toBe(true);
    expect(r.error).toMatch(/auth failed/);
    const expectedIso = new Date(FIXED_NOW - 12 * 3600 * 1000).toISOString();
    expect(r.iso).toBe(expectedIso);
  });

  it('falls back on unparseable gh JSON', async () => {
    const gh = fakeGh({ stdout: 'not json' });
    const r = await resolvePreviousSuccessIso({
      workflow: 'prod-deploy.yml', ghRunner: gh, now: fixedNow, fallbackHours: 24,
    });
    expect(r.fallback).toBe(true);
    expect(r.error).toMatch(/unparseable/);
  });

  it('falls back when WORKFLOW is missing', async () => {
    const gh = fakeGh({ stdout: ghJson(['x']) });
    const r = await resolvePreviousSuccessIso({
      workflow: '', ghRunner: gh, now: fixedNow, fallbackHours: 24,
    });
    expect(r.fallback).toBe(true);
    // gh should NOT have been called.
    expect(gh.calls.length).toBe(0);
  });
});

describe('CS41-7 — computeIngestDelta happy path', () => {
  it('threads prev ISO into window + KQL, sums totals', async () => {
    const gh = fakeGh({ stdout: ghJson(['2026-04-26T19:30:00.000Z']) });
    const az = fakeAz({ stdout: envelope([
      { itemType: 'requests', gb_ingested: 0.0021, rows: 32 },
      { itemType: 'customEvents', gb_ingested: 0.0013, rows: 15 },
    ]) });

    const r = await computeIngestDelta({
      env: 'production',
      workflow: 'prod-deploy.yml',
      azRunner: az,
      ghRunner: gh,
      now: fixedNow,
    });

    expect(r.error).toBeNull();
    expect(r.env).toBe('production');
    expect(r.ai_resource).toBe('gwn-ai-production');
    expect(r.window_start).toBe('2026-04-26T19:30:00.000Z');
    expect(r.window_end).toBe(new Date(FIXED_NOW).toISOString());
    expect(r.used_fallback).toBe(false);
    expect(r.by_itemType).toHaveLength(2);
    expect(r.total_rows).toBe(47);
    expect(r.total_gb).toBeCloseTo(0.0034, 6);
    // KQL was passed to az.
    const azCall = az.calls[0];
    expect(azCall.args).toContain('--analytics-query');
    const kql = azCall.args[azCall.args.indexOf('--analytics-query') + 1];
    expect(kql).toContain("datetime('2026-04-26T19:30:00.000Z')");
    expect(kql).toContain('union requests, dependencies, traces, customEvents, exceptions');
    // AI app + RG threaded through.
    expect(azCall.args).toContain('gwn-ai-production');
    expect(azCall.args).toContain('gwn-rg');
  });

  it('respects AI_RESOURCE override', async () => {
    const gh = fakeGh({ stdout: ghJson(['2026-04-26T19:30:00.000Z']) });
    const az = fakeAz({ stdout: '[]' });
    const r = await computeIngestDelta({
      env: 'production',
      workflow: 'prod-deploy.yml',
      aiResource: 'gwn-ai-custom',
      azRunner: az,
      ghRunner: gh,
      now: fixedNow,
    });
    expect(r.ai_resource).toBe('gwn-ai-custom');
    expect(az.calls[0].args).toContain('gwn-ai-custom');
  });
});

describe('CS41-7 — computeIngestDelta first-deploy fallback', () => {
  it('uses 24h fallback when no prior successful run exists', async () => {
    const gh = fakeGh({ stdout: '[]' });
    const az = fakeAz({ stdout: envelope([{ itemType: 'requests', gb_ingested: 0.001, rows: 5 }]) });
    const r = await computeIngestDelta({
      env: 'staging', workflow: 'staging-deploy.yml',
      azRunner: az, ghRunner: gh, now: fixedNow,
    });
    expect(r.used_fallback).toBe(true);
    expect(r.fallback_hours).toBe(24);
    const expectedStart = new Date(FIXED_NOW - 24 * 3600 * 1000).toISOString();
    expect(r.window_start).toBe(expectedStart);
    expect(r.error).toBeNull();
    expect(r.total_rows).toBe(5);
  });

  it('honors custom fallbackHours', async () => {
    const gh = fakeGh({ stdout: '[]' });
    const az = fakeAz({ stdout: '[]' });
    const r = await computeIngestDelta({
      env: 'staging', workflow: 'staging-deploy.yml', fallbackHours: 6,
      azRunner: az, ghRunner: gh, now: fixedNow,
    });
    expect(r.fallback_hours).toBe(6);
    expect(r.window_start).toBe(new Date(FIXED_NOW - 6 * 3600 * 1000).toISOString());
  });
});

describe('CS41-7 — computeIngestDelta failure modes', () => {
  it('AI query mechanism failure → result.error set, zero totals', async () => {
    const gh = fakeGh({ stdout: ghJson(['2026-04-26T19:30:00.000Z']) });
    const az = fakeAz({ code: 1, stdout: '', stderr: 'auth: subscription not registered' });
    const r = await computeIngestDelta({
      env: 'production', workflow: 'prod-deploy.yml',
      azRunner: az, ghRunner: gh, now: fixedNow,
    });
    expect(r.error).toMatch(/az exited 1/);
    expect(r.total_rows).toBe(0);
    expect(r.total_gb).toBe(0);
    expect(r.by_itemType).toEqual([]);
    // window_start still set (prior deploy lookup succeeded).
    expect(r.window_start).toBe('2026-04-26T19:30:00.000Z');
  });

  it('AI returns unparseable JSON → result.error set', async () => {
    const gh = fakeGh({ stdout: ghJson(['2026-04-26T19:30:00.000Z']) });
    const az = fakeAz({ code: 0, stdout: 'not json' });
    const r = await computeIngestDelta({
      env: 'production', workflow: 'prod-deploy.yml',
      azRunner: az, ghRunner: gh, now: fixedNow,
    });
    expect(r.error).toMatch(/unparseable/);
    expect(r.total_rows).toBe(0);
  });

  it('returns error result when env is missing', async () => {
    const r = await computeIngestDelta({
      env: '', workflow: 'prod-deploy.yml',
      azRunner: fakeAz({}), ghRunner: fakeGh({}), now: fixedNow,
    });
    expect(r.error).toMatch(/ENV is required/);
  });

  it('gh failure does not block AI query — both errors recorded', async () => {
    const gh = fakeGh({ code: 1, stderr: 'gh broke' });
    const az = fakeAz({ stdout: envelope([{ itemType: 'requests', gb_ingested: 0.001, rows: 3 }]) });
    const r = await computeIngestDelta({
      env: 'staging', workflow: 'staging-deploy.yml',
      azRunner: az, ghRunner: gh, now: fixedNow,
    });
    expect(r.used_fallback).toBe(true);
    expect(r.gh_error).toMatch(/gh broke/);
    expect(r.error).toBeNull(); // AI query succeeded
    expect(r.total_rows).toBe(3);
  });
});
