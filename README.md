<div align="center">

# ☕ OpenTelemetry + Elastic Observability Starter

**A production-grade, fully working local observability stack — zero configuration required.**

*Traces · Metrics · Logs · APM · Distributed Tracing · Kibana Dashboards*

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-SDK%201.x-425CC7?logo=opentelemetry&logoColor=white)](https://opentelemetry.io/)
[![Elastic](https://img.shields.io/badge/Elastic-8.13-005571?logo=elastic&logoColor=white)](https://www.elastic.co/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

**One command to run. Five minutes to understand distributed tracing.**

```bash
docker compose up -d
```

Then open **http://localhost:5601** and start exploring.

</div>

---

## 🎯 What This Is

A **complete, runnable observability demo** built with OpenTelemetry and the Elastic Stack. It ships a realistic Node.js microservice — a coffee shop ordering API — that generates real traces, metrics, and logs through a production-quality pipeline.

This is **not a toy**. Every component mirrors what you'd run in production:

- Auto-instrumented HTTP, PostgreSQL, and Redis spans
- Manual business spans with meaningful attributes
- Structured logs with trace correlation
- Custom application metrics
- 5 intentional failure scenarios to learn from

> **If you've ever wondered** *"how do traces, metrics, and logs actually connect?"* — this repo answers that with working code you can run and break.

---

## ✨ Features

- 🔍 **Distributed Tracing** — full span waterfall from HTTP request to database query to external API call
- 📊 **Metrics** — custom business metrics (orders, payments, cache hit rate) + Node.js runtime metrics
- 📋 **Structured Logs** — JSON logs with automatic `trace.id` injection for Kibana correlation
- 🔗 **Trace-Log Correlation** — jump from a trace to its logs and back, in one click
- 💥 **Error Scenarios** — 5 pre-built observability scenarios: healthy, slow, DB error, timeout, cascade failure
- 🗺️ **Service Map** — visual graph of service dependencies with latency/error indicators
- ⚡ **Zero Setup** — single `docker compose up -d` starts the entire stack

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LOCAL DOCKER NETWORK                          │
│                                                                       │
│  ┌──────────────┐   ┌────────────────────────────────────────────┐  │
│  │  React UI    │   │         CoffeeBrew Backend                 │  │
│  │  :3000       │──▶│  Node.js 20 · Express · OTel SDK 1.x      │  │
│  └──────────────┘   └─────────────────┬──────────────────────────┘  │
│                                        │ OTLP/gRPC                   │
│  ┌──────────────┐   ┌─────────────────▼──────────────────────────┐  │
│  │  PostgreSQL  │   │        OpenTelemetry Collector              │  │
│  │  :5432       │   │  Contrib 0.99 · Receivers · Processors     │  │
│  └──────────────┘   │  Exporters: APM Server + Elasticsearch     │  │
│  ┌──────────────┐   └─────────────────┬──────────────────────────┘  │
│  │  Redis       │                     │ OTLP/gRPC                   │
│  │  :6379       │   ┌─────────────────▼──────────────────────────┐  │
│  └──────────────┘   │           APM Server :8200                 │  │
│  ┌──────────────┐   └─────────────────┬──────────────────────────┘  │
│  │ Mock Payment │                     │                             │
│  │ API :3002    │   ┌─────────────────▼──────────────────────────┐  │
│  └──────────────┘   │        Elasticsearch :9200                  │  │
│                      └─────────────────┬──────────────────────────┘  │
│                                        │                             │
│                      ┌─────────────────▼──────────────────────────┐  │
│                      │            Kibana :5601                    │  │
│                      │  APM · Traces · Logs · Metrics · Maps     │  │
│                      └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Signal flow:** App → OTLP/gRPC → Collector → APM Server → Elasticsearch → Kibana

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop / Rancher Desktop
- 6 GB RAM allocated to Docker
- Ports 3000, 3001, 4317, 5601, 8200, 9200 free

### Start the Stack

```bash
git clone https://github.com/YOUR_USERNAME/opentelemetry-elastic-observability.git
cd opentelemetry-elastic-observability

docker compose up -d
```

### Wait for Services (~3-4 minutes on first run)

```bash
# Watch startup
docker compose logs -f setup-es setup-kibana

# Verify all services are healthy
docker compose ps
```

### Open Kibana

```
URL:      http://localhost:5601
Username: elastic
Password: changeme
```

Navigate to **Observability → APM → Services** to see `coffeebrew-backend`.

### Generate Traffic

```bash
# Quick test
curl http://localhost:3001/health

# Generate 20 realistic orders
bash scripts/generate-traffic.sh 20

# Trigger all failure scenarios
bash scripts/generate-failures.sh
```

Or use the **React UI** at **http://localhost:3000** to generate traffic interactively.

---

## 📦 What's Running

| Service | Port | Purpose |
|---------|------|---------|
| `coffeebrew-backend` | 3001 | Node.js API with full OTel instrumentation |
| `coffeebrew-frontend` | 3000 | React dashboard for traffic generation |
| `mock-external-api` | 3002 | Simulated payment gateway |
| `otel-collector` | 4317/4318 | Telemetry pipeline hub |
| `apm-server` | 8200 | Elastic APM receiver |
| `elasticsearch` | 9200 | Data store |
| `kibana` | 5601 | Visualization |
| `postgres` | 5432 | Application database |
| `redis` | 6379 | Cache layer |

---

## 🎭 Observability Scenarios

Five built-in scenarios that generate specific, instructive trace patterns:

### Scenario A — Healthy Request
```bash
curl http://localhost:3001/scenarios/healthy
```
**Learn:** What a clean trace looks like. All green spans, nested call hierarchy, sub-10ms DB queries.

**Find it in Kibana:** APM → Transactions → `GET /scenarios/healthy` → click any trace

---

### Scenario B — Slow Request
```bash
curl "http://localhost:3001/scenarios/slow?ms=3000"
```
**Learn:** How slow spans appear highlighted in the waterfall. How latency percentiles shift.

**Find it in Kibana:** Sort Transactions by **Duration Descending** → the `db.slowQuery` span spans the full width

---

### Scenario C — Database Error
```bash
curl http://localhost:3001/scenarios/db-error
```
**Learn:** How exceptions propagate from child spans to parent spans. How errors appear in APM.

**Find it in Kibana:** APM → **Errors** → click the new error → stack trace + correlated logs

---

### Scenario D — External API Timeout
```bash
curl "http://localhost:3001/scenarios/timeout?ms=1500"
```
**Learn:** How timeouts appear in traces. Span duration = timeout threshold, not server response time.

**Find it in Kibana:** Trace waterfall → `external.api.call` span → duration = exactly 1500ms

---

### Scenario E — Cascading Failures
```bash
curl http://localhost:3001/scenarios/cascade
```
**Learn:** Multiple failed child spans in one trace. How APM Errors groups distinct failures.

**Find it in Kibana:** APM → Errors → multiple errors sharing the same `trace.id`

---

## 🔍 Trace-Log Correlation

Every log entry automatically contains the `trace.id` from the active span:

```json
{
  "@timestamp": "2026-06-22T10:53:11.551Z",
  "level": "info",
  "message": "Order created and confirmed",
  "trace.id": "ec3cdb142802694a61c28f4b3ac906e6",
  "transaction.id": "d874b725cb521210",
  "orderId": "ef553de9-...",
  "totalCents": 350,
  "processingTime": 213
}
```

**Trace → Logs:** APM → open any trace → click **Logs** tab

**Logs → Trace:** Observability → Logs → Explorer → click `trace.id` field value

---

## 📊 Custom Metrics

The application exports these business metrics via OTLP every 15 seconds:

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by route/status |
| `http_request_duration_ms` | Histogram | Latency distribution with p50/p95/p99 |
| `orders_created_total` | Counter | Orders by success/failure |
| `order_value_cents_total` | Counter | Revenue tracking |
| `payments_processed_total` | Counter | Payment attempts by method |
| `payments_failed_total` | Counter | Failures by reason |
| `cache_hits_total` | Counter | Redis cache hit rate |
| `db_query_duration_ms` | Histogram | Database query latency by operation |
| `db_active_connections` | Gauge | Live connection pool depth |

**Find in Kibana:** APM → Services → coffeebrew-backend → **Metrics** tab

---

## 📁 Project Structure

```
opentelemetry-elastic-observability/
├── docker-compose.yml              # Full stack orchestration
├── .env                            # Passwords (changeme for local dev)
├── otel-collector/
│   └── config.yaml                 # Collector pipeline: receivers → processors → exporters
├── kibana/
│   └── kibana.yml                  # Kibana configuration
├── backend/
│   ├── src/
│   │   ├── instrumentation.js      ← OTel SDK bootstrap (--require first)
│   │   ├── logger.js               ← Winston + OTel transport for log→trace correlation
│   │   ├── metrics.js              ← All custom metric definitions
│   │   ├── server.js               ← Express app
│   │   ├── db/pool.js              ← PostgreSQL pool
│   │   ├── middleware/
│   │   │   ├── auth.js             ← Auth middleware with custom spans
│   │   │   └── requestLogger.js    ← HTTP metrics + structured request logs
│   │   ├── services/
│   │   │   ├── orderService.js     ← Core business logic — richest trace tree
│   │   │   ├── inventoryService.js ← Cache-aside pattern with spans
│   │   │   ├── paymentService.js   ← External HTTP call with spans
│   │   │   └── cacheService.js     ← Redis with cache hit/miss spans
│   │   └── routes/
│   │       ├── orders.js
│   │       ├── menu.js
│   │       └── scenarios.js        ← 5 observability learning scenarios
│   └── sql/init.sql                ← Schema + seed data
├── frontend/src/App.jsx            ← React traffic generator UI
├── mock-external-api/server.js     ← Simulated payment gateway
├── scripts/
│   ├── generate-traffic.sh         ← Bulk order generation
│   └── generate-failures.sh        ← All scenario triggers
└── docs/
    └── FLOW.md                     ← Complete telemetry flow documentation
```

---

## 🛠️ OpenTelemetry Collector Pipeline

```yaml
traces:
  receivers:  [otlp]                           # Accept from SDK
  processors: [memory_limiter,                  # Prevent OOM
               filter/drop_health_checks,       # Reduce noise
               resource,                        # Add env metadata
               attributes,                      # Hash PII
               batch]                           # Network efficiency
  exporters:  [otlp/elastic]                   # → APM Server

metrics:
  receivers:  [otlp, prometheus]               # SDK + self-metrics
  processors: [memory_limiter, resource, batch]
  exporters:  [otlp/elastic, prometheus]       # → APM + scrape endpoint

logs:
  receivers:  [otlp]                           # From winston-transport
  processors: [memory_limiter, resource, batch]
  exporters:  [otlp/elastic, elasticsearch]   # → APM + ES direct
```

---

## 🔧 Configuration

All secrets are in `.env` (safe for local dev, never commit to production):

```env
ELASTIC_PASSWORD=changeme
KIBANA_SYSTEM_PASSWORD=changeme
APM_SECRET_TOKEN=supersecrettoken
POSTGRES_PASSWORD=coffeebrew123
```

---

## 🧑‍💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| Application | Node.js 20, Express 4, React 18 |
| Instrumentation | OpenTelemetry SDK 1.x (auto + manual) |
| Transport | OTLP/gRPC |
| Pipeline | OpenTelemetry Collector Contrib 0.99 |
| APM | Elastic APM Server 8.13 |
| Storage | Elasticsearch 8.13 |
| Visualization | Kibana 8.13 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Container Runtime | Docker Compose |

---

## ✅ Verification Checklist

After `docker compose up -d` and generating traffic:

- [ ] **Traces** — APM → Services → coffeebrew-backend → Transactions → `POST /orders` → span waterfall visible
- [ ] **DB Spans** — trace contains `pg.query SELECT...` and `pg.query INSERT...` spans
- [ ] **Cache Spans** — trace contains `cache.get inventory:*` spans
- [ ] **External HTTP** — trace contains `POST http://mock-external-api:3002/payments/charge`
- [ ] **Logs** — Observability → Logs → Explorer → filter `service.name: coffeebrew-backend` → entries visible
- [ ] **Trace-Log Correlation** — open any trace → Logs tab → matching entries
- [ ] **Errors** — run `/scenarios/db-error` → APM → Errors → new error with stack trace
- [ ] **Metrics** — APM → coffeebrew-backend → Metrics → Node.js runtime graphs
- [ ] **Service Map** — APM → Service Map → nodes for backend, postgres, redis, payment API

---

## 🛑 Troubleshooting

**No data in Kibana after generating traffic?**
```bash
# Check collector received data
curl http://localhost:8888/metrics | grep otelcol_receiver_accepted

# Check backend is exporting
docker logs coffeebrew-backend | grep OTel
```

**Kibana auth error on fresh start?**

Wait for `setup-es` to complete before Kibana starts — the `kibana_system` password is set by the setup container. Check: `docker logs setup-es`

**`apm-server` stuck waiting?**

APM Server waits for the APM Fleet integration to be installed. Check: `docker logs setup-kibana`

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

Ideas for contributions:
- Additional language SDKs (Python, Go, Java)
- Grafana dashboard alongside Kibana
- Kubernetes deployment (Helm chart)
- More failure scenarios
- Load testing integration

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

## 🙏 Acknowledgements

Built with:
- [OpenTelemetry](https://opentelemetry.io/) — vendor-neutral observability framework
- [Elastic Stack](https://www.elastic.co/) — search and observability platform
- [OTel Collector Contrib](https://github.com/open-telemetry/opentelemetry-collector-contrib) — batteries-included collector

---

<div align="center">

**If this helped you understand observability, please ⭐ star the repo!**

*Built for developers learning distributed tracing and observability.*

</div>
