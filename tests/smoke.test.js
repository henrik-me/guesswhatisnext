/**
 * Tests for scripts/smoke.js (CS41-1 + CS41-2).
 *
 * Verifies the poll-loop's 503+Retry-After tolerance, the per-step pass/fail
 * shape consumed by render-deploy-summary.js, sentinel uniqueness, and the
 * malformed-200 defense for /api/features.
 */

import { describe, it, expect } from 'vitest';
import { runSmoke, pollUntil200, sentinelScore } from '../scripts/smoke.js';

/**
 * Build a fake fetcher whose responses are scripted by URL+method. Each
 * entry can be a single response object or an array (consumed in order;
 * subsequent calls reuse the last entry, so cold-start retries terminate
 * naturally).
 */
function makeFetcher(scripts) {
  const counters = new Map();
  return async function fakeFetcher(method, url, _opts) {
    const key = `${method} ${new URL(url).pathname}`;
    const list = scripts[key];
    if (!list) throw new Error(`unscripted call: ${key}`);
    const arr = Array.isArray(list) ? list : [list];
    const i = counters.get(key) || 0;
    counters.set(key, i + 1);
    const r = arr[Math.min(i, arr.length - 1)];
    return { elapsedMs: r.elapsedMs ?? 5, ...r };
  };
}

const baseOpts = {
  warmupCapMs: 100,
  coldStartMs: 100,
  perfWarnMs: 50,
  probeIntervalMs: 1,
  requestTimeoutMs: 1000,
  healthzTimeoutMs: 200,
};

const okFeaturesBody = JSON.stringify({ features: { foo: true } });
const okMeBody = (id) => JSON.stringify({ scores: [{ id, mode: 'freeplay', score: 42 }], stats: [] });

describe('CS41-1 — sentinel score uniqueness (rubber-duck guard)', () => {
  it('does not collide across 1000 generations (vs $RANDOM 0-32767)', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(sentinelScore());
    // crypto.randomInt over 1..1e9 should give ≥ 999/1000 unique
    expect(seen.size).toBeGreaterThan(995);
  });
});

