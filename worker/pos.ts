// The restaurant's POS storefront API (Chase Intel), which owns the Stripe account. Card payments go through it:
//   common-auth           finds or creates the customer by phone and returns a short-lived token
//   payment/config        whether card payments are on, and the Stripe publishable key
//   payment/create-intent prices the items and creates the Stripe PaymentIntent the browser confirms
//   checkout              places the order with payment_method STRIPE once the PaymentIntent has succeeded
// Amounts from the POS are dollar strings ("23.50"); everything here is in cents.
import { formatAddress, type PricedOrder } from '../src/lib/order/api';
import { slotTime } from '../src/lib/order/slots';
import type { Env } from './env';
import type { OrderRow } from './orders';

export interface PaymentIntent {
  id: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  amount: number;
  last_payment_error?: { message?: string } | null;
}

const base = (env: Env) => `${env.STOREFRONT_API_URL.replace(/\/$/, '')}/storefront`;
const cents = (dollars: unknown) => Math.round(Number(dollars) * 100);

async function post<T>(env: Env, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${base(env)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new PosError(`POS ${path} ${res.status}: ${text.slice(0, 300)}`, res.status);
  return JSON.parse(text) as T;
}

export class PosError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let configCache: { at: number; key: string | null } | undefined;
/** The POS's Stripe publishable key, or null when card payments are off there. Kept for a minute per Worker instance. */
export async function publishableKey(env: Env): Promise<string | null> {
  if (configCache && Date.now() - configCache.at < 60_000) return configCache.key;
  const res = await fetch(`${base(env)}/payment/config/?restaurant_id=${encodeURIComponent(env.RESTAURANT_ID)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new PosError(`POS payment/config ${res.status}`, res.status);
  const c = (await res.json()) as { stripe_enabled?: boolean; stripe_publishable_key?: string | null };
  configCache = { at: Date.now(), key: c.stripe_enabled && c.stripe_publishable_key ? c.stripe_publishable_key : null };
  return configCache.key;
}

/** Logs the customer in by phone. The token is used straight away and never stored. */
async function auth(env: Env, contact: PricedOrder['contact']): Promise<string> {
  const [first, ...rest] = contact.name.split(/\s+/);
  const { access } = await post<{ access: string }>(env, 'common-auth/', {
    restaurant_id: env.RESTAURANT_ID,
    phone: contact.phone,
    first_name: first,
    ...(rest.length ? { last_name: rest.join(' ') } : {}),
  });
  return access;
}

/** The items as the POS takes them. A size is ordered by its own id; the size and the customer's note go in the dish's note. */
const items = (lines: PricedOrder['lines']) =>
  lines.map((l) => ({
    menu_item_id: l.posId,
    quantity: l.qty,
    notes: [...l.variantLabels, l.note].filter(Boolean).join(' · '),
    modifier_ids: [],
    removed_ingredient_ids: [],
    bundle_selections: [],
  }));

/** Asks the POS to price the order and create its PaymentIntent. The POS's amount is what the card is charged. */
export async function createIntent(env: Env, order: PricedOrder): Promise<{ id: string; clientSecret: string; total: number }> {
  const access = await auth(env, order.contact);
  const pi = await post<{ client_secret: string; payment_intent_id: string; amount: string }>(
    env,
    'payment/create-intent/',
    { order_type: order.fulfilment.type, items: items(order.lines) },
    access,
  );
  return { id: pi.payment_intent_id, clientSecret: pi.client_secret, total: cents(pi.amount) };
}

/**
 * The PaymentIntent's state, read from Stripe with the publishable key and the intent's client secret
 * (what Stripe.js does in the browser), since the secret key stays with the POS.
 */
export async function retrieveIntent(key: string, id: string, clientSecret: string): Promise<PaymentIntent> {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}?client_secret=${encodeURIComponent(clientSecret)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = (await res.json()) as PaymentIntent & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe payment_intents/${id}: ${data.error?.message ?? res.status}`);
  return data;
}

/** Places the paid order in the POS, which checks the PaymentIntent, marks the order paid and prints the docket. */
export async function checkout(env: Env, order: OrderRow): Promise<number> {
  const contact = JSON.parse(order.contact) as PricedOrder['contact'];
  const fulfilment = JSON.parse(order.fulfilment) as PricedOrder['fulfilment'];
  const lines = JSON.parse(order.lines) as PricedOrder['lines'];
  const access = await auth(env, contact);
  // The docket carries what the POS has no field for: when it is due and the web order number.
  const when = `${fulfilment.type === 'delivery' ? 'DELIVERY' : 'PICKUP'} ${slotTime(fulfilment.slot)}`;
  const notes = [`${when}.`, `Web order ${order.id}.`, order.kitchen_note].filter(Boolean).join(' ');
  const created = await post<{ id: number }>(
    env,
    'checkout/',
    {
      order_type: fulfilment.type,
      ...(fulfilment.address ? { delivery_address: formatAddress(fulfilment.address) } : {}),
      notes,
      payment_method: 'STRIPE',
      payment_intent_id: order.payment_intent_id,
      items: items(lines),
    },
    access,
  );
  return created.id;
}
