/**
 * OpenTelemetry bootstrap — must be required before any other server modules.
 *
 * Exporter selection (first match wins):
 *  1. OTEL_EXPORTER_OTLP_ENDPOINT set, no Azure conn string → OTLP HTTP exporter
 *  2. APPLICATIONINSIGHTS_CONNECTION_STRING set → Azure Monitor exporter
 *  3. Neither set → silent no-op (local dev default)
 */

const { name, version } = require('../package.json');

const ENABLED_INSTRUMENTATIONS = new Set([
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-express',
]);

function getConnectionString(value = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;
}

function buildInstrumentations(getNodeAutoInstrumentations) {
  return getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-http': { enabled: true },
    '@opentelemetry/instrumentation-express': { enabled: true },
  }).filter((instrumentation) => ENABLED_INSTRUMENTATIONS.has(instrumentation.instrumentationName));
}

function createTelemetryBootstrap(options = {}) {
  const connectionString = getConnectionString(options.connectionString);
  const rawEndpoint = options.otlpEndpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlpEndpoint = rawEndpoint ? rawEndpoint.trim().replace(/\/+$/, '') : undefined;

  if (!connectionString && !otlpEndpoint) {
    return { enabled: false };
  }

  const {
    NodeSDK = require('@opentelemetry/sdk-node').NodeSDK,
    getNodeAutoInstrumentations = require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations,
    AzureMonitorTraceExporter = connectionString
      ? require('@azure/monitor-opentelemetry-exporter').AzureMonitorTraceExporter
      : undefined,
    OTLPTraceExporter: providedOTLPTraceExporter,
    logInfo = console.log,
    logError = console.error,
    processRef = process,
  } = options;

  let OTLPTraceExporter = providedOTLPTraceExporter;
  if (otlpEndpoint && !connectionString && !OTLPTraceExporter) {
    try {
      ({ OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http'));
    } catch (err) {
      logError(
        'OpenTelemetry disabled: OTLP exporter module "@opentelemetry/exporter-trace-otlp-http" could not be loaded',
        err,
      );
      return { enabled: false };
    }
  }

  const instrumentations = buildInstrumentations(getNodeAutoInstrumentations);

  let traceExporter;
  let startupMessage;
  if (otlpEndpoint && !connectionString) {
    traceExporter = new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` });
    startupMessage = `OpenTelemetry active — exporting traces via OTLP to "${otlpEndpoint}"`;
  } else {
    traceExporter = new AzureMonitorTraceExporter({ connectionString });
    startupMessage = `OpenTelemetry active — exporting traces for "${name}@${version}"`;
  }

  const sdk = new NodeSDK({
    traceExporter,
    instrumentations,
    serviceName: name,
    serviceVersion: version,
  });

  let shutdownPromise;

  // NodeSDK.start() is synchronous (returns void) in sdk-node ≥0.200.
  // Wrap in try/catch and produce our own Promise for consumers.
  let startPromise;
  try {
    sdk.start();
    // console.log is intentional: this module must load before server/logger.js
    // (it instruments Node HTTP before Express loads), so Pino is not available yet.
    // server/config.js is the only other module allowed to use console (see §4 Logging).
    logInfo(startupMessage);
    startPromise = Promise.resolve(true);
  } catch (err) {
    logError('OpenTelemetry failed to start', err);
    startPromise = Promise.resolve(false);
  }

  const shutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = sdk.shutdown()
        .catch((err) => {
          logError('OpenTelemetry shutdown error', err);
        })
        .finally(() => {
          shutdownPromise = undefined;
        });
    }

    return shutdownPromise;
  };

  processRef.once('SIGTERM', () => {
    void shutdown();
  });
  processRef.once('SIGINT', () => {
    void shutdown();
  });

  return {
    enabled: true,
    instrumentations,
    sdk,
    startPromise,
    shutdown,
  };
}

const telemetry = createTelemetryBootstrap();

module.exports = {
  ENABLED_INSTRUMENTATIONS,
  buildInstrumentations,
  createTelemetryBootstrap,
  telemetry,
};
