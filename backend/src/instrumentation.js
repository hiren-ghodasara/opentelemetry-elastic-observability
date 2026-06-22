'use strict';

/**
 * OpenTelemetry Instrumentation Bootstrap
 *
 * CRITICAL: This file must be loaded BEFORE any application code via
 * --require flag. It patches Node.js modules at startup so all subsequent
 * require() calls get auto-instrumented versions.
 *
 * Pipeline:
 *   SDK → OTLP gRPC exporter → OTel Collector → Elastic APM / ES
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes,
} = require('@opentelemetry/semantic-conventions');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-grpc');
const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-grpc');
const {
  OTLPLogExporter,
} = require('@opentelemetry/exporter-logs-otlp-grpc');
const {
  PeriodicExportingMetricReader,
  MeterProvider,
} = require('@opentelemetry/sdk-metrics');
const {
  BatchLogRecordProcessor,
  LoggerProvider,
} = require('@opentelemetry/sdk-logs');
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');
const {
  BatchSpanProcessor,
} = require('@opentelemetry/sdk-trace-node');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

// Uncomment to debug OTel SDK issues:
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const OTLP_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4317';

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]:
    process.env.OTEL_SERVICE_NAME || 'coffeebrew-backend',
  [SemanticResourceAttributes.SERVICE_VERSION]:
    process.env.OTEL_SERVICE_VERSION || '1.0.0',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
    process.env.NODE_ENV || 'development',
  'service.namespace': 'coffeebrew',
  'host.name': require('os').hostname(),
});

// ── Trace Exporter ────────────────────────────────────────────────────────────
const traceExporter = new OTLPTraceExporter({
  url: OTLP_ENDPOINT,
});

// ── Metric Exporter ───────────────────────────────────────────────────────────
const metricExporter = new OTLPMetricExporter({
  url: OTLP_ENDPOINT,
});

// ── Log Exporter ──────────────────────────────────────────────────────────────
const logExporter = new OTLPLogExporter({
  url: OTLP_ENDPOINT,
});

// ── SDK ───────────────────────────────────────────────────────────────────────
const sdk = new NodeSDK({
  resource,
  traceExporter,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 15000, // Export metrics every 15 seconds
  }),
  logRecordProcessor: new BatchLogRecordProcessor(logExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      // HTTP instrumentation — captures all inbound/outbound HTTP calls
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        // Capture request/response headers as span attributes
        requestHook: (span, request) => {
          span.setAttribute('http.request.id', request.headers['x-request-id'] || '');
          span.setAttribute('http.user.id', request.headers['x-user-id'] || '');
        },
      },
      // Express instrumentation — adds route-level spans
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      // PostgreSQL instrumentation — captures SQL queries as spans
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
        // Include sanitized query text in spans
        addSqlCommenterCommentToQueries: true,
        dbStatementSerializer: (operation, queryConfig) => {
          // Sanitize: replace parameter values with placeholders
          return typeof queryConfig === 'string'
            ? queryConfig.replace(/\$\d+/g, '?')
            : queryConfig?.text?.replace(/\$\d+/g, '?') || operation;
        },
      },
      // Redis instrumentation — captures cache operations
      '@opentelemetry/instrumentation-redis-4': {
        enabled: true,
      },
      // DNS instrumentation — shows hostname resolution in traces
      '@opentelemetry/instrumentation-dns': {
        enabled: true,
      },
    }),
  ],
});

sdk.start();
console.log('[OTel] SDK started — exporting to', OTLP_ENDPOINT);

// Graceful shutdown — flushes pending spans/metrics/logs before exit
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('[OTel] SDK shut down successfully'))
    .catch((err) => console.error('[OTel] SDK shutdown error:', err))
    .finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  sdk
    .shutdown()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
});
