'use strict';

const express = require('express');
const { trace, SpanStatusCode } = require('@opentelemetry/api');
const auth = require('../middleware/auth');
const orderService = require('../services/orderService');
const logger = require('../logger');

const router = express.Router();

// POST /orders — Create a new order
router.post('/', auth, async (req, res) => {
  const span = trace.getActiveSpan();

  try {
    const { items, notes } = req.body;

    // Basic validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      logger.warn('Order validation failed — empty items', { userId: req.user?.id });
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Order must contain at least one item',
        field: 'items',
      });
    }

    for (const item of items) {
      if (!item.menuItemId || !item.quantity || item.quantity < 1) {
        logger.warn('Order validation failed — invalid item', {
          userId: req.user?.id,
          item,
        });
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Each item requires menuItemId and quantity >= 1',
        });
      }
    }

    const order = await orderService.createOrder({
      userId: req.user?.id || 'anonymous',
      items,
      notes,
    });

    res.status(201).json(order);
  } catch (err) {
    if (err.statusCode && err.statusCode < 500) {
      return res.status(err.statusCode).json({
        error: err.message,
        ...(err.paymentDeclined && { code: 'PAYMENT_DECLINED' }),
        ...(err.isTimeout && { code: 'GATEWAY_TIMEOUT' }),
      });
    }

    logger.error('Unhandled error in POST /orders', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /orders/:id — Get a specific order
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await orderService.getOrder(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (err) {
    logger.error('Error fetching order', { orderId: req.params.id, error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /orders/user/:userId — Get orders for a user
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const orders = await orderService.getUserOrders(req.params.userId);
    res.json(orders);
  } catch (err) {
    logger.error('Error fetching user orders', { userId: req.params.userId, error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
