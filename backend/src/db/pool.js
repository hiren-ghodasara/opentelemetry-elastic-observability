'use strict';

const { Pool } = require('pg');
const logger = require('../logger');
const { setActiveDbConnections } = require('../metrics');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  setActiveDbConnections(pool.totalCount);
  logger.debug('New database connection established', {
    totalConnections: pool.totalCount,
  });
});

pool.on('remove', () => {
  setActiveDbConnections(pool.totalCount);
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

module.exports = pool;
