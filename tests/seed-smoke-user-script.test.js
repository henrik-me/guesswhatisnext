/**
 * CS61-1 — scripts/seed-smoke-user-via-api.js unit tests.
 *
 * The script is structured so the network call lives in the exported
 * `seedViaApi({ fqdn, password, apiKey, fetchImpl })` function, with
 * `fetchImpl` injectable. These tests exercise that surface with a fake
 * fetch — no real network, no real server.
 */

const { seedViaApi, main } = require('../scripts/seed-smoke-user-via-api');

function fakeFetch({ status, body }) {
  return async () => ({
    status,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

function recordingFetch(impl) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return impl(url, init);
  };
  fn.calls = calls;
  return fn;
}

describe('seedViaApi', () => {
  test('HTTP 201 created → exit 0, success message', async () => {
    const fetchImpl = fakeFetch({ status: 201, body: { status: 'created', username: 'gwn-smoke-bot' } });
    const { exitCode, message } = await seedViaApi({
      fqdn: 'example.test', password: 'pw', apiKey: 'k', fetchImpl,
    });
    expect(exitCode).toBe(0);
    expect(message).toMatch(/✅/);
    expect(message).toMatch(/created/);
    expect(message).toMatch(/HTTP 201/);
  });

  test('HTTP 200 exists → exit 0, success message', async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { status: 'exists', username: 'gwn-smoke-bot' } });
    const { exitCode, message } = await seedViaApi({
      fqdn: 'example.test', password: 'pw', apiKey: 'k', fetchImpl,
    });
    expect(exitCode).toBe(0);
    expect(message).toMatch(/exists/);
    expect(message).toMatch(/HTTP 200/);
  });

  test('HTTP 401 unauthorized → exit 1', async () => {
    const fetchImpl = fakeFetch({ status: 401, body: { error: 'Invalid API key' } });
    const { exitCode, message } = await seedViaApi({
      fqdn: 'example.test', password: 'pw', apiKey: 'wrong', fetchImpl,
    });
    expect(exitCode).toBe(1);
    expect(message).toMatch(/HTTP 401/);
  });

  test('HTTP 400 bad password → exit 1', async () => {
    const fetchImpl = fakeFetch({ status: 400, body: { error: 'password required' } });
    const { exitCode, message } = await seedViaApi({
      fqdn: 'example.test', password: 'pw', apiKey: 'k', fetchImpl,
    });
    expect(exitCode).toBe(1);
    expect(message).toMatch(/HTTP 400/);
  });

  test('network error (fetch throws) → exit 1', async () => {
    const fetchImpl = async () => { throw new Error('ECONNREFUSED 1.2.3.4:443'); };
    const { exitCode, message } = await seedViaApi({
      fqdn: 'example.test', password: 'pw', apiKey: 'k', fetchImpl,
    });
    expect(exitCode).toBe(1);
    expect(message).toMatch(/ECONNREFUSED/);
  });

  test('sends POST with correct URL, x-api-key header, and JSON body', async () => {
    const fetchImpl = recordingFetch(fakeFetch({ status: 201, body: { status: 'created', username: 'gwn-smoke-bot' } }));
    await seedViaApi({
      fqdn: 'staging.example.io', password: 'super-secret', apiKey: 'system-key-abc', fetchImpl,
    });
    expect(fetchImpl.calls).toHaveLength(1);
    const call = fetchImpl.calls[0];
    expect(call.url).toBe('https://staging.example.io/api/admin/seed-smoke-user');
    expect(call.init.method).toBe('POST');
    expect(call.init.headers['Content-Type']).toBe('application/json');
    expect(call.init.headers['x-api-key']).toBe('system-key-abc');
    expect(JSON.parse(call.init.body)).toEqual({ password: 'super-secret' });
  });
});

describe('main (CLI entry)', () => {
  let origFetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  test('returns 2 when FQDN is missing', async () => {
    const errs = [];
    const origErr = console.error;
    console.error = (m) => errs.push(m);
    try {
      const code = await main(['node', 'script'], { SMOKE_USER_PASSWORD: 'pw', SYSTEM_API_KEY: 'k' });
      expect(code).toBe(2);
      expect(errs.join('\n')).toMatch(/Usage/);
    } finally {
      console.error = origErr;
    }
  });

  test('returns 2 when SMOKE_USER_PASSWORD is missing', async () => {
    const errs = [];
    const origErr = console.error;
    console.error = (m) => errs.push(m);
    try {
      const code = await main(['node', 'script', 'host.test'], { SYSTEM_API_KEY: 'k' });
      expect(code).toBe(2);
      expect(errs.join('\n')).toMatch(/SMOKE_USER_PASSWORD/);
    } finally {
      console.error = origErr;
    }
  });

  test('returns 2 when SYSTEM_API_KEY is missing', async () => {
    const errs = [];
    const origErr = console.error;
    console.error = (m) => errs.push(m);
    try {
      const code = await main(['node', 'script', 'host.test'], { SMOKE_USER_PASSWORD: 'pw' });
      expect(code).toBe(2);
      expect(errs.join('\n')).toMatch(/SYSTEM_API_KEY/);
    } finally {
      console.error = origErr;
    }
  });

  test('returns 0 on HTTP 201 from upstream (uses globalThis.fetch)', async () => {
    globalThis.fetch = fakeFetch({ status: 201, body: { status: 'created', username: 'gwn-smoke-bot' } });
    const logs = [];
    const origLog = console.log;
    console.log = (m) => logs.push(m);
    try {
      const code = await main(['node', 'script', 'host.test'], {
        SMOKE_USER_PASSWORD: 'pw', SYSTEM_API_KEY: 'k',
      });
      expect(code).toBe(0);
      expect(logs.join('\n')).toMatch(/✅/);
    } finally {
      console.log = origLog;
    }
  });

  test('returns 1 on HTTP 401 from upstream', async () => {
    globalThis.fetch = fakeFetch({ status: 401, body: { error: 'Invalid API key' } });
    const errs = [];
    const origErr = console.error;
    console.error = (m) => errs.push(m);
    try {
      const code = await main(['node', 'script', 'host.test'], {
        SMOKE_USER_PASSWORD: 'pw', SYSTEM_API_KEY: 'wrong',
      });
      expect(code).toBe(1);
      expect(errs.join('\n')).toMatch(/HTTP 401/);
    } finally {
      console.error = origErr;
    }
  });
});
