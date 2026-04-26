/**
 * Tests for scripts/render-deploy-summary.js (CS41-8).
 *
 * Feeds the renderer fixtures matching the schema scripts/smoke.js writes,
 * and asserts the markdown contains the expected sections, status icons,
 * and metadata lines.
 */

import { describe, it, expect } from 'vitest';
import { render } from '../scripts/render-deploy-summary.js';

const passResults = {
  target: 'gwn-staging--rev42.eastus.azurecontainerapps.io',
  startedAt: '2026-04-26T12:00:00.000Z',
  finishedAt: '2026-04-26T12:00:30.000Z',
  passed: true,
  perfWarnings: [],
  steps: [
    { step: 'healthz', status: 'pass', elapsedMs: 32, attempts: 1, status_: 200 },
    { step: 'features', status: 'pass', elapsedMs: 1234, attempts: 2 },
    { step: 'login', status: 'pass', elapsedMs: 84 },
    { step: 'submit-score', status: 'pass', elapsedMs: 51, id: 4242, score: 777 },
    { step: 'me-scores', status: 'pass', elapsedMs: 38, scoreCount: 5 },
    { step: 'health', status: 'pass', elapsedMs: 22, dbStatus: 'ok' },
  ],
};

const failResults = {
  target: 'gwn-staging--bad.eastus.azurecontainerapps.io',
  startedAt: '2026-04-26T12:00:00.000Z',
  passed: false,
  perfWarnings: [{ step: 'features', elapsedMs: 5500, threshold: 2000 }],
  steps: [
    { step: 'healthz', status: 'pass', elapsedMs: 50, attempts: 1 },
    { step: 'features', status: 'fail', elapsedMs: 5500, lastStatus: 503 },
  ],
};

