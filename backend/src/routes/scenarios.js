'use strict';

/**
 * Observability Demo Scenarios
 *
 * These endpoints intentionally trigger specific observable behaviors
 * to help developers understand how issues appear in Kibana.
 *
 * Scenario A: /scenarios/healthy    — Normal request, clean trace
 * Scenario B: /scenarios/slow       — Artificial delay, high latency
 * Scenario C: /scenarios/db-error   — Simulated database failure
 * Scenario D: /scenarios/timeout    — External API timeout
 * Scenario E: /scenarios/cascade    — Multiple failures in one trace
 */

const express = require('express');
const { trace, SpanStatusCode, context } = require('@opentelemetry/api');
const pool = require('../db/pool');
const cache = require('../services/cacheService');
const logger = require('../logger');

const router = express.Router();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Scenario A: Healthy request ───────────────────────────────────────────────
router.get('/healthy', async (req, res) => {
  const tracer = trace.getTracer('scenarios');

  return tracer.startActiveSpan('scenario.healthy', async (span) => {
    logger.info('Scenario A: Healthy request started');

    // Auth check
    await tracer.startActiveSpan('authenticate', async (authSpan) => {
      await sleep(5);
      authSpan.setAttribute('auth.result', 'success');
      authSpan.end();
    });

    // Cache lookup
    const cached = await cache.get('scenario:healthy:data');

    // Business logic
    await tracer.startActiveSpan('business.processRequest', async (bizSpan) => {
      bizSpan.setAttribute('business.operation', 'healthy_check');

      // DB query
      await tracer.startActiveSpan('db.query', async (dbSpan) => {
        dbSpan.setAttribute('db.system', 'postgresql');
        dbSpan.setAttribute('db.statement', 'SELECT NOW()');
        const result = await pool.query('SELECT NOW() as server_time');
        dbSpan.setAttribute('db.rows_returned', 1);
        dbSpan.end();
      });

      bizSpan.end();
    });

    if (!cached) {
      await cache.set('scenario:healthy:data', { ok: true }, 10);
    }

    logger.info('Scenario A: Healthy request completed');
    span.setAttribute('scenario', 'healthy');
    span.end();

    res.json({
      scenario: 'A - Healthy Request',
      status: 'success',
      message: 'This request generates a clean, successful trace. Look for it in Kibana APM.',
      traceId: trace.getActiveSpan()?.spanContext().traceId || 'check-response-headers',
      tips: [
        'Open Kibana → Observability → APM → Services → coffeebrew-backend',
        'Find this trace under Transactions → GET /scenarios/healthy',
        'Click the trace to see the full span waterfall',
        'Notice the nested spans: authenticate → business.processRequest → db.query',
      ],
    });
  });
});

// ── Scenario B: Slow request ──────────────────────────────────────────────────
router.get('/slow', async (req, res) => {
  const tracer = trace.getTracer('scenarios');
  const delay = parseInt(req.query.ms) || 3000;

  return tracer.startActiveSpan('scenario.slow', async (span) => {
    span.setAttribute('scenario.requested_delay_ms', delay);
    logger.info('Scenario B: Slow request started', { delayMs: delay });

    await tracer.startActiveSpan('authenticate', async (s) => {
      await sleep(5);
      s.end();
    });

    await tracer.startActiveSpan('business.slowOperation', async (bizSpan) => {
      bizSpan.setAttribute('business.operation', 'slow_processing');

      // Simulate a slow database query
      await tracer.startActiveSpan('db.slowQuery', async (dbSpan) => {
        dbSpan.setAttribute('db.system', 'postgresql');
        dbSpan.setAttribute('db.statement', 'SELECT pg_sleep($1)');
        dbSpan.setAttribute('db.slow_query', true);
        const sleepSeconds = Math.min(delay / 1000, 10);
        await pool.query('SELECT pg_sleep($1)', [sleepSeconds]);
        dbSpan.setAttribute('db.duration_ms', delay);
        dbSpan.end();
      });

      bizSpan.end();
    });

    span.setAttribute('scenario', 'slow');
    span.setAttribute('scenario.actual_delay_ms', delay);
    logger.warn('Scenario B: Slow request completed', { delayMs: delay });
    span.end();

    res.json({
      scenario: 'B - Slow Request',
      status: 'success',
      delayMs: delay,
      message: `This request took ${delay}ms. The slow span will appear highlighted in the trace.`,
      tips: [
        'In Kibana APM, look for this trace in the high-latency transactions',
        'The db.slowQuery span will show as the bottleneck in the waterfall',
        'Use the Latency chart to see how this request affected p99 latency',
        'Try ?ms=5000 for a 5-second delay',
      ],
    });
  });
});

