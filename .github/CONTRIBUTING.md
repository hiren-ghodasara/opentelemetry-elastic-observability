# Contributing

Thank you for considering a contribution! This project welcomes PRs, issues, and ideas.

## Ways to contribute

- **Bug reports** — open an issue with the error output and `docker compose ps` output
- **New scenarios** — add to `backend/src/routes/scenarios.js`
- **Additional language** — add a Python/Go/Java service alongside the Node.js backend
- **Documentation** — improve `docs/FLOW.md` or add new guides
- **Dashboards** — add pre-built Kibana dashboard exports

## Development setup

```bash
git clone https://github.com/YOUR_USERNAME/opentelemetry-elastic-observability.git
cd opentelemetry-elastic-observability
docker compose up -d
```

Backend hot-reload (without Docker):
```bash
cd backend
npm install
NODE_ENV=development \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 \
  DATABASE_URL=postgresql://coffeebrew:coffeebrew123@localhost:5432/coffeebrew \
  REDIS_URL=redis://localhost:6379 \
  npm run dev
```

## Pull Request checklist

- [ ] `docker compose up -d` starts cleanly from scratch
- [ ] New scenarios have a comment explaining what they demonstrate
- [ ] README updated if new services or ports are added
- [ ] No secrets or personal data committed