describe('CS41-8 — render-deploy-summary happy path', () => {
  it('emits all required sections + ✅ for each pass step', () => {
    const env = { IMAGE_SHA: 'abc1234', REVISION_NAME: 'gwn-staging--rev42', MIGRATION_STATUS: 'applied', ENVIRONMENT: 'staging' };
    const md = render(passResults, env);
    expect(md).toMatch(/^## Deploy Summary/);
    expect(md).toContain('**Image SHA:** `abc1234`');
    expect(md).toContain('**Revision:** `gwn-staging--rev42`');
    expect(md).toContain('**Migration:** ✅ applied');
    expect(md).toContain('**Environment:** `staging`');
    expect(md).toContain('### Smoke results');
    expect(md).toContain('| /healthz | ✅ |');
    expect(md).toContain('| /api/features | ✅ |');
    expect(md).toContain('| POST /api/auth/login | ✅ |');
    expect(md).toContain('id=4242');
    expect(md).toContain('| GET /api/health (DB) | ✅ |');
    expect(md).toContain('### AI verification');
    // No verification file present in this test → falls back to the
    // "not run" placeholder (verified more thoroughly in CS41-3 tests).
    expect(md).toMatch(/_AI verification not run/);
    // No perf-warnings section when array is empty
    expect(md).not.toContain('### Perf warnings');
  });

  it('formats elapsed under 1s as ms and over 1s as s', () => {
    const md = render(passResults, {});
    expect(md).toContain('32ms');
    expect(md).toContain('1.23s');
  });
});

describe('CS41-8 — render-deploy-summary failure / partial', () => {
  it('marks failed step with ❌ and surfaces perf warnings table', () => {
    const md = render(failResults, { IMAGE_SHA: 'def5678', REVISION_NAME: 'gwn-staging--bad' });
    expect(md).toContain('**Smoke verdict:** ❌ fail');
    expect(md).toContain('| /api/features | ❌ |');
    expect(md).toContain('### Perf warnings');
    expect(md).toContain('| /api/features | 5.50s | 2.00s |');
  });

  it('renders skipped /api/health step with warning icon', () => {
    const r = {
      target: 't', passed: true, perfWarnings: [],
      steps: [
        { step: 'healthz', status: 'pass', elapsedMs: 10 },
        { step: 'features', status: 'pass', elapsedMs: 10 },
        { step: 'login', status: 'pass', elapsedMs: 10 },
        { step: 'submit-score', status: 'pass', elapsedMs: 10, id: 1, score: 2 },
        { step: 'me-scores', status: 'pass', elapsedMs: 10, scoreCount: 1 },
        { step: 'health', status: 'skip', reason: 'no SYSTEM_API_KEY' },
      ],
    };
    const md = render(r, {});
    expect(md).toContain('| GET /api/health (DB) | ⚠️ skipped | — | no SYSTEM_API_KEY |');
  });

  it('handles missing migration status as N/A', () => {
    const md = render(passResults, {});
    expect(md).toContain('**Migration:** N/A');
  });

  it('renders a degraded summary when results object has no steps', () => {
    const md = render({ passed: false, steps: [] }, {});
    expect(md).toContain('_no steps recorded_');
    expect(md).toContain('**Smoke verdict:** ❌ fail');
  });
});

describe('CS41-3 — AI verification rendering', () => {
  // Use a tmp file inside the repo (NEVER /tmp per env policy) and clean
  // up after each test so we don't pollute the working tree.
  const fs = require('node:fs');
  const path = require('node:path');
  const tmpFile = path.join(process.cwd(), `ai-verification.test.${process.pid}.json`);

  function withFixture(data, fn) {
    fs.writeFileSync(tmpFile, JSON.stringify(data));
    try { return fn({ AI_VERIFICATION_PATH: tmpFile }); } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
    }
  }

  it('renders ✅ status with per-route breakdown when threshold met', () => {
    const data = {
      ai_resource: 'gwn-ai-production',
      revision_name: 'gwn-production--rev42-xy',
      time_window: '15m',
      query_attempts: 2,
      query_duration_ms: 3400,
      rows_total: 6,
      expected_rows: 6,
      threshold_met: true,
      warning: false,
      error: null,
      rows_by_route: [
        { name: 'GET /healthz', resultCode: '200', count: 1 },
        { name: 'POST /api/scores', resultCode: '201', count: 1 },
      ],
    };
    const md = withFixture(data, (env) => render(passResults, env));
    expect(md).toContain('### AI verification');
    expect(md).toContain('**AI resource:** `gwn-ai-production`');
    expect(md).toContain('**Revision:** `gwn-production--rev42-xy`');
    expect(md).toContain('**Query attempts:** 2');
    expect(md).toContain('**Rows captured:** 6 (expected ≥ 6)');
    expect(md).toContain('All smoke probes ingested');
    expect(md).toContain('`POST /api/scores`: 1 (201)');
  });

  it('renders ⚠️ status when warning=true (ingest delayed)', () => {
    const data = {
      ai_resource: 'gwn-ai-production', revision_name: 'rev', time_window: '15m',
      query_attempts: 7, query_duration_ms: 9100,
      rows_total: 0, expected_rows: 6, threshold_met: false,
      warning: true, error: null, rows_by_route: [],
    };
    const md = withFixture(data, (env) => render(passResults, env));
    expect(md).toContain('⚠️ ingest delayed beyond budget');
    expect(md).toContain('deploy NOT rolled back');
  });

  it('renders ❌ status when error is set (mechanism failure)', () => {
    const data = {
      ai_resource: 'gwn-ai-production', revision_name: 'rev', time_window: '15m',
      query_attempts: 1, query_duration_ms: 800,
      rows_total: 0, expected_rows: 6, threshold_met: false,
      warning: false, error: 'az exited 1: AuthorizationFailed',
      rows_by_route: [],
    };
    const md = withFixture(data, (env) => render(passResults, env));
    expect(md).toContain('❌ AI access broken');
    expect(md).toContain('AuthorizationFailed');
  });
});
