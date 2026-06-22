'use strict';

/**
 * Mock External Payment Gateway API
 *
 * Simulates a third-party payment service with:
 * - Normal successful responses
 * - Random slow responses (p95 ~ 800ms, occasional 2s+)
 * - Simulated payment failures (5% decline rate)
 * - Timeout endpoint for Scenario D
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulate realistic latency distribution
function getRealisticLatency() {
  const rand = Math.random();
  if (rand < 0.6) return 50 + Math.random() * 150;   // 60%: 50-200ms (fast)
  if (rand < 0.85) return 200 + Math.random() * 400;  // 25%: 200-600ms (normal)
  if (rand < 0.95) return 600 + Math.random() * 600;  // 10%: 600-1200ms (slow)
  return 1200 + Math.random() * 1000;                  //  5%: 1.2-2.2s (very slow)
}

// POST /payments/charge — Process a payment
app.post('/payments/charge', async (req, res) => {
  const { orderId, amount, customerId, method } = req.body;
  const latency = getRealisticLatency();

  await sleep(latency);

  // 5% random decline
  if (Math.random() < 0.05) {
    return res.status(402).json({
      status: 'declined',
      reason: 'insufficient_funds',
      orderId,
    });
  }

  // 2% random gateway error
  if (Math.random() < 0.02) {
    return res.status(503).json({
      status: 'error',
      reason: 'gateway_unavailable',
    });
  }

  res.json({
    transactionId: `txn_${uuidv4().replace(/-/g, '').substring(0, 16)}`,
    status: 'approved',
    amount,
    currency: 'USD',
    orderId,
    processedAt: new Date().toISOString(),
    processingTimeMs: Math.round(latency),
  });
});

// GET /slow — Intentionally slow endpoint for timeout demo
app.get('/slow', async (req, res) => {
  const delay = parseInt(req.query.delay) || 5000;
  await sleep(delay);
  res.json({ status: 'ok', delayed: delay });
});

// GET /health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock external API listening on port ${PORT}`);
});
