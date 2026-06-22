-- CoffeeBrew Database Schema
-- Automatically run by PostgreSQL on first startup

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Menu Items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL,  -- price in cents
  category    VARCHAR(50) NOT NULL,
  available   BOOLEAN DEFAULT true,
  image_url   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Inventory ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id        SERIAL PRIMARY KEY,
  item_id   UUID NOT NULL REFERENCES menu_items(id),
  name      VARCHAR(100) NOT NULL,
  quantity  INTEGER NOT NULL DEFAULT 0,
  reserved  INTEGER NOT NULL DEFAULT 0,
  unit      VARCHAR(20) DEFAULT 'units',
  UNIQUE(item_id)
);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  VARCHAR(100) NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_cents              INTEGER NOT NULL,
  notes                    TEXT,
  payment_transaction_id   VARCHAR(100),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at             TIMESTAMPTZ,
  CONSTRAINT status_check CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'failed'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id               SERIAL PRIMARY KEY,
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id     UUID NOT NULL,
  name             VARCHAR(100) NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  customization    TEXT
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_user_id    ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item    ON inventory(item_id);

-- ── Seed Data ─────────────────────────────────────────────────────────────────
INSERT INTO menu_items (id, name, description, price, category, available) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Espresso',          'Single shot of rich espresso',                    250,  'coffee',    true),
  ('a0000001-0000-0000-0000-000000000002', 'Americano',         'Espresso with hot water',                         350,  'coffee',    true),
  ('a0000001-0000-0000-0000-000000000003', 'Cappuccino',        'Espresso with steamed milk and foam',             450,  'coffee',    true),
  ('a0000001-0000-0000-0000-000000000004', 'Flat White',        'Double ristretto with microfoam',                 500,  'coffee',    true),
  ('a0000001-0000-0000-0000-000000000005', 'Caramel Latte',     'Espresso, steamed milk, caramel syrup',           550,  'coffee',    true),
  ('a0000001-0000-0000-0000-000000000006', 'Cold Brew',         '12-hour cold steeped coffee',                     600,  'coffee',    true),
  ('a0000001-0000-0000-0000-000000000007', 'Green Tea',         'Premium matcha green tea',                        400,  'tea',       true),
  ('a0000001-0000-0000-0000-000000000008', 'Chai Latte',        'Spiced chai with steamed oat milk',               500,  'tea',       true),
  ('a0000001-0000-0000-0000-000000000009', 'Croissant',         'Buttery, flaky croissant',                        450,  'pastry',    true),
  ('a0000001-0000-0000-0000-000000000010', 'Blueberry Muffin',  'Fresh baked blueberry muffin',                    400,  'pastry',    true),
  ('a0000001-0000-0000-0000-000000000011', 'Avocado Toast',     'Sourdough, avocado, poached egg, chilli flakes',  950,  'food',      true),
  ('a0000001-0000-0000-0000-000000000012', 'Banana Bread',      'House-made banana bread, lightly toasted',        500,  'pastry',    false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (item_id, name, quantity, reserved) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Espresso',         1000, 0),
  ('a0000001-0000-0000-0000-000000000002', 'Americano',        1000, 0),
  ('a0000001-0000-0000-0000-000000000003', 'Cappuccino',       1000, 0),
  ('a0000001-0000-0000-0000-000000000004', 'Flat White',       1000, 0),
  ('a0000001-0000-0000-0000-000000000005', 'Caramel Latte',    1000, 0),
  ('a0000001-0000-0000-0000-000000000006', 'Cold Brew',           5, 0),  -- intentionally low stock
  ('a0000001-0000-0000-0000-000000000007', 'Green Tea',         500, 0),
  ('a0000001-0000-0000-0000-000000000008', 'Chai Latte',        500, 0),
  ('a0000001-0000-0000-0000-000000000009', 'Croissant',          20, 0),
  ('a0000001-0000-0000-0000-000000000010', 'Blueberry Muffin',   15, 0),
  ('a0000001-0000-0000-0000-000000000011', 'Avocado Toast',      50, 0),
  ('a0000001-0000-0000-0000-000000000012', 'Banana Bread',        0, 0)
ON CONFLICT (item_id) DO NOTHING;
