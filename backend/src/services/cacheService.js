'use strict';

const Redis = require('ioredis');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const logger = require('../logger');
const { cacheHits, cacheMisses } = require('../metrics');

let redis;

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });

    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
  }
  return redis;
}

async function get(key) {
  const tracer = trace.getTracer('coffeebrew-cache');
  return tracer.startActiveSpan(`cache.get ${key}`, async (span) => {
    span.setAttribute('cache.operation', 'get');
    span.setAttribute('cache.key', key);
    span.setAttribute('db.system', 'redis');

    try {
      const value = await getRedis().get(key);
      const hit = value !== null;

      span.setAttribute('cache.hit', hit);

      if (hit) {
        cacheHits.add(1, { operation: 'get' });
        logger.debug('Cache hit', { key });
      } else {
        cacheMisses.add(1, { operation: 'get' });
        logger.debug('Cache miss', { key });
      }

      span.end();
      return hit ? JSON.parse(value) : null;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      logger.warn('Cache get failed, continuing without cache', { key, error: err.message });
      return null;
    }
  });
}

async function set(key, value, ttlSeconds = 60) {
  const tracer = trace.getTracer('coffeebrew-cache');
  return tracer.startActiveSpan(`cache.set ${key}`, async (span) => {
    span.setAttribute('cache.operation', 'set');
    span.setAttribute('cache.key', key);
    span.setAttribute('cache.ttl', ttlSeconds);
    span.setAttribute('db.system', 'redis');

    try {
      await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
      logger.debug('Cache set', { key, ttl: ttlSeconds });
      span.end();
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      logger.warn('Cache set failed, continuing without cache', { key, error: err.message });
    }
  });
}

async function del(key) {
  try {
    await getRedis().del(key);
    logger.debug('Cache invalidated', { key });
  } catch (err) {
    logger.warn('Cache delete failed', { key, error: err.message });
  }
}

module.exports = { get, set, del };
