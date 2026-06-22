'use strict';

/**
 * Application Metrics Registry
 *
 * All custom business and application metrics are defined here.
 * Metrics are exported via OTLP to the OTel Collector every 15s.
 *
 * Metric types:
 *   Counter     — cumulative, only goes up (requests, errors, orders)
 *   Histogram   — distribution of values (latency, sizes)
 *   Gauge       — current point-in-time value (active connections, queue depth)
 *   UpDownCounter — can go up or down (active requests, inventory)
 */

const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('coffeebrew-backend', '1.0.0');

// ── HTTP / Application Metrics ────────────────────────────────────────────────

/** Total HTTP requests received */
const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests received',
  unit: '{requests}',
});

/** HTTP request duration in milliseconds */
const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'Duration of HTTP requests in milliseconds',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  },
});

/** Currently active HTTP requests */
const httpActiveRequests = meter.createUpDownCounter('http_active_requests', {
  description: 'Number of currently active HTTP requests',
  unit: '{requests}',
});

/** Total HTTP errors */
const httpErrorsTotal = meter.createCounter('http_errors_total', {
  description: 'Total number of HTTP errors (4xx + 5xx)',
  unit: '{errors}',
});

// ── Business Metrics ──────────────────────────────────────────────────────────

/** Total orders created */
const ordersCreated = meter.createCounter('orders_created_total', {
  description: 'Total number of orders created',
  unit: '{orders}',
});

/** Total order value in cents */
const orderValueTotal = meter.createCounter('order_value_cents_total', {
  description: 'Total value of all orders placed in cents',
  unit: 'cents',
});

/** Order processing duration */
const orderProcessingDuration = meter.createHistogram('order_processing_duration_ms', {
  description: 'Time taken to process an order from creation to confirmation',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [50, 100, 200, 500, 1000, 2000, 5000],
  },
});

/** Payment attempts */
const paymentsProcessed = meter.createCounter('payments_processed_total', {
  description: 'Total number of payment processing attempts',
  unit: '{payments}',
});

/** Failed payments */
const paymentsFailed = meter.createCounter('payments_failed_total', {
  description: 'Total number of failed payment attempts',
  unit: '{payments}',
});

/** Inventory checks performed */
const inventoryChecks = meter.createCounter('inventory_checks_total', {
  description: 'Total number of inventory availability checks',
  unit: '{checks}',
});

/** Cache hits */
const cacheHits = meter.createCounter('cache_hits_total', {
  description: 'Total number of cache hits',
  unit: '{hits}',
});

/** Cache misses */
const cacheMisses = meter.createCounter('cache_misses_total', {
  description: 'Total number of cache misses',
  unit: '{misses}',
});

/** Database query duration */
const dbQueryDuration = meter.createHistogram('db_query_duration_ms', {
  description: 'Duration of database queries',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  },
});

/** External API call duration */
const externalApiDuration = meter.createHistogram('external_api_duration_ms', {
  description: 'Duration of external API calls',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  },
});

/** Active database connections (simulated) */
let activeDbConnections = 0;
const dbActiveConnections = meter.createObservableGauge('db_active_connections', {
  description: 'Number of active database connections',
  unit: '{connections}',
});
dbActiveConnections.addCallback((obs) => obs.observe(activeDbConnections));

module.exports = {
  httpRequestsTotal,
  httpRequestDuration,
  httpActiveRequests,
  httpErrorsTotal,
  ordersCreated,
  orderValueTotal,
  orderProcessingDuration,
  paymentsProcessed,
  paymentsFailed,
  inventoryChecks,
  cacheHits,
  cacheMisses,
  dbQueryDuration,
  externalApiDuration,
  setActiveDbConnections: (n) => { activeDbConnections = n; },
};
