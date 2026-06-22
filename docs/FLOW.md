# Telemetry Flow — Complete Technical Reference

> How every API call becomes a trace, metric, and log — and how to find it in Kibana.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Trace Flow — Step by Step](#2-trace-flow--step-by-step)
3. [What a Real Trace Looks Like](#3-what-a-real-trace-looks-like)
4. [Metrics Flow](#4-metrics-flow)
5. [Logs Flow and Trace Correlation](#5-logs-flow-and-trace-correlation)
6. [OpenTelemetry Collector Deep Dive](#6-opentelemetry-collector-deep-dive)
7. [Kibana Navigation Guide](#7-kibana-navigation-guide)
8. [Observability Scenarios](#8-observability-scenarios)
9. [Data Model — What Gets Stored Where](#9-data-model--what-gets-stored-where)
10. [FAQ](#10-faq)

---

## 1. System Architecture

```
Browser / curl
     │
     │ HTTP
     ▼
┌─────────────────────────────────────┐
│  coffeebrew-backend (Node.js)       │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  OpenTelemetry SDK          │   │
│  │  ├── TracerProvider         │   │
│  │  ├── MeterProvider          │   │
│  │  └── LoggerProvider         │   │
│  │       └── BatchLogProcessor │   │
│  └──────────────┬──────────────┘   │
│                 │ OTLP/gRPC :4317  │
└─────────────────┼───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  OpenTelemetry Collector            │
│                                     │
│  Receivers:  OTLP gRPC/HTTP         │
│  Processors: memory_limiter, batch  │
│              resource, attributes   │
│              filter                 │
│  Exporters:  otlp/elastic           │
│              elasticsearch (logs)   │
│              prometheus (metrics)   │
└──────────────┬──────────────────────┘
               │ OTLP/gRPC
               ▼
┌─────────────────────────────────────┐
│  APM Server :8200                   │
│  Converts OTLP → Elastic APM format │
└──────────────┬──────────────────────┘
               │ Elasticsearch API
               ▼
┌─────────────────────────────────────┐
│  Elasticsearch :9200                │
│                                     │
│  traces-apm-*         (spans)       │
│  metrics-apm.app.*    (metrics)     │
│  logs-apm.error-*     (error logs)  │
│  logs-coffeebrew-demo (all logs)    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Kibana :5601                       │
│  APM · Traces · Logs · Metrics      │
└─────────────────────────────────────┘
```

---

## 2. Trace Flow — Step by Step

### Step 1 — HTTP Request arrives

The `@opentelemetry/instrumentation-http` module (auto-patched via `--require instrumentation.js`) intercepts the incoming Express request and creates the **root span**.

```javascript
// Created automatically — no code needed
Span {
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",  // unique per request
  spanId:  "00f067aa0ba902b7",                   // root span ID
  name:    "POST /orders",
  kind:    SpanKind.SERVER,
  attributes: {
    "http.method": "POST",
    "http.route": "/orders",
    "http.status_code": 201,
  }
}
```

The `traceId` propagates to every child span automatically via **context propagation**.

### Step 2 — Application creates child spans

Each layer manually creates child spans using the OTel Tracer API. They inherit the active context:

```javascript
// orderService.js
tracer.startActiveSpan('order.create', async (span) => {
  span.setAttribute('order.id', orderId);
  span.setAttribute('order.user_id', userId);
  span.setAttribute('order.total_cents', totalCents);

  // Auto-instrumented by @opentelemetry/instrumentation-pg:
  //   → "pg.query SELECT * FROM menu_items WHERE id = ANY($1)"
  //   → "pg.query INSERT INTO orders ..."

  span.end();
});
```

### Step 3 — Auto-instrumentation creates DB and cache spans

No code required for these — the instrumentation libraries patch the drivers:

| Library | Creates spans for |
|---------|------------------|
| `@opentelemetry/instrumentation-http` | All HTTP requests (inbound + outbound) |
| `@opentelemetry/instrumentation-express` | Route-level middleware spans |
| `@opentelemetry/instrumentation-pg` | Every PostgreSQL query |
| `@opentelemetry/instrumentation-redis-4` | Every Redis command |

### Step 4 — BatchSpanProcessor exports to Collector

Spans accumulate in memory. The `BatchSpanProcessor` flushes them every 5 seconds (or when the batch reaches 1024 spans):

```javascript
// instrumentation.js
spanProcessors: [new BatchSpanProcessor(
  new OTLPTraceExporter({ url: "http://otel-collector:4317" })
)]
```

Protocol: **OTLP protobuf over gRPC**, compressed with gzip.

### Step 5 — Collector processes and exports

The Collector runs the traces pipeline:

```
otlp receiver
  → memory_limiter  (reject if memory > 512MB)
  → filter          (drop /health* spans)
  → resource        (add deployment.environment=demo)
  → attributes      (hash user agents)
  → batch           (group for efficiency)
  → otlp/elastic    (export to APM Server :8200)
```

### Step 6 — APM Server writes to Elasticsearch

APM Server converts OTLP spans to Elastic APM format and writes to data streams:

```json
// Stored in traces-apm-default-*
{
  "@timestamp": "2026-06-22T10:53:11.551Z",
  "trace.id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "transaction.id": "00f067aa0ba902b7",
  "transaction.name": "POST /orders",
  "transaction.duration.us": 342000,
  "service.name": "coffeebrew-backend",
  "service.version": "1.0.0",
  "labels.order_id": "ef553de9-..."
}
```

### Step 7 — Kibana renders the waterfall

Kibana queries `traces-apm-*`, groups all spans by `trace.id`, and renders the waterfall diagram.

**Navigate to:** Observability → APM → Services → coffeebrew-backend → Transactions → POST /orders → click any row

---

## 3. What a Real Trace Looks Like

A single `POST /orders` produces this span tree (typical duration: 200-400ms):

```
POST /orders                                              [342ms]
├── authenticate                                          [5ms]
├── order.validateItems                                   [14ms]
│   └── pg.query SELECT menu_items WHERE id = ANY(...)   [11ms]
├── order.checkInventory                                  [28ms]
│   ├── cache.get inventory:a000...                       [3ms]  ← HIT
│   └── pg.query SELECT inventory WHERE item_id = ?      [18ms] ← MISS→DB
├── pg.query INSERT INTO orders                           [17ms]
├── pg.query INSERT INTO order_items                      [12ms]
├── inventory.reserveItems                                [24ms]
│   └── pg.query UPDATE inventory SET reserved = ...     [20ms]
├── payment.process                                       [220ms] ← bottleneck
│   └── HTTP POST mock-external-api:3002/payments/charge [215ms]
└── pg.query UPDATE orders SET status = 'confirmed'      [15ms]
```

**Key insight:** The payment gateway call takes 220ms out of 342ms total — 64% of latency from one external dependency. This is immediately visible in the trace waterfall.

---

## 4. Metrics Flow

### Step 1 — Application records measurements

```javascript
// metrics.js — measurements accumulate in memory, no network call yet
ordersCreated.add(1, { status: 'success' });
orderValueTotal.add(totalCents, { payment_method: 'card' });
orderProcessingDuration.record(processingTime, { status: 'success' });
```

### Step 2 — PeriodicExportingMetricReader flushes every 15 seconds

```javascript
// instrumentation.js
metricReader: new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({ url: "http://otel-collector:4317" }),
  exportIntervalMillis: 15000,
})
```

### Step 3 — Collector metrics pipeline

```
otlp + prometheus receivers
  → memory_limiter
  → resource
  → batch
  → otlp/elastic   (→ APM Server → metrics-apm.app.*)
  → prometheus      (exposed at :8889/metrics for scraping)
```

### Step 4 — Find in Kibana

- **APM → Services → coffeebrew-backend → Metrics** — Node.js runtime + transaction metrics
- **Observability → Infrastructure → Metrics Explorer** — search `coffeebrew` for custom business metrics

### Custom Metrics Reference

| Metric | Type | Labels | What it answers |
|--------|------|--------|----------------|
| `http_requests_total` | Counter | method, route, status_code | How much traffic? |
| `http_request_duration_ms` | Histogram | method, route | What's the p95 latency? |
| `http_active_requests` | UpDownCounter | method | Concurrent load? |
| `http_errors_total` | Counter | method, route, error_type | Error rate? |
| `orders_created_total` | Counter | status | Order success rate? |
| `order_value_cents_total` | Counter | payment_method | Revenue? |
| `order_processing_duration_ms` | Histogram | status | Order processing speed? |
| `payments_processed_total` | Counter | method | Payment volume? |
| `payments_failed_total` | Counter | method, failure_reason | Payment failures? |
| `cache_hits_total` | Counter | operation | Cache effectiveness? |
| `cache_misses_total` | Counter | operation | Cache miss rate? |
| `db_query_duration_ms` | Histogram | operation, table | Slow queries? |
| `db_active_connections` | Gauge | — | Connection pool health? |
| `external_api_duration_ms` | Histogram | service, operation, status | Dependency health? |

---

## 5. Logs Flow and Trace Correlation

### The Correlation Mechanism

Every log entry contains the `trace.id` from the currently active OTel span. This is the bridge between logs and traces.

```javascript
// logger.js — injected automatically on every log call
const otelContextFormat = winston.format((info) => {
  const span = trace.getActiveSpan();     // ← reads OTel context
  if (span) {
    const ctx = span.spanContext();
    info['trace.id'] = ctx.traceId;       // ← Elastic ECS field
    info['transaction.id'] = ctx.spanId;
    info['span.id'] = ctx.spanId;
  }
  return info;
});
```

### Step 1 — Winston writes JSON to stdout AND OTel transport

```javascript
// Two transports — both fire on every log call
transports: [
  new winston.transports.Console(),          // → Docker stdout
  new OpenTelemetryTransportV3(),            // → OTel LoggerProvider
]
```

### Step 2 — OTel transport path

```
OpenTelemetryTransportV3
  → OTel LoggerProvider (registered globally by NodeSDK)
  → BatchLogRecordProcessor
  → OTLPLogExporter (gRPC :4317)
  → Collector logs pipeline
  → Elasticsearch (logs-coffeebrew-demo)
  → Kibana Logs Explorer
```

### Step 3 — A correlated log entry

```json
{
  "@timestamp": "2026-06-22T10:53:11.551Z",
  "level": "info",
  "message": "Order created and confirmed",
  "service": "coffeebrew-backend",

  "trace.id": "ec3cdb142802694a61c28f4b3ac906e6",
  "transaction.id": "d874b725cb521210",
  "span.id": "d874b725cb521210",

  "orderId": "ef553de9-67fe-403b-a5ac-5ae482fe4620",
  "totalCents": 350,
  "processingTime": 213,
  "transactionId": "txn_7696ce353fd4423d"
}
```

### How to use correlation in Kibana

**Trace → Logs (find all logs from a request):**
1. APM → open any trace
2. Click the **Logs** tab in the trace detail panel
3. All log entries with the same `trace.id` appear

**Logs → Trace (find the trace for a log entry):**
1. Observability → Logs → Explorer
2. Find a log entry
3. Click the `trace.id` field value
4. Opens the matching trace in APM

---

## 6. OpenTelemetry Collector Deep Dive

### Why each processor exists

| Processor | Purpose | What happens without it |
|-----------|---------|------------------------|
| `memory_limiter` | Rejects new data when RAM > 512MB | Collector crashes under high load |
| `filter/drop_health_checks` | Drops `GET /health` spans | Health checks flood trace view (1 every 10s) |
| `resource` | Adds `deployment.environment=demo` | No environment label on data |
| `attributes` | Hashes `http.user_agent` | Raw user agent strings stored (privacy) |
| `batch` | Groups spans before export | One network call per span (10x overhead) |

### Collector self-monitoring

| Endpoint | What it shows |
|----------|--------------|
| `http://localhost:13133/` | Health check — returns 200 when ready |
| `http://localhost:55679/debug/tracez` | In-process span debugging (zPages) |
| `http://localhost:8888/metrics` | Collector's own Prometheus metrics |
| `http://localhost:8889/metrics` | Application metrics in Prometheus format |

### Useful collector metrics to watch

```bash
# How many spans received?
curl -s http://localhost:8888/metrics | grep otelcol_receiver_accepted_spans

# How many exported successfully?
curl -s http://localhost:8888/metrics | grep otelcol_exporter_sent_spans

# Any export failures?
curl -s http://localhost:8888/metrics | grep otelcol_exporter_send_failed
```

---

## 7. Kibana Navigation Guide

### APM Views

| View | Navigate to | What you see |
|------|-------------|-------------|
| Services overview | Observability → APM → Services | All instrumented services, health indicators |
| Transaction list | APM → coffeebrew-backend → Transactions | All routes with latency, throughput, error rate |
| Trace waterfall | Click any transaction → click a trace sample | Full span tree with durations |
| Error list | APM → coffeebrew-backend → Errors | Exceptions grouped by type with stack traces |
| Service Map | APM → Service Map | Visual dependency graph |
| Runtime Metrics | APM → coffeebrew-backend → Metrics | Heap, GC, event loop |

### Logs Views

| View | Navigate to | Filter to use |
|------|-------------|--------------|
| All app logs | Observability → Logs → Explorer | `service.name : "coffeebrew-backend"` |
| Error logs only | Observability → Logs → Explorer | `service.name : "coffeebrew-backend" AND level : "error"` |
| Logs for a trace | Any trace → Logs tab | Automatic |
| Raw log search | Analytics → Discover | Index: `logs-*` |

### Finding a specific scenario

After running a scenario, find it in Kibana:

```bash
curl http://localhost:3001/scenarios/db-error
```

1. Note the `trace.id` in the response (or from backend logs)
2. APM → Traces → paste the trace ID in the search
3. OR APM → Errors → find the new error entry → click "View in context"

---

## 8. Observability Scenarios

### Scenario A — Healthy Request

**Trigger:** `GET /scenarios/healthy`

**Trace structure:**
```
GET /scenarios/healthy                [~30ms]
├── authenticate                      [5ms]
├── cache.get scenario:healthy:data   [2ms]
└── business.processRequest           [18ms]
    └── db.query SELECT NOW()         [10ms]
```

**In Kibana:** All spans green. Typical total duration under 50ms.

---

### Scenario B — Slow Request

**Trigger:** `GET /scenarios/slow?ms=3000`

**What makes it interesting:** The `db.slowQuery` span executes `SELECT pg_sleep(3)` — a real PostgreSQL sleep. The span duration is the full 3000ms.

**Trace structure:**
```
GET /scenarios/slow                   [3050ms]
├── authenticate                      [5ms]
└── business.slowOperation            [3040ms]
    └── db.slowQuery  ← BOTTLENECK    [3030ms]
```

**In Kibana:**
- The slow span spans the full width of the waterfall
- In Transaction list: appears at top when sorted by Duration
- In Latency chart: this trace is a far outlier on the p99 line

---

### Scenario C — Database Error

**Trigger:** `GET /scenarios/db-error`

**What makes it interesting:** Queries a table that doesn't exist. The PostgreSQL error propagates up through the span tree.

**Trace structure:**
```
GET /scenarios/db-error               [ERROR]
└── db.failingQuery                   [ERROR]
    └── Exception: relation "nonexistent_table_xyz" does not exist
        PostgreSQL error code: 42P01
```

**In Kibana:**
- APM → Errors: new entry appears within 30s
- Error detail shows PostgreSQL exception type, code, full message
- The span has `otel.status_code = ERROR` attribute
- Correlated log: `level: error` with same `trace.id`

---

### Scenario D — External API Timeout

**Trigger:** `GET /scenarios/timeout?ms=1500`

**What makes it interesting:** The external API is told to wait 2 seconds, but the client times out at 1.5 seconds. The span duration reflects the client timeout, not the server response time.

**Trace structure:**
```
GET /scenarios/timeout                [ERROR, ~1500ms]
└── external.api.call                 [ERROR, 1500ms]
    └── GET mock-external-api/slow    [TIMEOUT after 1500ms]
        server was told to wait 2000ms, never responded
```

**In Kibana:**
- The HTTP outbound span has `error.type: timeout`
- Service Map: arrow to mock-external-api shows high error rate

---

### Scenario E — Cascading Failures

**Trigger:** `GET /scenarios/cascade`

**What makes it interesting:** Multiple operations fail independently within the same request. The root span's error status rolls up from its children.

**Trace structure:**
```
GET /scenarios/cascade                [ERROR]
├── cache.get some:key                [OK]  ← succeeds
├── db.query1                         [ERROR] ← table not found
└── db.query2                         [ERROR] ← different table, also not found
```

**In Kibana:**
- Two distinct error entries in APM Errors (different error messages)
- Both share the same `trace.id`
- Waterfall shows the cache span green, both DB spans red

---

## 9. Data Model — What Gets Stored Where

| Data | Elasticsearch Index | Written by |
|------|--------------------|-----------| 
| Transactions (root spans) | `traces-apm-*` | APM Server |
| Spans (child spans) | `traces-apm-*` | APM Server |
| APM errors (exceptions) | `logs-apm.error-*` | APM Server |
| Application metrics | `metrics-apm.app.*` | APM Server |
| Service metrics (1m) | `metrics-apm.service_*` | APM Server |
| All application logs | `logs-coffeebrew-demo` | OTel Collector (ES exporter) |

### Verify data is flowing

```bash
# Check document counts
curl -s -u elastic:changeme \
  "http://localhost:9200/_cat/indices?v&h=index,docs.count" | grep -E "traces|logs|metrics"

# Search for a specific trace
curl -s -u elastic:changeme \
  "http://localhost:9200/traces-apm-*/_search?q=trace.id:YOUR_TRACE_ID&pretty" | head -50

# Count log records
curl -s -u elastic:changeme \
  "http://localhost:9200/logs-coffeebrew-demo/_count"
```

---

## 10. FAQ

### Why does the APM Logs tab show only startup errors?

The APM Logs tab is scoped to a specific time window around a transaction. It shows logs correlated to the **currently viewed trace**, not all logs. For all logs, use **Observability → Logs → Explorer**.

### Why is `otel-collector` appearing as a service in APM?

The Prometheus receiver scrapes the collector's own self-metrics from `:8888` and routes them through the metrics pipeline to APM. APM auto-creates a service entry for any source sending telemetry. It has no transactions — only metrics. Safe to ignore.

### Why does "Field system.memory.usage was not found" appear in Infrastructure tab?

The Infrastructure tab expects OS-level metrics (`system.memory.*`, `system.cpu.*`) collected by **Elastic Agent** or **Metricbeat**. The Node.js OTel SDK only exports Node.js runtime metrics. Use the **Metrics tab** in APM instead — it shows heap, event loop, and GC data.

### Why is Elasticsearch status `yellow`?

Yellow means all data is available but replica shards are unassigned. In a single-node setup, there's nowhere to place replicas. All data is safe and queryable. Normal for development.

### How does context propagation work for outbound calls?

When `coffeebrew-backend` calls `mock-external-api`, the HTTP instrumentation automatically injects the `traceparent` W3C header:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

If the downstream service also runs an OTel SDK, it reads this header and continues the same trace. In this demo, `mock-external-api` is uninstrumented, so the trace ends at the outbound HTTP span.

### Why must `instrumentation.js` be loaded with `--require`?

The OTel SDK patches Node.js's `require()` function at startup. If application code loads first, modules like `http`, `pg`, and `redis` are already cached — patching them afterwards has no effect. The `--require` flag ensures the SDK runs before any `require()` calls.

```bash
# Correct — SDK patches first
node --require ./src/instrumentation.js src/server.js

# Wrong — http, pg already loaded by the time SDK runs
node src/server.js  # then require('./instrumentation')
```
