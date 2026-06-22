'use strict';

const express = require('express');
const pool = require('../db/pool');
const cache = require('../services/cacheService');
const logger = require('../logger');
const { dbQueryDuration } = require('../metrics');

const router = express.Router();

// GET /menu — List all menu items
router.get('/', async (req, res) => {
  try {
    const category = req.query.category;
    const cacheKey = `menu:${category || 'all'}`;

    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const queryStart = Date.now();
    const result = await pool.query(
      category
        ? `SELECT id, name, description, price, category, available, image_url
           FROM menu_items WHERE category = $1 AND available = true ORDER BY name`
        : `SELECT id, name, description, price, category, available, image_url
           FROM menu_items ORDER BY category, name`,
      category ? [category] : []
    );
    dbQueryDuration.record(Date.now() - queryStart, { operation: 'select', table: 'menu_items' });

    await cache.set(cacheKey, result.rows, 300); // Cache menu for 5 minutes

    logger.info('Menu retrieved', { category: category || 'all', count: result.rows.length });
    res.json(result.rows);
  } catch (err) {
    logger.error('Error fetching menu', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /menu/:id — Get a specific menu item
router.get('/:id', async (req, res) => {
  try {
    const cacheKey = `menu:item:${req.params.id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const queryStart = Date.now();
    const result = await pool.query(
      'SELECT * FROM menu_items WHERE id = $1',
      [req.params.id]
    );
    dbQueryDuration.record(Date.now() - queryStart, { operation: 'select', table: 'menu_items' });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    await cache.set(cacheKey, result.rows[0], 300);
    res.json(result.rows[0]);
  } catch (err) {
    logger.error('Error fetching menu item', { id: req.params.id, error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