describe('CS41-1 — pollUntil200 cold-start handling', () => {
  it('treats 503+Retry-After as cold-start and retries until 200', async () => {
    const fetcher = makeFetcher({
      'GET /api/features': [
        { status: 503, headers: { 'retry-after': '1' }, body: '{"phase":"cold-start"}' },
        { status: 503, headers: { 'retry-after': '1' }, body: '{"phase":"cold-start"}' },
        { status: 200, headers: {}, body: okFeaturesBody },
      ],
    });
    const r = await pollUntil200({
      url: 'https://x.example/api/features',
      budgetMs: 5000, intervalMs: 1, fetcher, requestTimeoutMs: 100,
    });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
  });

  it('stops early on a non-retryable 4xx (e.g. 400) and reports failure', async () => {
    const fetcher = makeFetcher({
      'GET /api/features': { status: 400, headers: {}, body: 'bad' },
    });
    const r = await pollUntil200({
      url: 'https://x.example/api/features',
      budgetMs: 5000, intervalMs: 1, fetcher, requestTimeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.finalStatus).toBe(400);
  });

  it('times out cleanly when budget is exhausted', async () => {
    const fetcher = makeFetcher({
      'GET /api/features': { status: 503, headers: { 'retry-after': '1' }, body: '{}' },
    });
    const r = await pollUntil200({
      url: 'https://x.example/api/features',
      budgetMs: 50, intervalMs: 5, fetcher, requestTimeoutMs: 100,
    });
    expect(r.ok).toBe(false);
    expect(r.finalStatus).toBe(503);
    expect(r.attempts).toBeGreaterThanOrEqual(1);
  });
});

describe('CS41-1 — runSmoke happy path', () => {
  it('passes all six steps and writes structured results', async () => {
    const fetcher = makeFetcher({
      'GET /healthz': { status: 200, headers: {}, body: 'ok' },
      'GET /api/features': { status: 200, headers: {}, body: okFeaturesBody },
      'POST /api/auth/login': { status: 200, headers: {}, body: JSON.stringify({ token: 't' }) },
      'POST /api/scores': { status: 201, headers: {}, body: JSON.stringify({ id: 99 }) },
      'GET /api/scores/me': { status: 200, headers: {}, body: okMeBody(99) },
      'GET /api/health': { status: 200, headers: {}, body: JSON.stringify({ checks: { database: { status: 'ok' } } }) },
    });
    const r = await runSmoke({
      targetFqdn: 'rev.example.test',
      password: 'pw',
      systemApiKey: 'sys',
      opts: baseOpts,
      fetcher,
    });
    expect(r.passed).toBe(true);
    const stepNames = r.steps.map((s) => s.step);
    expect(stepNames).toEqual(['healthz', 'features', 'login', 'submit-score', 'me-scores', 'health']);
    expect(r.steps.every((s) => s.status === 'pass')).toBe(true);
  });
});

describe('CS41-1 — runSmoke failure modes', () => {
  it('fails fast when login returns no token (rubber-duck: malformed login)', async () => {
    const fetcher = makeFetcher({
      'GET /healthz': { status: 200, headers: {}, body: 'ok' },
      'GET /api/features': { status: 200, headers: {}, body: okFeaturesBody },
      'POST /api/auth/login': { status: 401, headers: {}, body: JSON.stringify({ error: 'nope' }) },
    });
    const r = await runSmoke({
      targetFqdn: 'rev.example.test', password: 'pw', systemApiKey: '', opts: baseOpts, fetcher,
    });
    expect(r.passed).toBe(false);
    expect(r.steps.find((s) => s.step === 'login').status).toBe('fail');
    expect(r.steps.find((s) => s.step === 'submit-score')).toBeUndefined();
  });

  it('fails when /api/scores/me does not contain the submitted id', async () => {
    const fetcher = makeFetcher({
      'GET /healthz': { status: 200, headers: {}, body: 'ok' },
      'GET /api/features': { status: 200, headers: {}, body: okFeaturesBody },
      'POST /api/auth/login': { status: 200, headers: {}, body: JSON.stringify({ token: 't' }) },
      'POST /api/scores': { status: 201, headers: {}, body: JSON.stringify({ id: 7 }) },
      'GET /api/scores/me': { status: 200, headers: {}, body: okMeBody(8) }, // wrong id
    });
    const r = await runSmoke({
      targetFqdn: 'rev.example.test', password: 'pw', systemApiKey: '', opts: baseOpts, fetcher,
    });
    expect(r.passed).toBe(false);
    expect(r.steps.find((s) => s.step === 'me-scores').status).toBe('fail');
  });

  it('fails when /api/features returns 200 but malformed body (rubber-duck guard)', async () => {
    const fetcher = makeFetcher({
      'GET /healthz': { status: 200, headers: {}, body: 'ok' },
      'GET /api/features': { status: 200, headers: {}, body: '<html>oops</html>' },
    });
    const r = await runSmoke({
      targetFqdn: 'rev.example.test', password: 'pw', systemApiKey: '', opts: baseOpts, fetcher,
    });
    expect(r.passed).toBe(false);
    const featStep = r.steps.find((s) => s.step === 'features');
    expect(featStep.status).toBe('fail');
    expect(featStep.error).toMatch(/malformed/);
  });

  it('skips /api/health when SYSTEM_API_KEY is absent (does not fail the run)', async () => {
    const fetcher = makeFetcher({
      'GET /healthz': { status: 200, headers: {}, body: 'ok' },
      'GET /api/features': { status: 200, headers: {}, body: okFeaturesBody },
      'POST /api/auth/login': { status: 200, headers: {}, body: JSON.stringify({ token: 't' }) },
      'POST /api/scores': { status: 201, headers: {}, body: JSON.stringify({ id: 1 }) },
      'GET /api/scores/me': { status: 200, headers: {}, body: okMeBody(1) },
    });
    const r = await runSmoke({
      targetFqdn: 'rev.example.test', password: 'pw', systemApiKey: '', opts: baseOpts, fetcher,
    });
    expect(r.passed).toBe(true);
    const healthStep = r.steps.find((s) => s.step === 'health');
    expect(healthStep.status).toBe('skip');
  });

  it('CS41-2: per-request elapsed > perfWarnMs records a perf warning but does not fail', async () => {
    // Slow the /api/features fetcher with a real setTimeout so wall-clock
    // elapsed actually crosses the (very low) warn threshold.
    const slow = (ms, body) => () => new Promise((r) => setTimeout(() => r(body), ms));
    const counters = new Map();
    const slowFeatures = slow(40, { status: 200, headers: {}, body: okFeaturesBody, elapsedMs: 40 });
    async function fetcher(method, url) {
      const key = `${method} ${new URL(url).pathname}`;
      const map = {
        'GET /healthz': { status: 200, headers: {}, body: 'ok' },
        'POST /api/auth/login': { status: 200, headers: {}, body: JSON.stringify({ token: 't' }) },
        'POST /api/scores': { status: 201, headers: {}, body: JSON.stringify({ id: 1 }) },
        'GET /api/scores/me': { status: 200, headers: {}, body: okMeBody(1) },
      };
      counters.set(key, (counters.get(key) || 0) + 1);
      if (key === 'GET /api/features') return slowFeatures();
      return map[key];
    }
    const r = await runSmoke({
      targetFqdn: 'rev.example.test', password: 'pw', systemApiKey: '',
      opts: { ...baseOpts, perfWarnMs: 10 },
      fetcher,
    });
    expect(r.passed).toBe(true);
    expect(r.perfWarnings.length).toBeGreaterThan(0);
  });
});
