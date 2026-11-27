// The restaurant's POS storefront API, called straight from the browser at checkout (the same flow as /order-test):
//   payment/config        whether card payments are on, and the Stripe publishable key
//   common-auth           finds or creates the customer by phone and returns a short-lived token
//   payment/create-intent prices the items and creates the Stripe PaymentIntent the browser confirms
//   checkout              places the order with payment_method STRIPE once the PaymentIntent has succeeded
// The token is kept in memory only. Amounts from the POS are dollar strings ("23.50"); here they are cents.
// For now the browser runs the whole flow. worker/ keeps the server-side version (with its D1 database) for
// when the POS team confirms how their API guards the payment-to-order step.
import { formatAddress, type PricedOrder } from './api';
import { slotTime } from './slots';

export interface Storefront {
  base: string;
  restaurantId: string;
}

export class StorefrontError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const cents = (dollars: unknown) => Math.round(Number(dollars) * 100);

async function post<T>(sf: Storefront, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${sf.base.replace(/\/$/, '')}/storefront/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 200);
    try {
      const d = JSON.parse(text) as Record<string, unknown>;
      detail = String(d.error ?? d.detail ?? JSON.stringify(d)).slice(0, 200);
    } catch {
      /* not JSON */
    }
    throw new StorefrontError(`${path} ${res.status}: ${detail}`, res.status);
  }
  return JSON.parse(text) as T;
}

/** The POS's Stripe publishable key, or null when card payments are switched off in the POS. */
export async function publishableKey(sf: Storefront): Promise<string | null> {
  const res = await fetch(`${sf.base.replace(/\/$/, '')}/storefront/payment/config/?restaurant_id=${encodeURIComponent(sf.restaurantId)}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new StorefrontError(`payment/config ${res.status}`, res.status);
  const c = (await res.json()) as { stripe_enabled?: boolean; stripe_publishable_key?: string | null };
  return c.stripe_enabled && c.stripe_publishable_key ? c.stripe_publishable_key : null;
}

/** Logs the customer in by phone and returns the token. */
export async function auth(sf: Storefront, contact: PricedOrder['contact']): Promise<string> {
  const [first, ...rest] = contact.name.split(/\s+/);
  const { access } = await post<{ access: string }>(sf, 'common-auth/', {
    restaurant_id: sf.restaurantId,
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

/** Has the POS price the order and create its PaymentIntent. The POS's amount is what the card is charged. */
export async function createIntent(sf: Storefront, token: string, order: PricedOrder): Promise<{ id: string; clientSecret: string; total: number }> {
  const pi = await post<{ client_secret: string; payment_intent_id: string; amount: string }>(
    sf,
    'payment/create-intent/',
    { order_type: order.fulfilment.type, items: items(order.lines) },
    token,
  );
  return { id: pi.payment_intent_id, clientSecret: pi.client_secret, total: cents(pi.amount) };
}

/** Places the paid order. The POS checks the PaymentIntent with Stripe, marks the order paid and prints the docket. */
export async function checkout(sf: Storefront, token: string, order: PricedOrder, paymentIntentId: string, ref: string): Promise<{ id: number }> {
  const { fulfilment } = order;
  const when = `${fulfilment.type === 'delivery' ? 'DELIVERY' : 'PICKUP'} ${slotTime(fulfilment.slot)}`;
  const notes = [`${when}.`, `Web order ${ref}.`, order.kitchenNote].filter(Boolean).join(' ');
  return post<{ id: number }>(
    sf,
    'checkout/',
    {
      order_type: fulfilment.type,
      ...(fulfilment.address ? { delivery_address: formatAddress(fulfilment.address) } : {}),
      notes,
      payment_method: 'STRIPE',
      payment_intent_id: paymentIntentId,
      items: items(order.lines),
    },
    token,
  );
}

/** "aj-" and 8 random letters and digits: the web order reference on the docket and the confirmation page. */
export function newRef() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `aj-${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
}