// ── Scenario C: Database error ────────────────────────────────────────────────
router.get('/db-error', async (req, res) => {
  const tracer = trace.getTracer('scenarios');

  return tracer.startActiveSpan('scenario.dbError', async (span) => {
    logger.info('Scenario C: Database error scenario started');

    try {
      await tracer.startActiveSpan('db.failingQuery', async (dbSpan) => {
        dbSpan.setAttribute('db.system', 'postgresql');
        dbSpan.setAttribute('db.statement', 'SELECT * FROM nonexistent_table_xyz');

        try {
          await pool.query('SELECT * FROM nonexistent_table_xyz');
          dbSpan.end();
        } catch (dbErr) {
          dbSpan.recordException(dbErr);
          dbSpan.setStatus({ code: SpanStatusCode.ERROR, message: dbErr.message });
          dbSpan.setAttribute('db.error.code', dbErr.code);
          dbSpan.end();
          throw dbErr;
        }
      });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.setAttribute('scenario', 'db_error');
      span.end();

      logger.error('Scenario C: Database error occurred', {
        error: err.message,
        code: err.code,
      });

      return res.status(500).json({
        scenario: 'C - Database Error',
        status: 'error',
        error: err.message,
        tips: [
          'In Kibana APM, this transaction appears with ERROR status (red)',
          'Click into the trace to see the failed db.failingQuery span',
          'The exception details are captured on the span',
          'Check APM → Errors to see this error aggregated with stack trace',
          'Correlate to logs: the error was logged with the same trace.id',
        ],
      });
    }
  });
});

// ── Scenario D: External API timeout ─────────────────────────────────────────
router.get('/timeout', async (req, res) => {
  const axios = require('axios');
  const tracer = trace.getTracer('scenarios');
  const timeoutMs = parseInt(req.query.ms) || 1500;

  return tracer.startActiveSpan('scenario.timeout', async (span) => {
    logger.info('Scenario D: Timeout scenario started', { timeoutMs });

    try {
      await tracer.startActiveSpan('external.api.call', async (extSpan) => {
        extSpan.setAttribute('http.method', 'GET');
        extSpan.setAttribute('peer.service', 'mock-external-api');
        extSpan.setAttribute('external.timeout_ms', timeoutMs);

        try {
          await axios.get(
            `${process.env.EXTERNAL_API_URL || 'http://mock-external-api:3002'}/slow?delay=${timeoutMs + 500}`,
            { timeout: timeoutMs }
          );
          extSpan.end();
        } catch (err) {
          extSpan.recordException(err);
          extSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'External API timeout' });
          extSpan.setAttribute('error.type', 'timeout');
          extSpan.end();
          throw err;
        }
      });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.setAttribute('scenario', 'timeout');
      span.end();

      logger.error('Scenario D: External API timeout', {
        timeoutMs,
        error: err.message,
      });

      return res.status(504).json({
        scenario: 'D - External API Timeout',
        status: 'timeout',
        timeoutMs,
        tips: [
          'The trace shows the external.api.call span failed with a timeout',
          'Kibana APM will show this under the error traces for this service',
          'The span duration equals the timeout threshold (not the server delay)',
          'In real systems, combine with a retry → look for repeated spans',
        ],
      });
    }
  });
});

// ── Scenario E: Cascading failures ───────────────────────────────────────────
router.get('/cascade', async (req, res) => {
  const tracer = trace.getTracer('scenarios');

  return tracer.startActiveSpan('scenario.cascade', async (rootSpan) => {
    logger.warn('Scenario E: Cascade failure started — this will generate multiple errors');

    const errors = [];

    // Try cache (succeeds)
    await cache.get('some:key').catch((err) => errors.push({ step: 'cache', error: err.message }));

    // Try bad DB query (fails)
    await tracer.startActiveSpan('db.query1', async (s) => {
      try {
        await pool.query('SELECT * FROM does_not_exist');
        s.end();
      } catch (err) {
        errors.push({ step: 'db.query1', error: err.message });
        s.recordException(err);
        s.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        s.end();
      }
    });

    // Continue despite error — try another operation (also fails)
    await tracer.startActiveSpan('db.query2', async (s) => {
      try {
        await pool.query('SELECT * FROM also_does_not_exist');
        s.end();
      } catch (err) {
        errors.push({ step: 'db.query2', error: err.message });
        s.recordException(err);
        s.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        s.end();
      }
    });

    // Final aggregation
    rootSpan.setAttribute('scenario', 'cascade');
    rootSpan.setAttribute('scenario.error_count', errors.length);
    rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: `${errors.length} operations failed` });
    rootSpan.end();

    logger.error('Scenario E: Cascade complete with errors', { errorCount: errors.length, errors });

    res.status(500).json({
      scenario: 'E - Cascading Failures',
      status: 'error',
      errorCount: errors.length,
      errors,
      tips: [
        'This trace has multiple failed child spans',
        'In the Kibana waterfall, multiple spans will appear in red',
        'APM Error view will show these as distinct error events',
        'Notice how the parent span status rolls up from children',
      ],
    });
  });
});

module.exports = router;
