'use strict';

const axios = require('axios');
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');
const logger = require('../logger');
const {
  paymentsProcessed,
  paymentsFailed,
  externalApiDuration,
} = require('../metrics');

const EXTERNAL_API_URL =
  process.env.EXTERNAL_API_URL || 'http://mock-external-api:3002';

/**
 * Payment Service
 *
 * Demonstrates:
 * - Outbound HTTP call spans (SpanKind.CLIENT)
 * - Timeout handling and retry logic
 * - Error recording for payment failures
 * - External dependency failure scenarios
 */

async function processPayment({ orderId, amount, customerId, method = 'card' }) {
  const tracer = trace.getTracer('coffeebrew-payment');

  return tracer.startActiveSpan(
    'payment.process',
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'payment.order_id': orderId,
        'payment.amount': amount,
        'payment.customer_id': customerId,
        'payment.method': method,
      },
    },
    async (span) => {
      const startTime = Date.now();
      paymentsProcessed.add(1, { method });

      try {
        logger.info('Processing payment', { orderId, amount, customerId, method });

        // ── Call external payment gateway ────────────────────────────────
        const response = await axios.post(
          `${EXTERNAL_API_URL}/payments/charge`,
          { orderId, amount, customerId, method },
          {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': 'demo-payment-key',
              'X-Request-ID': orderId,
            },
          }
        );

        const duration = Date.now() - startTime;
        externalApiDuration.record(duration, {
          service: 'payment-gateway',
          operation: 'charge',
          status: 'success',
        });

        span.setAttribute('payment.transaction_id', response.data.transactionId);
        span.setAttribute('payment.status', response.data.status);
        span.setAttribute('payment.duration_ms', duration);
        span.setAttribute('http.status_code', response.status);

        logger.info('Payment processed successfully', {
          orderId,
          transactionId: response.data.transactionId,
          duration,
        });

        span.end();
        return {
          success: true,
          transactionId: response.data.transactionId,
          status: response.data.status,
        };
      } catch (err) {
        const duration = Date.now() - startTime;
        const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
        const statusCode = err.response?.status;

        externalApiDuration.record(duration, {
          service: 'payment-gateway',
          operation: 'charge',
          status: 'error',
        });

        paymentsFailed.add(1, {
          method,
          failure_reason: isTimeout ? 'timeout' : statusCode ? `http_${statusCode}` : 'connection_error',
        });

        span.recordException(err);
        span.setAttribute('payment.status', 'failed');
        span.setAttribute('payment.failure_reason', isTimeout ? 'timeout' : err.message);
        span.setAttribute('payment.duration_ms', duration);

        if (isTimeout) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Payment gateway timeout' });
          logger.error('Payment gateway timeout', {
            orderId,
            duration,
            timeout: 5000,
          });
          throw Object.assign(new Error('Payment gateway timeout'), {
            statusCode: 504,
            isTimeout: true,
          });
        }

        if (statusCode === 402) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Insufficient funds' });
          logger.warn('Payment declined — insufficient funds', { orderId, customerId });
          throw Object.assign(new Error('Payment declined: insufficient funds'), {
            statusCode: 402,
            paymentDeclined: true,
          });
        }

        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        logger.error('Payment processing failed', {
          orderId,
          error: err.message,
          statusCode,
          duration,
        });
        throw Object.assign(new Error('Payment processing failed'), {
          statusCode: 502,
          originalError: err.message,
        });
      }
    }
  );
}

module.exports = { processPayment };
