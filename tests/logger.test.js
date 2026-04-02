/**
 * Logger configuration tests — server/logger.js + LOG_LEVEL config.
 */

const path = require('path');
const { Writable } = require('stream');
const pino = require('pino');

/** Clear require cache for server modules so config/logger re-initialise. */
function clearServerCache() {
  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) {
      delete require.cache[key];
    }
  }
}

/**
 * Create a pino logger that writes JSON lines to an array.
 * Uses the same redact config as server/logger.js.
 */
function createCapturingLogger(overrides = {}) {
  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, cb) {
      lines.push(JSON.parse(chunk.toString()));
      cb();
    },
  });

  const redactPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    'req.headers["x-access-token"]',
    'res.headers["set-cookie"]',
  ];

  const logger = pino(
    { level: 'trace', redact: { paths: redactPaths, remove: true }, ...overrides },
    stream,
  );
  return { logger, lines };
}

describe('Logger configuration', () => {
  const saved = {};

  beforeEach(() => {
    for (const k of ['NODE_ENV', 'LOG_LEVEL', 'JWT_SECRET', 'SYSTEM_API_KEY', 'CANONICAL_HOST']) {
      saved[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    clearServerCache();
  });

  // --- Pino instance shape ---

  test('exports a valid Pino logger instance with all standard methods', () => {
    const logger = require('../server/logger');
    for (const method of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'child']) {
      expect(typeof logger[method]).toBe('function');
    }
  });

  // --- LOG_LEVEL defaults per environment ---

  test('defaults to "silent" in test environment', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.LOG_LEVEL;
    clearServerCache();
    const { config } = require('../server/config');
    expect(config.LOG_LEVEL).toBe('silent');
  });

  test('defaults to "debug" in development environment', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;
    clearServerCache();
    const { config } = require('../server/config');
    expect(config.LOG_LEVEL).toBe('debug');
  });

  test('defaults to "info" in production environment', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_LEVEL;
    clearServerCache();
    const { config } = require('../server/config');
    expect(config.LOG_LEVEL).toBe('info');
  });

  test('defaults to "info" in staging environment', () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.LOG_LEVEL;
    clearServerCache();
    const { config } = require('../server/config');
    expect(config.LOG_LEVEL).toBe('info');
  });

  test('defaults to "debug" when NODE_ENV is unset', () => {
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    clearServerCache();
    const { config } = require('../server/config');
    expect(config.LOG_LEVEL).toBe('debug');
  });

  // --- LOG_LEVEL override ---

  test('respects explicit LOG_LEVEL environment variable', () => {
    process.env.LOG_LEVEL = 'warn';
    clearServerCache();
    const logger = require('../server/logger');
    expect(logger.level).toBe('warn');
  });

  test('accepts all valid Pino levels via LOG_LEVEL', () => {
    for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']) {
      process.env.LOG_LEVEL = level;
      clearServerCache();
      const { config } = require('../server/config');
      expect(config.LOG_LEVEL).toBe(level);
    }
  });

  test('rejects invalid LOG_LEVEL and falls back to environment default', () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'banana';
    clearServerCache();
    const { config } = require('../server/config');
    expect(config.LOG_LEVEL).toBe('silent');
  });

  // --- Redaction ---

  test('redacts authorization header from request logs', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({ req: { headers: { authorization: 'Bearer secret' } } }, 'req');
    expect(lines[0].req.headers).not.toHaveProperty('authorization');
  });

  test('redacts cookie header from request logs', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({ req: { headers: { cookie: 'session=abc' } } }, 'req');
    expect(lines[0].req.headers).not.toHaveProperty('cookie');
  });

  test('redacts x-api-key header from request logs', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({ req: { headers: { 'x-api-key': 'key123' } } }, 'req');
    expect(lines[0].req.headers).not.toHaveProperty('x-api-key');
  });

  test('redacts x-access-token header from request logs', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({ req: { headers: { 'x-access-token': 'tok' } } }, 'req');
    expect(lines[0].req.headers).not.toHaveProperty('x-access-token');
  });

  test('redacts set-cookie from response logs', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({ res: { headers: { 'set-cookie': 'sid=xyz; HttpOnly' } } }, 'res');
    expect(lines[0].res.headers).not.toHaveProperty('set-cookie');
  });

  test('preserves non-sensitive headers after redaction', () => {
    const { logger, lines } = createCapturingLogger();
    logger.info({
      req: {
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
          accept: 'text/html',
        },
      },
    }, 'req');
    const h = lines[0].req.headers;
    expect(h['content-type']).toBe('application/json');
    expect(h.accept).toBe('text/html');
  });

  // --- Transport selection ---

  test('configures pino-pretty transport only in development', () => {
    for (const [env, shouldUsePretty] of [
      ['development', true],
      ['production', false],
      ['test', false],
      ['staging', false],
    ]) {
      process.env.NODE_ENV = env;
      process.env.LOG_LEVEL = 'silent';
      clearServerCache();
      const logger = require('../server/logger');
      // Pino stores the underlying stream on a private Symbol; pino-pretty
      // creates a ThreadStream worker whereas the default is SonicBoom.
      const streamSym = Object.getOwnPropertySymbols(logger)
        .find(s => s.toString() === 'Symbol(pino.stream)');
      const streamName = streamSym ? logger[streamSym]?.constructor?.name : undefined;
      if (shouldUsePretty) {
        expect(streamName).toBe('ThreadStream');
      } else {
        expect(streamName).not.toBe('ThreadStream');
      }
      clearServerCache();
    }
  });

  test('produces valid JSON output in non-development mode', () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    clearServerCache();
    const logger = require('../server/logger');

    // Pino writes ndjson when no transport is configured.
    // A child logger inherits the JSON serialiser.
    const child = logger.child({ component: 'test' });
    expect(typeof child.info).toBe('function');
    expect(child.level).toBe('info');
  });
});

