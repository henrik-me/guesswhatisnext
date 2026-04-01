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
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['permissions-policy']).toBeDefined();
  });

  test('CSP allows inline styles and scripts, and data URIs', async () => {
    const res = await getAgent().get('/healthz');
    const csp = res.headers['content-security-policy'];

    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toMatch(/img-src[^;]*data:/);
  });

  test('X-XSS-Protection header is not set', async () => {
    const res = await getAgent().get('/healthz');
    expect(res.headers['x-xss-protection']).toBeUndefined();
  });

  test('security headers present on API routes', async () => {
    const res = await getAgent().get('/api/auth/me');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
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
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test('redirects HTTP to HTTPS in production', async () => {
    const res = await getAgent()
      .get('/healthz')
      .set('X-Forwarded-Proto', 'http');

    expect(res.status).toBe(301);
    expect(res.headers.location).toMatch(/^https:\/\//);
  });

  test('does not redirect HTTPS requests in production', async () => {
    const res = await getAgent()
      .get('/healthz')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(200);
  });
});
