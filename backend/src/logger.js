'use strict';

/**
 * Structured logger with two outputs:
 *
 * 1. Console (stdout) — JSON picked up by Docker / log shippers
 * 2. OpenTelemetry transport — sends log records directly to the OTel
 *    Collector via the Logs API, which routes them to Elasticsearch.
 *    This is what makes ALL log levels (info, debug, warn, error)
 *    appear in Kibana, not just errors.
 *
 * Trace-log correlation: every log entry gets trace.id + span.id
 * injected from the currently active OTel span so Kibana can link
 * a log line to its trace waterfall.
 */

const winston = require('winston');
const { trace } = require('@opentelemetry/api');
const { OpenTelemetryTransportV3 } = require('@opentelemetry/winston-transport');

// Injects trace.id + span.id from the active OTel span into every log entry.
// Elastic ECS field names so Kibana APM correlates them automatically.
const otelContextFormat = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const ctx = span.spanContext();
    info['trace.id'] = ctx.traceId;
    info['transaction.id'] = ctx.spanId;
    info['span.id'] = ctx.spanId;
  }
  return info;
});

const logger = winston.createLogger({
  // 'debug' captures error, warn, info, http, verbose, debug
  // Change to 'silly' to also capture silly-level logs
  level: process.env.LOG_LEVEL || 'debug',
  format: winston.format.combine(
    otelContextFormat(),
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.OTEL_SERVICE_NAME || 'coffeebrew-backend',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.OTEL_SERVICE_VERSION || '1.0.0',
  },
  transports: [
    // ── 1. Console (stdout) ────────────────────────────────────────
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'development'
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          : winston.format.json(),
    }),

    // ── 2. OTel transport ──────────────────────────────────────────
    // Sends log records to the OTel LoggerProvider → BatchLogRecordProcessor
    // → OTLPLogExporter → Collector logs pipeline → Elasticsearch
    // This is why ALL log levels appear in Kibana Logs Explorer.
    new OpenTelemetryTransportV3(),
  ],
});

module.exports = logger;
