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
    });
    expect(res.status()).toBe(204);
  });

  test('POST /api/telemetry/errors returns 400 without message', async ({ request }) => {
    const res = await request.post('/api/telemetry/errors', {
      data: { type: 'error' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('message is required');
  });

  test('POST /api/telemetry/errors returns 400 for non-string message', async ({ request }) => {
    const res = await request.post('/api/telemetry/errors', {
      data: { message: 123 },
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
    });
    expect(res.status()).toBe(204);
  });

  test('rate limits excessive error reports', async ({ request }) => {
    // Send 12 requests; with a 10/min limit, at least one should be rate-limited
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const res = await request.post('/api/telemetry/errors', {
        data: { message: `Rate limit e2e test ${i}` },
      });
      statuses.push(res.status());
    }
    expect(statuses).toContain(429);
  });

  test('window.onerror handler reports errors to telemetry endpoint', async ({ page }) => {
    let capturedPayload = null;
    await page.route('**/api/telemetry/errors', async (route) => {
      const request = route.request();
      try {
        capturedPayload = JSON.parse(request.postData() || '{}');
      } catch {
        capturedPayload = {};
      }
      await route.fulfill({ status: 204 });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set a fake token so the error reporter uses fetch (interceptable) instead of sendBeacon
    await page.evaluate(() => {
      localStorage.setItem('gwn_auth_token', 'fake-token-for-e2e');
    });

    // Dispatch an ErrorEvent directly (more reliable than setTimeout + throw)
    await page.evaluate(() => {
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'E2E deliberate error',
        filename: 'e2e-test.js',
        lineno: 99,
        colno: 5,
        error: new Error('E2E deliberate error'),
      }));
    });

    await page.waitForTimeout(1000);

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.message).toContain('E2E deliberate error');
    expect(capturedPayload.type).toBe('error');
    expect(capturedPayload.source).toBe('e2e-test.js');
    expect(capturedPayload.lineno).toBe(99);
  });

  test('unhandledrejection handler reports to telemetry endpoint', async ({ page }) => {
    let capturedPayload = null;
    await page.route('**/api/telemetry/errors', async (route) => {
      const request = route.request();
      try {
        capturedPayload = JSON.parse(request.postData() || '{}');
      } catch {
        capturedPayload = {};
      }
      await route.fulfill({ status: 204 });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set a fake token so the error reporter uses fetch (interceptable) instead of sendBeacon
    await page.evaluate(() => {
      localStorage.setItem('gwn_auth_token', 'fake-token-for-e2e');
    });

    // Trigger an unhandled promise rejection
    await page.evaluate(() => {
      Promise.reject(new Error('E2E unhandled rejection'));
    });

    await page.waitForTimeout(1000);

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload.message).toContain('E2E unhandled rejection');
    expect(capturedPayload.type).toBe('unhandledrejection');
  });

  test('error reporting respects per-minute rate limit on client side', async ({ page }) => {
    let reportCount = 0;
    await page.route('**/api/telemetry/errors', async (route) => {
      reportCount++;
      await route.fulfill({ status: 204 });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

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

    await page.waitForTimeout(1000);

    // Client should cap at MAX_ERRORS_PER_MINUTE (10)
    expect(reportCount).toBeLessThanOrEqual(10);
    expect(reportCount).toBeGreaterThan(0);
  });

  test('authenticated user includes auth token in error report', async ({ page, request }) => {
    // Register a user first
    const username = `e2e${Date.now().toString(36)}`;
    const regRes = await request.post('/api/auth/register', {
      data: { username, password: 'testpass123' },
    });
    expect(regRes.ok()).toBeTruthy();
    const { token } = await regRes.json();

    let capturedHeaders = null;
    await page.route('**/api/telemetry/errors', async (route) => {
      capturedHeaders = route.request().headers();
      await route.fulfill({ status: 204 });
    });

    // Navigate and set the auth token in localStorage
    await page.goto('/');
    await page.evaluate((t) => {
      localStorage.setItem('gwn_auth_token', t);
    }, token);

    // Trigger an error
    await page.evaluate(() => {
      setTimeout(() => { throw new Error('Auth error test'); }, 0);
    });

    await page.waitForTimeout(1000);

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders['authorization']).toBe(`Bearer ${token}`);
  });
});
