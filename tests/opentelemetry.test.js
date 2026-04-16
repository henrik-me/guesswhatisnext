/**
 * Tests for the OpenTelemetry bootstrap module (server/telemetry.js)
 * and related config entries.
 */

const path = require('path');

/** Clear all server modules from the require cache. */
function clearServerCache() {
  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) {
      delete require.cache[key];
    }
  }
}

describe('server/telemetry.js', () => {
  const savedEnvKeys = ['APPLICATIONINSIGHTS_CONNECTION_STRING', 'NODE_ENV', 'OTEL_EXPORTER_OTLP_ENDPOINT'];
  const savedEnv = {};

  beforeEach(() => {
    savedEnvKeys.forEach((key) => {
      savedEnv[key] = process.env[key];
    });
    clearServerCache();
  });

  afterEach(() => {
    savedEnvKeys.forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
    clearServerCache();
  });

  test('exports a disabled bootstrap when connection string is absent', () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { telemetry } = require('../server/telemetry');
    expect(telemetry).toEqual({ enabled: false });
  });

  test('trims the connection string before enabling telemetry', () => {
    const { createTelemetryBootstrap } = require('../server/telemetry');
    const bootstrap = createTelemetryBootstrap({
      connectionString: '  InstrumentationKey=test-key  ',
      NodeSDK: class FakeNodeSdk {
        start() { /* void, like real SDK */ }
        shutdown() { return Promise.resolve(); }
      },
      getNodeAutoInstrumentations: () => [],
      AzureMonitorTraceExporter: class FakeExporter {},
      processRef: { once() {} },
      logInfo() {},
      logError() {},
    });

    expect(bootstrap.enabled).toBe(true);
  });

  test('keeps only the intended HTTP and Express instrumentations', () => {
    const { buildInstrumentations } = require('../server/telemetry');
    const instrumentations = buildInstrumentations(() => ([
      { instrumentationName: '@opentelemetry/instrumentation-http' },
      { instrumentationName: '@opentelemetry/instrumentation-express' },
      { instrumentationName: '@opentelemetry/instrumentation-fs' },
    ]));

    expect(instrumentations).toEqual([
      { instrumentationName: '@opentelemetry/instrumentation-http' },
      { instrumentationName: '@opentelemetry/instrumentation-express' },
    ]);
  });

  test('logs startup success only after the SDK starts and registers shutdown handlers', async () => {
    const infoLogs = [];
    const errorLogs = [];
    const registeredSignals = [];
    let sdkConfig;

    class FakeNodeSdk {
      constructor(config) {
        sdkConfig = config;
      }

      start() { /* void, like real SDK */ }

      shutdown() {
        return Promise.resolve();
      }
    }

    const { createTelemetryBootstrap } = require('../server/telemetry');
    const bootstrap = createTelemetryBootstrap({
      connectionString: 'InstrumentationKey=test-key',
      NodeSDK: FakeNodeSdk,
      getNodeAutoInstrumentations: () => ([
        { instrumentationName: '@opentelemetry/instrumentation-http' },
        { instrumentationName: '@opentelemetry/instrumentation-express' },
        { instrumentationName: '@opentelemetry/instrumentation-fs' },
      ]),
      AzureMonitorTraceExporter: class FakeExporter {
        constructor(options) {
          this.options = options;
        }
      },
      processRef: {
        once(signal, handler) {
          registeredSignals.push({ signal, handler });
        },
      },
      logInfo(message) {
        infoLogs.push(message);
      },
      logError(...args) {
        errorLogs.push(args);
      },
    });

    await bootstrap.startPromise;

    expect(sdkConfig.instrumentations.map((item) => item.instrumentationName)).toEqual([
      '@opentelemetry/instrumentation-http',
      '@opentelemetry/instrumentation-express',
    ]);
    expect(infoLogs).toHaveLength(1);
    expect(infoLogs[0]).toContain('OpenTelemetry active');
    expect(errorLogs).toEqual([]);
    expect(registeredSignals.map(({ signal }) => signal)).toEqual(['SIGTERM', 'SIGINT']);
  });

  test('catches startup and shutdown failures without re-throwing', async () => {
    const errorLogs = [];
    let shutdownCalls = 0;

    class FakeNodeSdk {
      start() {
        throw new Error('boom');
      }

      shutdown() {
        shutdownCalls += 1;
        return Promise.reject(new Error('flush failed'));
      }
    }

    const { createTelemetryBootstrap } = require('../server/telemetry');
    const bootstrap = createTelemetryBootstrap({
      connectionString: 'InstrumentationKey=test-key',
      NodeSDK: FakeNodeSdk,
      getNodeAutoInstrumentations: () => [],
      AzureMonitorTraceExporter: class FakeExporter {},
      processRef: { once() {} },
      logInfo() {},
      logError(...args) {
        errorLogs.push(args);
      },
    });

    await expect(bootstrap.startPromise).resolves.toBe(false);
    await expect(bootstrap.shutdown()).resolves.toBeUndefined();
    await expect(bootstrap.shutdown()).resolves.toBeUndefined();

    expect(shutdownCalls).toBe(2);
    expect(errorLogs[0][0]).toBe('OpenTelemetry failed to start');
    expect(errorLogs[1][0]).toBe('OpenTelemetry shutdown error');
    expect(errorLogs[2][0]).toBe('OpenTelemetry shutdown error');
  });

  test('uses OTLPTraceExporter when otlpEndpoint is set and no connection string', async () => {
    const infoLogs = [];
    let receivedConfig;

    class FakeOTLPExporter {
      constructor(config) {
        receivedConfig = config;
      }
    }

    const { createTelemetryBootstrap } = require('../server/telemetry');
    const bootstrap = createTelemetryBootstrap({
      otlpEndpoint: 'http://localhost:4318',
      NodeSDK: class FakeNodeSdk {
        start() { /* void */ }
        shutdown() { return Promise.resolve(); }
      },
      getNodeAutoInstrumentations: () => [
        { instrumentationName: '@opentelemetry/instrumentation-http' },
        { instrumentationName: '@opentelemetry/instrumentation-express' },
      ],
      OTLPTraceExporter: FakeOTLPExporter,
      processRef: { once() {} },
      logInfo(msg) { infoLogs.push(msg); },
      logError() {},
    });

    expect(bootstrap.enabled).toBe(true);
    await bootstrap.startPromise;
    expect(receivedConfig.url).toBe('http://localhost:4318/v1/traces');
    expect(infoLogs[0]).toContain('OTLP');
    expect(infoLogs[0]).toContain('http://localhost:4318');
  });

  test('prefers Azure Monitor when both connection string and OTLP endpoint are set', async () => {
    let usedAzure = false;
    let usedOtlp = false;

    const { createTelemetryBootstrap } = require('../server/telemetry');
    const bootstrap = createTelemetryBootstrap({
      connectionString: 'InstrumentationKey=test-key',
      otlpEndpoint: 'http://localhost:4318',
      NodeSDK: class FakeNodeSdk {
        start() { /* void */ }
        shutdown() { return Promise.resolve(); }
      },
      getNodeAutoInstrumentations: () => [],
      AzureMonitorTraceExporter: class FakeAzure { constructor() { usedAzure = true; } },
      OTLPTraceExporter: class FakeOtlp { constructor() { usedOtlp = true; } },
      processRef: { once() {} },
      logInfo() {},
      logError() {},
    });

    expect(bootstrap.enabled).toBe(true);
    expect(usedAzure).toBe(true);
    expect(usedOtlp).toBe(false);
  });
});

describe('server/config.js – APPLICATIONINSIGHTS_CONNECTION_STRING', () => {
  beforeEach(() => {
    clearServerCache();
  });

  afterEach(() => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    clearServerCache();
  });

  test('config includes APPLICATIONINSIGHTS_CONNECTION_STRING defaulting to empty string', () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    const { config } = require('../server/config');
    expect(config).toHaveProperty('APPLICATIONINSIGHTS_CONNECTION_STRING');
    expect(config.APPLICATIONINSIGHTS_CONNECTION_STRING).toBe('');
  });

  test('config picks up APPLICATIONINSIGHTS_CONNECTION_STRING from env', () => {
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-key';
    const { config } = require('../server/config');
    expect(config.APPLICATIONINSIGHTS_CONNECTION_STRING).toBe('InstrumentationKey=test-key');
  });
});
