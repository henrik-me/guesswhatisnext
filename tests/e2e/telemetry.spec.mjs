// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Client Error Telemetry', () => {
  test('POST /api/telemetry/errors returns 204 for valid payload', async ({ request }) => {
    const res = await request.post('/api/telemetry/errors', {
      data: {
        message: 'E2E test error',
        type: 'error',
        source: 'e2e-test.js',
        lineno: 42,
        colno: 10,
      },
      headers: { 'X-Forwarded-For': '10.0.0.1' },
    });
    expect(res.status()).toBe(204);
  });

  test('POST /api/telemetry/errors returns 400 without message', async ({ request }) => {
    const res = await request.post('/api/telemetry/errors', {
      data: { type: 'error' },
      headers: { 'X-Forwarded-For': '10.0.0.1' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('message is required');
  });

  test('POST /api/telemetry/errors returns 400 for non-string message', async ({ request }) => {
    const res = await request.post('/api/telemetry/errors', {
      data: { message: 123 },
      headers: { 'X-Forwarded-For': '10.0.0.1' },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/telemetry/errors accepts stack trace', async ({ request }) => {
    const res = await request.post('/api/telemetry/errors', {
      data: {
        message: 'TypeError: Cannot read property',
        stack: 'TypeError: Cannot read property\n    at app.js:15:3\n    at main.js:1:1',
        type: 'error',
        source: 'app.js',
      },
      headers: { 'X-Forwarded-For': '10.0.0.1' },
    });
    expect(res.status()).toBe(204);
  });

  test('rate limits excessive error reports', async ({ request }) => {
    // Send 12 requests; with a 10/min limit, at least one should be rate-limited
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const res = await request.post('/api/telemetry/errors', {
        data: { message: `Rate limit e2e test ${i}` },
        headers: { 'X-Forwarded-For': '10.0.0.2' },
      });
      statuses.push(res.status());
    }
    expect(statuses).toContain(429);
  });

  test('window.onerror handler reports errors to telemetry endpoint', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set a fake token so the error reporter uses fetch (interceptable) instead of sendBeacon
    await page.evaluate(() => {
      localStorage.setItem('gwn_auth_token', 'fake-token-for-e2e');
    });

    // Start waiting for the request BEFORE triggering the error
    const requestPromise = page.waitForRequest('**/api/telemetry/errors');

    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'E2E deliberate error',
        filename: 'e2e-test.js',
        lineno: 99,
        colno: 5,
        error: new Error('E2E deliberate error'),
      }));
    });

    const req = await requestPromise;
    const payload = JSON.parse(req.postData() || '{}');
    expect(payload.message).toContain('E2E deliberate error');
    expect(payload.type).toBe('error');
    expect(payload.source).toBe('e2e-test.js');
    expect(payload.lineno).toBe(99);
  });

  test('unhandledrejection handler reports to telemetry endpoint', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set a fake token so the error reporter uses fetch (interceptable) instead of sendBeacon
    await page.evaluate(() => {
      localStorage.setItem('gwn_auth_token', 'fake-token-for-e2e');
    });

    const requestPromise = page.waitForRequest('**/api/telemetry/errors');

    await page.evaluate(() => {
      Promise.reject(new Error('E2E unhandled rejection'));
    });

    const req = await requestPromise;
    const payload = JSON.parse(req.postData() || '{}');
    expect(payload.message).toContain('E2E unhandled rejection');
    expect(payload.type).toBe('unhandledrejection');
  });

  test('error reporting respects per-minute rate limit on client side', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set a fake token so fetch path is used, and override fetch to count
    // telemetry calls in-browser. page.route can miss keepalive fetches, so
    // intercepting at the JS level is more reliable.
    await page.evaluate(() => {
      localStorage.setItem('gwn_auth_token', 'fake-token-for-e2e');
      window.__telemetryCount = 0;
      const _origFetch = window.fetch;
      window.fetch = function (url, opts) {
        if (typeof url === 'string' && url.includes('/api/telemetry/errors')) {
          window.__telemetryCount++;
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return _origFetch.call(this, url, opts);
      };
    });

    // Trigger 15 errors rapidly — client-side limit is 10/min
    await page.evaluate(() => {
      for (let i = 0; i < 15; i++) {
        window.dispatchEvent(new ErrorEvent('error', {
          message: `Flood error ${i}`,
          filename: 'test.js',
          lineno: i,
          colno: 1,
        }));
      }
    });

    const count = await page.evaluate(() => window.__telemetryCount);
    // Client should cap at MAX_ERRORS_PER_MINUTE (10)
    expect(count).toBeLessThanOrEqual(10);
    expect(count).toBeGreaterThan(0);
  });

  test('authenticated user includes auth token in error report', async ({ page, request }) => {
    // Register a user first
    const username = `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const regRes = await request.post('/api/auth/register', {
      data: { username, password: 'testpass123' },
    });
    expect(regRes.ok()).toBeTruthy();
    const { token } = await regRes.json();

    await page.goto('/');
    await page.evaluate((t) => {
      localStorage.setItem('gwn_auth_token', t);
    }, token);

    // Wait for the request BEFORE triggering the error
    const requestPromise = page.waitForRequest('**/api/telemetry/errors');

    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'Auth error test',
        filename: 'auth-test.js',
        lineno: 1,
      }));
    });

    const req = await requestPromise;
    expect(req.headers()['authorization']).toBe(`Bearer ${token}`);
  });
});
