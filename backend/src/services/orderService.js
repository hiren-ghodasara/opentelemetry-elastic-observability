'use strict';

const { trace, SpanStatusCode } = require('@opentelemetry/api');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const cache = require('./cacheService');
const inventory = require('./inventoryService');
const payment = require('./paymentService');
const logger = require('../logger');
const {
  ordersCreated,
  orderValueTotal,
  orderProcessingDuration,
  dbQueryDuration,
} = require('../metrics');

/**
 * Order Service — Core Business Logic
 *
 * This is the heart of the demo. A single createOrder() call produces
 * a rich trace tree:
 *
 * POST /orders
 * ├── authenticate
 * ├── validate order
 * ├── order.create
 * │   ├── inventory.checkAvailability  (× N items)
 * │   │   ├── cache.get
 * │   │   └── SELECT inventory  (on cache miss)
 * │   ├── INSERT orders
 * │   ├── INSERT order_items  (× N items)
 * │   ├── inventory.reserveItems
 * │   │   └── UPDATE inventory  (× N items, in TX)
 * │   └── payment.process
 * │       └── HTTP POST /payments/charge  → mock-external-api
 * └── cache.del (order list invalidation)
 */

async function createOrder({ userId, items, notes }) {
  const tracer = trace.getTracer('coffeebrew-orders');
  const startTime = Date.now();

  return tracer.startActiveSpan('order.create', async (span) => {
    const orderId = uuidv4();
    span.setAttribute('order.id', orderId);
    span.setAttribute('order.user_id', userId);
    span.setAttribute('order.item_count', items.length);

    try {
      logger.info('Creating order', { orderId, userId, itemCount: items.length });

      // ── 1. Validate items against menu ────────────────────────────────────
      await tracer.startActiveSpan('order.validateItems', async (validateSpan) => {
        validateSpan.setAttribute('order.item_count', items.length);

        const queryStart = Date.now();
        const menuItemIds = items.map((i) => i.menuItemId);
        const result = await pool.query(
          `SELECT id, name, price, available FROM menu_items WHERE id = ANY($1)`,
          [menuItemIds]
        );
        dbQueryDuration.record(Date.now() - queryStart, {
          operation: 'select',
          table: 'menu_items',
        });

        const foundIds = new Set(result.rows.map((r) => r.id));
        const missingIds = menuItemIds.filter((id) => !foundIds.has(id));

        if (missingIds.length > 0) {
          const err = Object.assign(
            new Error(`Menu items not found: ${missingIds.join(', ')}`),
            { statusCode: 400 }
          );
          validateSpan.recordException(err);
          validateSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          validateSpan.end();
          throw err;
        }

        const unavailable = result.rows.filter((r) => !r.available);
        if (unavailable.length > 0) {
          const err = Object.assign(
            new Error(`Items not available: ${unavailable.map((r) => r.name).join(', ')}`),
            { statusCode: 422 }
          );
          validateSpan.recordException(err);
          validateSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          validateSpan.end();
          throw err;
        }

        // Enrich items with current prices from DB
        items.forEach((item) => {
          const menuItem = result.rows.find((r) => r.id === item.menuItemId);
          item.name = menuItem.name;
          item.unitPrice = menuItem.price;
        });

        validateSpan.setAttribute('order.validation', 'passed');
        validateSpan.end();
      });

      // ── 2. Check inventory for all items in parallel ──────────────────────
      await tracer.startActiveSpan('order.checkInventory', async (invSpan) => {
        const checks = await Promise.all(
          items.map((item) =>
            inventory.checkAvailability(item.menuItemId, item.quantity)
          )
        );

        const unavailable = checks.filter((c) => !c.canFulfill);
        if (unavailable.length > 0) {
          const err = Object.assign(
            new Error('Some items are out of stock'),
            { statusCode: 422 }
          );
          invSpan.recordException(err);
          invSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          invSpan.end();
          throw err;
        }

        invSpan.setAttribute('inventory.all_available', true);
        invSpan.end();
      });

      // ── 3. Calculate total ────────────────────────────────────────────────
      const totalCents = items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
      );
      span.setAttribute('order.total_cents', totalCents);

      // ── 4. Insert order into database ─────────────────────────────────────
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const queryStart = Date.now();
        const orderResult = await client.query(
          `INSERT INTO orders (id, user_id, status, total_cents, notes, created_at)
           VALUES ($1, $2, 'pending', $3, $4, NOW())
           RETURNING id, status, created_at`,
          [orderId, userId, totalCents, notes || null]
        );
        dbQueryDuration.record(Date.now() - queryStart, {
          operation: 'insert',
          table: 'orders',
        });

        // Insert order items
        for (const item of items) {
          const itemStart = Date.now();
          await client.query(
            `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price_cents, name)
             VALUES ($1, $2, $3, $4, $5)`,
            [orderId, item.menuItemId, item.quantity, item.unitPrice, item.name]
          );
          dbQueryDuration.record(Date.now() - itemStart, {
            operation: 'insert',
            table: 'order_items',
          });
        }

        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        throw dbErr;
      } finally {
        client.release();
      }

      // ── 5. Reserve inventory ──────────────────────────────────────────────
      await inventory.reserveItems(orderId, items);

      // ── 6. Process payment ────────────────────────────────────────────────
      const paymentResult = await payment.processPayment({
        orderId,
        amount: totalCents,
        customerId: userId,
        method: 'card',
      });

      // ── 7. Update order status to confirmed ───────────────────────────────
      const updateStart = Date.now();
      await pool.query(
        `UPDATE orders SET status = 'confirmed', payment_transaction_id = $1, confirmed_at = NOW()
         WHERE id = $2`,
        [paymentResult.transactionId, orderId]
      );
      dbQueryDuration.record(Date.now() - updateStart, {
        operation: 'update',
        table: 'orders',
      });

      // ── 8. Invalidate caches ───────────────────────────────────────────────
      await cache.del(`orders:user:${userId}`);

      // ── 9. Record business metrics ────────────────────────────────────────
      const processingTime = Date.now() - startTime;
      ordersCreated.add(1, { status: 'success' });
      orderValueTotal.add(totalCents, { payment_method: 'card' });
      orderProcessingDuration.record(processingTime, { status: 'success' });

      span.setAttribute('order.status', 'confirmed');
      span.setAttribute('order.processing_ms', processingTime);
      span.setAttribute('order.transaction_id', paymentResult.transactionId);

      logger.info('Order created and confirmed', {
        orderId,
        userId,
        totalCents,
        transactionId: paymentResult.transactionId,
        processingTime,
        itemCount: items.length,
      });

      span.end();
      return {
        orderId,
        status: 'confirmed',
        totalCents,
        transactionId: paymentResult.transactionId,
        items,
        createdAt: new Date().toISOString(),
      };
    } catch (err) {
      const processingTime = Date.now() - startTime;
      ordersCreated.add(1, { status: 'failed' });
      orderProcessingDuration.record(processingTime, { status: 'failed' });

      if (!err.statusCode || err.statusCode >= 500) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        logger.error('Order creation failed', {
          orderId,
          userId,
          error: err.message,
          processingTime,
        });
      }

      span.end();
      throw err;
    }
  });
}

