/**
 * Security headers and HTTPS redirect tests.
 */

const { getAgent, setup, teardown } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('Security headers', () => {
  test('responses include standard security headers', async () => {
    const res = await getAgent().get('/healthz');

    expect(res.status).toBe(200);
    // HSTS only in production/staging, not in test
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['permissions-policy']).toBeDefined();
  });

  test('CSP allows inline styles, data URIs, and WebSocket connections', async () => {
    const res = await getAgent().get('/healthz');
    const csp = res.headers['content-security-policy'];

    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toMatch(/img-src[^;]*data:/);
    expect(csp).toMatch(/connect-src[^;]*ws:/);
    expect(csp).toMatch(/connect-src[^;]*wss:/);
  });

  test('X-XSS-Protection header is not set', async () => {
    const res = await getAgent().get('/healthz');
    expect(res.headers['x-xss-protection']).toBeUndefined();
  });

  test('security headers present on API routes', async () => {
    const res = await getAgent().get('/api/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('HTTPS redirect', () => {
  test('does not redirect in test/development mode', async () => {
    const res = await getAgent()
      .get('/healthz')
      .set('X-Forwarded-Proto', 'http');

    expect(res.status).toBe(200);
  });

  test('does not redirect when already on HTTPS', async () => {
    const res = await getAgent()
      .get('/healthz')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(200);
  });
});

describe('HTTPS redirect in production mode', () => {
  // NOTE: HSTS is configured at module load time based on NODE_ENV, so it
  // cannot be toggled by mutating process.env after the server is created.
  // The test above verifies HSTS is absent in test mode; production HSTS
  // behaviour is covered by the conditional config in security.js.
  let originalEnv;
  let originalCanonicalHost;

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    // Set canonical host on the config object (loaded at import time)
    const { config } = require('../server/config');
    originalCanonicalHost = config.CANONICAL_HOST;
    config.CANONICAL_HOST = 'example.com';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
    const { config } = require('../server/config');
    config.CANONICAL_HOST = originalCanonicalHost;
  });

  test('redirects HTTP to HTTPS in production', async () => {
    const res = await getAgent()
      .get('/healthz')
      .set('X-Forwarded-Proto', 'http');

    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('https://example.com/healthz');
  });

  test('does not redirect HTTPS requests in production', async () => {
    const res = await getAgent()
      .get('/healthz')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(200);
  });
});
