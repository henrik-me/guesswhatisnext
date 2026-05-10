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
  it('passes all seven steps (six smoke + CS81-2 cleanup) and writes structured results', async () => {
    // Test isolation: explicitly unset DATABASE_URL so the CS81-2
    // cleanup step takes the documented 'skip' path regardless of
    // whether the test runner is `npm test` (in-memory) or
    // `npm run test:mssql` (which sets process.env.DATABASE_URL
    // globally via scripts/test-mssql.js).
    const prevDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
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
      expect(stepNames).toEqual(['healthz', 'features', 'login', 'submit-score', 'me-scores', 'health', 'cleanup']);
      // All steps pass except cleanup which 'skip's because DATABASE_URL is
      // unset in this test (CS81-2 fail-soft skip path; not a regression).
      expect(r.steps.filter((s) => s.step !== 'cleanup').every((s) => s.status === 'pass')).toBe(true);
      const cleanup = r.steps.find((s) => s.step === 'cleanup');
      expect(cleanup.status).toBe('skip');
      expect(cleanup.reason).toBe('no DATABASE_URL');
    } finally {
      if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
    }
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

describe('CS79 — /api/features cold-init gate (X-User-Activity propagation)', () => {
  /**
   * Builds a fetcher that simulates the CS53-19 boot-quiet gate
   * (server/app.js:332-351): every `/api/features` GET that does NOT carry
   * `X-User-Activity: 1` returns 503+Retry-After forever (boot-quiet
   * never fires `runInit()` so `dbInitialized` stays false). The first
   * request that DOES carry the header still gets 503 (the gate kicks
   * `runInit()` but the current request still 503s by design), and
   * subsequent requests carrying the header get 200. The Retry-After
   * value is `'0'` so `pollUntil200()` does not stall the test on the
   * server-suggested back-off; the real server returns 5 here, which the
   * smoke runner caps at 5s — irrelevant to the assertions this file
   * makes (header propagation, not back-off honoring).
   *
   * Other smoke endpoints respond with their normal happy-path bodies so
   * the rest of `runSmoke()` proceeds. The fetcher records every observed
   * `/api/features` request for assertion. Header lookup is
   * case-insensitive to mirror the server side (Express's `req.get()`
   * normalizes), so the assertion proves header presence rather than a
   * particular casing choice in `scripts/smoke.js`.
   */
  function makeColdInitFeaturesFetcher(otherSteps) {
    const featuresCalls = [];
    let featuresWithHeaderSeen = 0;
    return {
      featuresCalls,
      async fetcher(method, url, opts = {}) {
        const key = `${method} ${new URL(url).pathname}`;
        if (key === 'GET /api/features') {
          const headers = opts.headers || {};
          const activityValue = Object.entries(headers).find(([k]) => k.toLowerCase() === 'x-user-activity')?.[1];
          const hasActivity = activityValue === '1';
          featuresCalls.push({ headers: { ...headers }, hasActivity });
          if (!hasActivity) {
            return { status: 503, headers: { 'retry-after': '0' }, body: '{"phase":"cold-start"}', elapsedMs: 2 };
          }
          featuresWithHeaderSeen++;
          // Match server behavior: the gate-triggering request still 503s
          // (runInit fires but is fire-and-forget); the next retry sees
          // dbInitialized=true and gets 200.
          if (featuresWithHeaderSeen === 1) {
            return { status: 503, headers: { 'retry-after': '0' }, body: '{"phase":"cold-start"}', elapsedMs: 2 };
          }
          return { status: 200, headers: {}, body: okFeaturesBody, elapsedMs: 3 };
        }
        const next = otherSteps[key];
        if (!next) throw new Error(`unscripted call: ${key}`);
        return { elapsedMs: 5, ...next };
      },
    };
  }

  it('runSmoke succeeds against a fresh-cold container and sends X-User-Activity on every /api/features retry', async () => {
    const { fetcher, featuresCalls } = makeColdInitFeaturesFetcher({
      'GET /healthz': { status: 200, headers: {}, body: 'ok' },
      'POST /api/auth/login': { status: 200, headers: {}, body: JSON.stringify({ token: 't' }) },
      'POST /api/scores': { status: 201, headers: {}, body: JSON.stringify({ id: 1 }) },
      'GET /api/scores/me': { status: 200, headers: {}, body: okMeBody(1) },
      'GET /api/health': { status: 200, headers: {}, body: JSON.stringify({ checks: { database: { status: 'ok' } } }) },
    });
    const r = await runSmoke({
      targetFqdn: 'rev.example.test',
      password: 'pw',
      systemApiKey: 'sys',
      // Cold-start budget large enough for at least two retries at the
      // configured probeIntervalMs (1ms in baseOpts). The fake's
      // Retry-After is '0', so pollUntil200 falls back to intervalMs and
      // does NOT honor a server-suggested back-off here.
      opts: { ...baseOpts, warmupCapMs: 1000, coldStartMs: 1000 },
      fetcher,
    });
    expect(r.passed).toBe(true);
    const featStep = r.steps.find((s) => s.step === 'features');
    expect(featStep.status).toBe('pass');
    // (i) every /api/features probe must carry X-User-Activity: 1 — not
    //     just the first. A regression that drops the header on retries
    //     would cause the fetcher to return 503 forever and the smoke to
    //     fail; this assertion guards against that subtler regression.
    expect(featuresCalls.length).toBeGreaterThanOrEqual(2);
    expect(featuresCalls.every((c) => c.hasActivity)).toBe(true);
  });

  it('regression guard: pollUntil200 without X-User-Activity stays 503 until budget exhaustion', async () => {
    // Exercises pollUntil200() directly with NO headers to prove the fake
    // matches the real server's boot-quiet behavior: missing-header →
    // 503 forever. This is the failure mode CS73 hit in prod (run
    // 25617860563); a regression that silently dropped the header from
    // runSmoke's /api/features call site would manifest as `r.ok=false`
    // here once that site started exercising this code path.
    const { fetcher } = makeColdInitFeaturesFetcher({});
    const r = await pollUntil200({
      url: 'https://x.example/api/features',
      budgetMs: 30, intervalMs: 1, fetcher, requestTimeoutMs: 100,
      // headers intentionally omitted
    });
    expect(r.ok).toBe(false);
    expect(r.finalStatus).toBe(503);
  });
});
