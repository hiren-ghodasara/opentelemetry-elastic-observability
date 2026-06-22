'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const requestLogger = require('./middleware/requestLogger');
const logger = require('./logger');

const ordersRouter = require('./routes/orders');
const menuRouter = require('./routes/menu');
const scenariosRouter = require('./routes/scenarios');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security & parsing middleware ─────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Observability middleware ───────────────────────────────────────────────────
app.use(requestLogger);

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'coffeebrew-backend', timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    const pool = require('./db/pool');
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', error: err.message });
  }
});

app.use('/menu', menuRouter);
app.use('/orders', ordersRouter);
app.use('/scenarios', scenariosRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({ error: 'Internal Server Error' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  logger.info('CoffeeBrew backend started', {
    port: PORT,
    environment: process.env.NODE_ENV,
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
});

module.exports = app;