async function getOrder(orderId) {
  const tracer = trace.getTracer('coffeebrew-orders');

  return tracer.startActiveSpan('order.get', async (span) => {
    span.setAttribute('order.id', orderId);

    try {
      // Check cache
      const cacheKey = `order:${orderId}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        span.setAttribute('order.from_cache', true);
        span.end();
        return cached;
      }

      const queryStart = Date.now();
      const result = await pool.query(
        `SELECT o.id, o.user_id, o.status, o.total_cents, o.notes,
                o.created_at, o.confirmed_at, o.payment_transaction_id,
                json_agg(json_build_object(
                  'menuItemId', oi.menu_item_id,
                  'name', oi.name,
                  'quantity', oi.quantity,
                  'unitPriceCents', oi.unit_price_cents
                )) as items
         FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.id = $1
         GROUP BY o.id`,
        [orderId]
      );
      dbQueryDuration.record(Date.now() - queryStart, {
        operation: 'select',
        table: 'orders',
      });

      if (result.rows.length === 0) {
        span.setAttribute('order.found', false);
        span.end();
        return null;
      }

      const order = result.rows[0];
      await cache.set(cacheKey, order, 120);

      span.setAttribute('order.found', true);
      span.setAttribute('order.status', order.status);
      span.end();
      return order;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.end();
      throw err;
    }
  });
}

async function getUserOrders(userId, limit = 20) {
  const cacheKey = `orders:user:${userId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const queryStart = Date.now();
  const result = await pool.query(
    `SELECT o.id, o.status, o.total_cents, o.created_at, o.confirmed_at,
            COUNT(oi.id)::int as item_count
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  dbQueryDuration.record(Date.now() - queryStart, {
    operation: 'select',
    table: 'orders',
  });

  await cache.set(cacheKey, result.rows, 30);
  return result.rows;
}

module.exports = { createOrder, getOrder, getUserOrders };