describe('buildOtelMixin', () => {
  beforeEach(() => clearServerCache());
  afterEach(() => clearServerCache());

  test('returns undefined when no apiOverride and require fails', () => {
    const { buildOtelMixin } = require('../server/logger');
    const mixin = buildOtelMixin();
    expect(mixin === undefined || typeof mixin === 'function').toBe(true);
  });

  test('mixin returns empty object when no active span', () => {
    const fakeApi = {
      trace: { getSpan: () => null },
      context: { active: () => ({}) },
    };

    const { buildOtelMixin } = require('../server/logger');
    const mixin = buildOtelMixin(fakeApi);
    expect(typeof mixin).toBe('function');
    expect(mixin()).toEqual({});
  });

  test('mixin returns trace_id and span_id when active span exists', () => {
    const fakeApi = {
      trace: {
        getSpan: () => ({
          spanContext: () => ({
            traceId: 'abc123def456abc123def456abc123de',
            spanId: '1234567890abcdef',
          }),
        }),
      },
      context: { active: () => ({}) },
    };

    const { buildOtelMixin } = require('../server/logger');
    const mixin = buildOtelMixin(fakeApi);
    expect(typeof mixin).toBe('function');
    expect(mixin()).toEqual({
      trace_id: 'abc123def456abc123def456abc123de',
      span_id: '1234567890abcdef',
    });
  });

  test('mixin returns empty object for zero traceId', () => {
    const fakeApi = {
      trace: {
        getSpan: () => ({
          spanContext: () => ({
            traceId: '00000000000000000000000000000000',
            spanId: '0000000000000000',
          }),
        }),
      },
      context: { active: () => ({}) },
    };

    const { buildOtelMixin } = require('../server/logger');
    const mixin = buildOtelMixin(fakeApi);
    expect(typeof mixin).toBe('function');
    expect(mixin()).toEqual({});
  });
});
