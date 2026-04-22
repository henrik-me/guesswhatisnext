// @ts-check
/**
 * E2E test — /api/health returns correct shape for any backend.
 *
 * Validates the adapter-level healthCheck() contract end-to-end:
 * - Both adapters return `storage.status: 'ok'` with `latencyMs`
 * - SQLite adapter may also include `dbSizeMb` (file-backed databases)
 *
 * Runs as part of `npm run test:e2e` (SQLite) and `npm run test:e2e:mssql` (MSSQL).
 */

import { test, expect } from '@playwright/test';

const SYSTEM_API_KEY = process.env.SYSTEM_API_KEY || 'test-system-api-key';

test.describe('/api/health contract', () => {
  test('returns status ok with all required checks', async ({ request }) => {
    const res = await request.get('/api/health', {
      headers: { 'X-API-Key': SYSTEM_API_KEY },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Top-level shape
    expect(body.status).toBe('ok');
    expect(body.version).toBeDefined();
    expect(body.environment).toBeDefined();
    expect(body.timestamp).toBeDefined();

    // Database check
    expect(body.checks.database).toBeDefined();
    expect(body.checks.database.status).toBe('ok');
    expect(typeof body.checks.database.responseMs).toBe('number');

    // WebSocket check
    expect(body.checks.websocket).toBeDefined();
    expect(body.checks.websocket.status).toBe('ok');

    // Storage check (adapter-delegated health check)
    expect(body.checks.storage).toBeDefined();
    expect(body.checks.storage.status).toBe('ok');

    // Uptime check
    expect(body.checks.uptime).toBeDefined();
    expect(body.checks.uptime.status).toBe('ok');
  });

  test('storage check returns backend-appropriate fields', async ({ request }) => {
    const res = await request.get('/api/health', {
      headers: { 'X-API-Key': SYSTEM_API_KEY },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    const storage = body.checks.storage;

    // Both adapters always return latencyMs from the SELECT 1 ping
    expect(typeof storage.latencyMs).toBe('number');

    // SQLite may also return dbSizeMb (file-backed only); MSSQL won't.
    // Either is acceptable — the key contract is latencyMs.
    if (storage.dbSizeMb !== undefined) {
      expect(typeof storage.dbSizeMb).toBe('number');
    }
  });
});
