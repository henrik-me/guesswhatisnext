// @ts-check
import { test, expect } from '@playwright/test';

// These tests require the MSSQL + Caddy HTTPS stack (external server mode).
// They are skipped automatically when BASE_URL is not set.
const BASE_URL = process.env.BASE_URL;
const describeOrSkip = BASE_URL ? test.describe : test.describe.skip;

describeOrSkip('HTTPS & Security Headers', () => {
  // HTTP port where Caddy listens for plain HTTP (default 3001 in docker-compose)
  const HTTP_PORT = process.env.HTTP_PORT || '3001';
  const httpUrl = `http://localhost:${HTTP_PORT}`;

  test.describe('CS25-2a: Caddy HTTP→HTTPS redirect', () => {
    test('redirects HTTP to HTTPS with 308 or 301', async ({ playwright }) => {
      // Use a standalone request context so we can disable auto-redirect following
      const context = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
        maxRedirects: 0,
      });

      try {
        const response = await context.get(httpUrl);
        const status = response.status();

        expect([301, 308]).toContain(status);

        const location = response.headers()['location'];
        expect(location).toBeTruthy();
        expect(location).toMatch(/^https:\/\//);
      } finally {
        await context.dispose();
      }
    });
  });

  test.describe('CS25-2b: HSTS header', () => {
    test('includes Strict-Transport-Security with max-age > 0', async ({ playwright }) => {
      const context = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
      });

      try {
        const response = await context.get(BASE_URL);
        const hsts = response.headers()['strict-transport-security'];

        expect(hsts).toBeTruthy();

        const maxAgeMatch = hsts.match(/max-age=(\d+)/);
        expect(maxAgeMatch).toBeTruthy();
        expect(Number(maxAgeMatch[1])).toBeGreaterThan(0);
      } finally {
        await context.dispose();
      }
    });
  });

  test.describe('CS25-2c: CSP header', () => {
    test('includes Content-Security-Policy with expected directives', async ({ playwright }) => {
      const context = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
      });

      try {
        const response = await context.get(BASE_URL);
        const csp = response.headers()['content-security-policy'];

        expect(csp).toBeTruthy();
        expect(csp).toContain('default-src');
        expect(csp).toContain('script-src');
        expect(csp).toContain('connect-src');
        // WebSocket support — production uses wss://hostname, dev uses wss:
        expect(csp).toMatch(/wss:/);
      } finally {
        await context.dispose();
      }
    });
  });

  test.describe('CS25-2d: Other security headers', () => {
    test('includes X-Content-Type-Options: nosniff', async ({ playwright }) => {
      const context = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
      });

      try {
        const response = await context.get(BASE_URL);
        expect(response.headers()['x-content-type-options']).toBe('nosniff');
      } finally {
        await context.dispose();
      }
    });

    test('includes X-Frame-Options', async ({ playwright }) => {
      const context = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
      });

      try {
        const response = await context.get(BASE_URL);
        const xfo = response.headers()['x-frame-options'];
        expect(xfo).toBeTruthy();
        expect(xfo.toLowerCase()).toMatch(/deny|sameorigin/);
      } finally {
        await context.dispose();
      }
    });

    test('includes Referrer-Policy', async ({ playwright }) => {
      const context = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
      });

      try {
        const response = await context.get(BASE_URL);
        const rp = response.headers()['referrer-policy'];
        expect(rp).toBeTruthy();
      } finally {
        await context.dispose();
      }
    });
  });
});
