-- Orders placed through the website. Stripe is the source of truth for payment; this row is the order.
-- status: pending (created, not paid) | processing (payment confirming) | paid | failed.
-- pos_order_id is the order number in the restaurant's POS once the paid order has been sent there.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  lines TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  fulfilment TEXT NOT NULL,
  contact TEXT NOT NULL,
  kitchen_note TEXT,
  payment_intent_id TEXT UNIQUE,
  payment_error TEXT,
  pos_order_id TEXT,
  pos_error TEXT,
  pos_attempts INTEGER NOT NULL DEFAULT 0,
  pos_attempted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE INDEX orders_status ON orders (status, created_at);
