const pino = require('pino');
const { config } = require('./config');

/**
 * Build a Pino mixin that injects OpenTelemetry trace context (traceId,
 * spanId) into every log entry when OTel is active.  Gracefully returns an
 * empty object when @opentelemetry/api is not installed or no active span
 * exists.
 *
 * @param {object} [apiOverride] - Optional OTel API object (for testing).
 */
function buildOtelMixin(apiOverride) {
  let api = apiOverride;
  if (!api) {
    try {
      api = require('@opentelemetry/api');
    } catch {
      return undefined;
    }
  }

  return () => {
    const span = api.trace.getSpan(api.context.active());
    if (!span) return {};
    const ctx = span.spanContext();
    if (!ctx || ctx.traceId === '00000000000000000000000000000000') return {};
    return { traceId: ctx.traceId, spanId: ctx.spanId };
  };
}

const otelMixin = (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging')
  ? buildOtelMixin()
  : undefined;

const logger = pino({
  level: config.LOG_LEVEL,
  ...(otelMixin ? { mixin: otelMixin } : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-access-token"]',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
  ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

module.exports = logger;
module.exports.buildOtelMixin = buildOtelMixin;
