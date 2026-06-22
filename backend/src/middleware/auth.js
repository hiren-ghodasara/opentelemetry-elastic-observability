'use strict';

const { trace, SpanStatusCode } = require('@opentelemetry/api');
const logger = require('../logger');

/**
 * Simulated authentication middleware.
 *
 * Demonstrates:
 * - Creating a child span for authentication logic
 * - Recording auth failures as span errors
 * - Adding user context to the active span
 *
 * Token format: "Bearer demo-user-{userId}"
 * Special tokens: "Bearer demo-user-fail" triggers auth failure
 */
module.exports = function authenticate(req, res, next) {
  const tracer = trace.getTracer('coffeebrew-auth');
  const parentSpan = trace.getActiveSpan();

  tracer.startActiveSpan('authenticate', (span) => {
    try {
      const authHeader = req.headers.authorization;

      span.setAttribute('auth.method', 'bearer_token');
      span.setAttribute('auth.header_present', !!authHeader);

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Allow unauthenticated requests to public endpoints
        req.user = { id: 'anonymous', role: 'guest' };
        span.setAttribute('auth.result', 'anonymous');
        span.end();
        return next();
      }

      const token = authHeader.substring(7);

      // Simulate token validation failure
      if (token === 'demo-user-fail' || token === 'invalid') {
        span.setAttribute('auth.result', 'failed');
        span.setAttribute('auth.failure_reason', 'invalid_token');
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid token' });

        logger.warn('Authentication failed', {
          reason: 'invalid_token',
          token: token.substring(0, 10) + '***',
        });

        span.end();
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        });
      }

      // Extract user from demo token
      const userId = token.replace('demo-user-', '');
      req.user = {
        id: userId || 'user-1',
        role: userId === 'admin' ? 'admin' : 'customer',
        name: `Demo User ${userId}`,
      };

      span.setAttribute('auth.result', 'success');
      span.setAttribute('user.id', req.user.id);
      span.setAttribute('user.role', req.user.role);

      // Propagate user to parent span so it appears on the transaction
      if (parentSpan) {
        parentSpan.setAttribute('user.id', req.user.id);
        parentSpan.setAttribute('user.role', req.user.role);
      }

      logger.debug('Authentication successful', {
        userId: req.user.id,
        role: req.user.role,
      });

      span.end();
      next();
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      next(err);
    }
  });
};
