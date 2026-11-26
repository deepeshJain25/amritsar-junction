// Order records in D1, what happens when one is paid (it goes to the POS), and the public view of an order.
import { formatAddress, type OrderView, type PricedOrder } from '../src/lib/order/api';
import type { Env } from './env';
import { checkout } from './pos';

export interface OrderRow {
  id: string;
  cart_id: string;
  status: 'pending' | 'processing' | 'paid' | 'failed';
  lines: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  fulfilment: string;
  contact: string;
  kitchen_note: string | null;
  payment_intent_id: string | null;
  payment_client_secret: string | null;
  payment_error: string | null;
  pos_order_id: string | null;
  pos_error: string | null;
  pos_attempts: number;
  pos_attempted_at: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

const MAX_POS_ATTEMPTS = 3;
const now = () => new Date().toISOString();

/** "aj-" and 8 random letters and digits: short enough to read out, too many to guess. */
export function newOrderId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `aj-${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
}

export const getOrder = (env: Env, id: string) => env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderRow>();
export const getOrderByCart = (env: Env, cartId: string) => env.DB.prepare('SELECT * FROM orders WHERE cart_id = ?').bind(cartId).first<OrderRow>();
export const getOrderByIntent = (env: Env, pi: string) => env.DB.prepare('SELECT * FROM orders WHERE payment_intent_id = ?').bind(pi).first<OrderRow>();

/** Creates the order for a cart, or updates it when the customer changes something and tries again. */
export async function saveOrder(env: Env, cartId: string, existing: OrderRow | null, o: PricedOrder): Promise<OrderRow> {
  const id = existing?.id ?? newOrderId();
  const t = now();
  const values = [JSON.stringify(o.lines), o.subtotal, o.deliveryFee, o.total, JSON.stringify(o.fulfilment), JSON.stringify(o.contact), o.kitchenNote ?? null];
  if (existing) {
    await env.DB.prepare(
      `UPDATE orders SET lines = ?, subtotal = ?, delivery_fee = ?, total = ?, fulfilment = ?, contact = ?, kitchen_note = ?,
       status = 'pending', payment_error = NULL, updated_at = ? WHERE id = ? AND status IN ('pending', 'failed')`,
    ).bind(...values, t, id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO orders (id, cart_id, lines, subtotal, delivery_fee, total, fulfilment, contact, kitchen_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, cartId, ...values, t, t).run();
  }
  return (await getOrder(env, id))!;
}

/** Records the POS's PaymentIntent and its amount, which is what the card is charged. */
export const setIntent = (env: Env, id: string, pi: { id: string; clientSecret: string; total: number }) =>
  env.DB.prepare('UPDATE orders SET payment_intent_id = ?, payment_client_secret = ?, total = ?, delivery_fee = MAX(0, ? - subtotal), updated_at = ? WHERE id = ?')
    .bind(pi.id, pi.clientSecret, pi.total, pi.total, now(), id)
    .run();

export const markProcessing = (env: Env, id: string) =>
  env.DB.prepare("UPDATE orders SET status = 'processing', updated_at = ? WHERE id = ? AND status IN ('pending', 'failed')").bind(now(), id).run();

export const markFailed = (env: Env, id: string, message: string) =>
  env.DB.prepare("UPDATE orders SET status = 'failed', payment_error = ?, updated_at = ? WHERE id = ? AND status IN ('pending', 'processing')").bind(message, now(), id).run();

/** Records the payment once (webhook and page reconciliation can both arrive) and then sends the order to the kitchen. */
export async function markPaid(env: Env, id: string): Promise<boolean> {
  const t = now();
  const res = await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?, payment_error = NULL, updated_at = ? WHERE id = ? AND status != 'paid'").bind(t, t, id).run();
  return res.meta.changes > 0;
}

/**
 * Places a paid order in the POS (payment_method STRIPE, with its PaymentIntent), which prints the kitchen docket.
 * Claims the attempt in the database first, so a page refresh and another tab arriving together never send it twice.
 * Retries wait 10 seconds. Mock payments never reach the POS.
 */
export async function forwardToPos(env: Env, id: string): Promise<void> {
  const t = now();
  const retryAfter = new Date(Date.now() - 10_000).toISOString();
  const claim = await env.DB.prepare(
    `UPDATE orders SET pos_attempts = pos_attempts + 1, pos_attempted_at = ?, updated_at = ?
     WHERE id = ? AND status = 'paid' AND pos_order_id IS NULL AND pos_attempts < ? AND (pos_attempted_at IS NULL OR pos_attempted_at < ?)`,
  ).bind(t, t, id, MAX_POS_ATTEMPTS, retryAfter).run();
  if (!claim.meta.changes) return;

  const order = (await getOrder(env, id))!;
  if (!order.payment_intent_id) {
    await env.DB.prepare("UPDATE orders SET pos_order_id = 'not-sent', updated_at = ? WHERE id = ?").bind(now(), id).run();
    return;
  }
  try {
    const posId = await checkout(env, order);
    await env.DB.prepare('UPDATE orders SET pos_order_id = ?, pos_error = NULL, updated_at = ? WHERE id = ?').bind(String(posId), now(), id).run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`POS checkout failed for paid order ${id} (attempt ${order.pos_attempts}): ${message}`);
    await env.DB.prepare('UPDATE orders SET pos_error = ?, updated_at = ? WHERE id = ?').bind(message.slice(0, 500), now(), id).run();
  }
}

/** What the customer sees. A paid order is "waiting" until the kitchen has it, then "success". */
export function toView(o: OrderRow): OrderView {
  const contact = JSON.parse(o.contact) as PricedOrder['contact'];
  const fulfilment = JSON.parse(o.fulfilment) as PricedOrder['fulfilment'];
  const lines = JSON.parse(o.lines) as PricedOrder['lines'];
  let state: OrderView['state'] = 'waiting';
  let reason: OrderView['reason'];
  if (o.status === 'paid') {
    const gaveUp = o.pos_attempts >= MAX_POS_ATTEMPTS && !!o.pos_error;
    if (o.pos_order_id) state = 'success';
    else if (gaveUp) [state, reason] = ['error', 'order_failed'];
  } else if (o.status === 'failed') [state, reason] = ['error', 'payment_failed'];
  else if (o.status === 'pending') [state, reason] = ['error', 'unpaid'];
  return {
    id: o.id,
    state,
    reason,
    firstName: contact.name.split(/\s+/)[0],
    lines: lines.map((l) => ({ name: l.name, variantLabels: l.variantLabels, note: l.note, qty: l.qty, lineTotal: l.unitPrice * l.qty })),
    subtotal: o.subtotal,
    deliveryFee: o.delivery_fee,
    total: o.total,
    fulfilment: { type: fulfilment.type, slot: fulfilment.slot, address: fulfilment.address ? formatAddress(fulfilment.address) : undefined },
    kitchenNote: o.kitchen_note ?? undefined,
    createdAt: o.created_at,
  };
}
