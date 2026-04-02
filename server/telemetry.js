/**
 * OpenTelemetry bootstrap — must be required before any other server modules.
 *
 * Activates only when APPLICATIONINSIGHTS_CONNECTION_STRING is set.
 * When absent the module is a silent no-op so local dev is unaffected.
 */

const connectionString = (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || '').trim() || undefined;

if (connectionString) {
  const { NodeSDK } = require('@opentelemetry/sdk-node')
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
  const { AzureMonitorTraceExporter } = require('@azure/monitor-opentelemetry-exporter')

  const { name, version } = require('../package.json')

  const traceExporter = new AzureMonitorTraceExporter({ connectionString })

  const sdk = new NodeSDK({
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        // Disable noisy/unnecessary instrumentations
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
    serviceName: name,
    serviceVersion: version,
  })

  sdk.start()
    .catch((err) => console.error('OpenTelemetry failed to start', err))

  // Graceful shutdown — flush pending spans before process exits
  const shutdown = () => {
    sdk.shutdown()
      .catch((err) => console.error('OpenTelemetry shutdown error', err))
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // console.log is intentional: this module must load before server/logger.js
  // (it instruments Node HTTP before Express loads), so Pino is not available yet.
  // server/config.js is the only other module allowed to use console (see §4 Logging).
  console.log(`OpenTelemetry active — exporting traces for "${name}@${version}"`)
}

module.exports = {}
