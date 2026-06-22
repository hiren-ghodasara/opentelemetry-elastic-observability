'use strict';

const { trace, SpanStatusCode } = require('@opentelemetry/api');
const pool = require('../db/pool');
const cache = require('./cacheService');
const logger = require('../logger');
const { inventoryChecks, dbQueryDuration } = require('../metrics');

/**
 * Inventory Service
 *
 * Demonstrates:
 * - Custom span creation around business logic
 * - Cache-aside pattern (check cache → miss → query DB → populate cache)
 * - Structured logging with business context
 * - Metric recording for business events
 */

async function checkAvailability(itemId, requestedQuantity) {
  const tracer = trace.getTracer('coffeebrew-inventory');

  return tracer.startActiveSpan('inventory.checkAvailability', async (span) => {
    span.setAttribute('inventory.item_id', itemId);
    span.setAttribute('inventory.requested_quantity', requestedQuantity);

    inventoryChecks.add(1, { item_id: itemId });

    try {
      logger.info('Checking inventory availability', {
        itemId,
        requestedQuantity,
      });

      // ── 1. Check cache first ─────────────────────────────────────────────
      const cacheKey = `inventory:${itemId}`;
      let inventory = await cache.get(cacheKey);

      if (!inventory) {
        // ── 2. Cache miss — query database ───────────────────────────────
        const queryStart = Date.now();
        const result = await pool.query(
          'SELECT id, name, quantity, reserved FROM inventory WHERE item_id = $1',
          [itemId]
        );
        const queryDuration = Date.now() - queryStart;

        dbQueryDuration.record(queryDuration, { operation: 'select', table: 'inventory' });

        if (result.rows.length === 0) {
          span.setAttribute('inventory.found', false);
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Item not found' });
          span.end();

          logger.warn('Inventory item not found', { itemId });
          throw Object.assign(new Error(`Item ${itemId} not found in inventory`), {
            statusCode: 404,
          });
        }

        inventory = result.rows[0];
        await cache.set(cacheKey, inventory, 30); // Cache for 30 seconds
      }

      const available = inventory.quantity - (inventory.reserved || 0);
      const canFulfill = available >= requestedQuantity;

      span.setAttribute('inventory.available', available);
      span.setAttribute('inventory.can_fulfill', canFulfill);
      span.setAttribute('inventory.found', true);

      logger.info('Inventory check complete', {
        itemId,
        available,
        requestedQuantity,
        canFulfill,
      });

      span.end();
      return { available, canFulfill, inventory };
    } catch (err) {
      if (!err.statusCode) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        logger.error('Inventory check failed', { itemId, error: err.message });
      }
      span.end();
      throw err;
    }
  });
}

async function reserveItems(orderId, items) {
  const tracer = trace.getTracer('coffeebrew-inventory');

  return tracer.startActiveSpan('inventory.reserveItems', async (span) => {
    span.setAttribute('inventory.order_id', orderId);
    span.setAttribute('inventory.item_count', items.length);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of items) {
        const queryStart = Date.now();
        await client.query(
          `UPDATE inventory
           SET reserved = reserved + $1
           WHERE item_id = $2 AND quantity - reserved >= $1`,
          [item.quantity, item.menuItemId]
        );
        dbQueryDuration.record(Date.now() - queryStart, {
          operation: 'update',
          table: 'inventory',
        });

        // Invalidate cache after update
        await cache.del(`inventory:${item.menuItemId}`);
      }

      await client.query('COMMIT');
      logger.info('Inventory reserved for order', { orderId, itemCount: items.length });
      span.end();
    } catch (err) {
      await client.query('ROLLBACK');
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      logger.error('Failed to reserve inventory', { orderId, error: err.message });
      span.end();
      throw err;
    } finally {
      client.release();
    }
  });
}

module.exports = { checkAvailability, reserveItems };
