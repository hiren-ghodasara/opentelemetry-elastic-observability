'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');
const {
  httpRequestsTotal,
  httpRequestDuration,
  httpActiveRequests,
  httpErrorsTotal,
} = require('../metrics');

/**
 * Request logging + metrics middleware.
 *
 * Adds a unique request ID, records start time, and on response finish:
 * - Logs the completed request with duration
 * - Records HTTP metrics with method/route/status labels
 * - Increments error counter for 4xx/5xx responses
 */
module.exports = function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startTime = Date.now();
  httpActiveRequests.add(1, { method: req.method });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const route = req.route?.path || req.path || 'unknown';
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.add(1, labels);
    httpRequestDuration.record(duration, labels);
    httpActiveRequests.add(-1, { method: req.method });

    if (res.statusCode >= 400) {
      httpErrorsTotal.add(1, {
        method: req.method,
        route,
        status_code: String(res.statusCode),
        error_type: res.statusCode >= 500 ? 'server_error' : 'client_error',
      });
    }

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP request completed', {
      requestId,
      method: req.method,
      path: req.path,
      route,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  });

  next();
};
