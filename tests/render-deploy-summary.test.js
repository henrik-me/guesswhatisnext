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
