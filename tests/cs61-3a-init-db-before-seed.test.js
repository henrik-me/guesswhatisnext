/**
 * CS61-3a — Force DB init via /api/admin/init-db before the seed loop.
 *
 * Workflow YAML structural tests. The seed endpoint (CS61-1) sits behind
 * the /api/admin/* cold-start gate bypass (server/app.js:296), so it can
 * run while the DB is un-initialized and 500 (e.g. SQLITE_ERROR: no such
 * table: users — observed during the failed CS61-6 verification deploy
 * run 24971160848). Calling POST /api/admin/init-db first explicitly
 * triggers runInit() (server/app.js:531), so the subsequent seed call
 * lands against a ready DB.
 *
 * The position of the init-db call between the /healthz wait and the
 * seed loop is the entire correctness contract — if a future edit
 * deletes the call or moves it after the seed loop, the gate is
 * silently lost. Line-position checks against canonical anchor strings
 * are sufficient.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WF_DIR = join(__dirname, '..', '.github', 'workflows');

function lineOf(content, substring) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(substring)) return i + 1;
  }
  return -1;
}

describe('CS61-3a deploy YAML structure (staging-deploy.yml)', () => {
  const yaml = readFileSync(join(WF_DIR, 'staging-deploy.yml'), 'utf8');

  const lineSeedStep = lineOf(yaml, '- name: Seed gwn-smoke-bot via API (CS61-1)');
  const lineHealthzWait = lineOf(yaml, 'Waiting for /healthz on $NEW_REVISION_FQDN before seeding');
  const lineHealthzOkGate = lineOf(yaml, 'CS61-1: /healthz on $NEW_REVISION_FQDN did not become ready');
  const lineInitDbBanner = lineOf(yaml, 'Forcing DB init via /api/admin/init-db (CS61-3a)');
  const lineInitDbErr = lineOf(yaml, 'CS61-3a: /api/admin/init-db on $NEW_REVISION_FQDN did not return 200');
  const lineSeedLoop = lineOf(yaml, 'node scripts/seed-smoke-user-via-api.js');

  it('contains the CS61-3a init-db forcing banner inside the seed step', () => {
    expect(lineInitDbBanner).toBeGreaterThan(0);
    expect(lineInitDbBanner).toBeGreaterThan(lineSeedStep);
  });

  it('contains the CS61-3a init-db failure error message with the operator-grep marker', () => {
    expect(lineInitDbErr).toBeGreaterThan(0);
    expect(yaml).toMatch(/CS61-3a: \/api\/admin\/init-db on \$NEW_REVISION_FQDN did not return 200/);
  });

  it('orders the init-db call AFTER the /healthz wait succeeds', () => {
    expect(lineHealthzWait).toBeGreaterThan(0);
    expect(lineHealthzOkGate).toBeGreaterThan(0);
    expect(lineInitDbBanner).toBeGreaterThan(lineHealthzWait);
    expect(lineInitDbBanner).toBeGreaterThan(lineHealthzOkGate);
  });

  it('orders the init-db call BEFORE the seed loop', () => {
    expect(lineSeedLoop).toBeGreaterThan(0);
    expect(lineInitDbBanner).toBeLessThan(lineSeedLoop);
    expect(lineInitDbErr).toBeLessThan(lineSeedLoop);
  });

  it('init-db call uses x-api-key: $SYSTEM_API_KEY against /api/admin/init-db', () => {
    // Capture the lines between the init-db banner and the seed loop;
    // the curl invocation must live in that window and must POST with
    // the SYSTEM_API_KEY header against the init-db admin endpoint.
    const window = yaml
      .split('\n')
      .slice(lineInitDbBanner - 1, lineSeedLoop - 1)
      .join('\n');
    expect(window).toMatch(/x-api-key: \$SYSTEM_API_KEY/);
    expect(window).toMatch(/-X POST/);
    expect(window).toMatch(/\/api\/admin\/init-db/);
    // Success criterion: HTTP 200 — anything else (including 503) retries.
    expect(window).toMatch(/INIT_STATUS" = "200"/);
  });

  it('init-db retry budget is bounded (12×5s ≈ 60s) and aborts on exhaustion', () => {
    const window = yaml
      .split('\n')
      .slice(lineInitDbBanner - 1, lineSeedLoop - 1)
      .join('\n');
    expect(window).toMatch(/seq 1 12/);
    expect(window).toMatch(/sleep 5/);
    // Must hard-fail (exit 1) on exhaustion so the broken seed never runs.
    expect(window).toMatch(/exit 1/);
  });
});
