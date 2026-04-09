/**
 * OpenTelemetry bootstrap — must be required before any other server modules.
 *
 * Activates only when APPLICATIONINSIGHTS_CONNECTION_STRING is set.
 * When absent the module is a silent no-op so local dev is unaffected.
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
  if (!connectionString) {
    return { enabled: false };
  }

  const {
    NodeSDK = require('@opentelemetry/sdk-node').NodeSDK,
    getNodeAutoInstrumentations = require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations,
    AzureMonitorTraceExporter = require('@azure/monitor-opentelemetry-exporter').AzureMonitorTraceExporter,
    logInfo = console.log,
    logError = console.error,
    processRef = process,
  } = options;

  const instrumentations = buildInstrumentations(getNodeAutoInstrumentations);
  const traceExporter = new AzureMonitorTraceExporter({ connectionString });
  const sdk = new NodeSDK({
    traceExporter,
    instrumentations,
    serviceName: name,
    serviceVersion: version,
  });

  let shutdownPromise;
  const startPromise = sdk.start()
    .then(() => {
      // console.log is intentional: this module must load before server/logger.js
      // (it instruments Node HTTP before Express loads), so Pino is not available yet.
      // server/config.js is the only other module allowed to use console (see §4 Logging).
      logInfo(`OpenTelemetry active — exporting traces for "${name}@${version}"`);
      return true;
    })
    .catch((err) => {
      logError('OpenTelemetry failed to start', err);
      return false;
    });

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
