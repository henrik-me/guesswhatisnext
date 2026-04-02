const pino = require('pino');
const { config } = require('./config');

/**
 * Build a Pino mixin that injects OpenTelemetry trace context (trace_id,
 * span_id) into every log entry when OTel is active.  Returns undefined
 * when @opentelemetry/api is not installed so the caller can skip setting
 * the mixin entirely.  Returns {} for individual calls with no active span.
 *
 * Uses snake_case field names (trace_id/span_id) to align with common
 * observability tool conventions (ELK, Azure Monitor custom dimensions).
 *
 * @param {object} [apiOverride] - Optional OTel API object (for testing).
 * @returns {Function|undefined} Mixin function, or undefined if OTel unavailable.
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
    return { trace_id: ctx.traceId, span_id: ctx.spanId };
  };
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-access-token"]',
  'res.headers["set-cookie"]',
];

function buildLoggerOptions(configOverride = config) {
  const mixin = (configOverride.NODE_ENV === 'production' || configOverride.NODE_ENV === 'staging')
    ? buildOtelMixin()
    : undefined;

  return {
    level: configOverride.LOG_LEVEL,
    ...(mixin ? { mixin } : {}),
    redact: {
      paths: REDACT_PATHS,
      remove: true,
    },
    ...(configOverride.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  };
}

const logger = pino(buildLoggerOptions());

module.exports = logger;
module.exports.buildOtelMixin = buildOtelMixin;
module.exports.buildLoggerOptions = buildLoggerOptions;
module.exports.REDACT_PATHS = REDACT_PATHS;
