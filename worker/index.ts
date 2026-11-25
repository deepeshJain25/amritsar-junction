// The ordering Worker. It runs in front of the static site for /api/* and /order/*; everything else is
// served straight from the built site (dist/). See wrangler.jsonc for the bindings and docs/ordering.md for setup.
//
//   GET  /api/config             which payment mode is live, and Stripe's publishable key
//   POST /api/checkout/intent    prices the basket, saves the order, creates or updates its Stripe PaymentIntent
//   POST /api/webhooks/stripe    Stripe tells us a payment succeeded, failed or is processing
//   GET  /api/orders/:id         the order page's status, checked against Stripe when still unsettled
//   POST /api/dev/mock-pay/:id   local testing only: fake a payment outcome when there are no Stripe keys
//   GET  /order/:id              the order status page (one static page for every order)
import { priceOrder, type ApiError, type ConfigResponse, type IntentRequest, type IntentResponse } from '../src/lib/order/api';
import type { Catalog } from '../src/lib/order/catalog';
import type { Env, ExecutionContext } from './env';
import { forwardToPos, getOrder, getOrderByCart, getOrderByIntent, markFailed, markPaid, markProcessing, saveOrder, setIntent, toView, type OrderRow } from './orders';
import { stripe, verifyWebhook, type PaymentIntent } from './stripe';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (error: string, status = 400, extra: Partial<ApiError> = {}) => json({ error, ...extra } satisfies ApiError, status);

const mode = (env: Env): ConfigResponse['payments'] => (env.STRIPE_SECRET_KEY ? 'stripe' : env.MOCK_PAYMENTS === 'true' ? 'mock' : 'off');

let catalogCache: { at: number; catalog: Catalog } | undefined;
/** The catalog built with the site, the same file the basket reads. Kept for a minute per Worker instance. */
async function loadCatalog(env: Env, url: URL): Promise<Catalog> {
  if (catalogCache && Date.now() - catalogCache.at < 60_000) return catalogCache.catalog;
  const res = await env.ASSETS.fetch(new URL('/catalog.json', url).href);
  if (!res.ok) throw new Error(`catalog.json ${res.status}`);
  catalogCache = { at: Date.now(), catalog: (await res.json()) as Catalog };
  return catalogCache.catalog;
}

async function readJson<T>(request: Request): Promise<T | undefined> {
  const text = await request.text();
  if (text.length > 32_000) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** Card payments in AUD, with Apple Pay and Google Pay where the device offers them. */
async function upsertIntent(env: Env, order: OrderRow): Promise<PaymentIntent> {
  const params = { amount: order.total, description: `Amritsar Junction order ${order.id}` };
  if (order.payment_intent_id) {
    const pi = await stripe<PaymentIntent>(env, 'GET', `payment_intents/${order.payment_intent_id}`);
    if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) {
      return pi.amount === order.total ? pi : stripe<PaymentIntent>(env, 'POST', `payment_intents/${pi.id}`, params);
    }
    if (pi.status !== 'canceled') return pi;
  }
  const pi = await stripe<PaymentIntent>(
    env,
    'POST',
    'payment_intents',
    { ...params, currency: 'aud', automatic_payment_methods: { enabled: true }, metadata: { order_id: order.id } },
    `create-${order.id}-${order.total}-${order.payment_intent_id ?? 'first'}`,
  );
  await setIntent(env, order.id, pi.id);
  return pi;
}

async function createIntent(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const payments = mode(env);
  if (payments === 'off') return fail('Online payment is not set up yet. Please call us to order.', 503);
  const body = await readJson<IntentRequest>(request);
  if (!body) return fail('The order could not be read.');

  const priced = priceOrder(body, await loadCatalog(env, url));
  if ('error' in priced) return json(priced, 422);

  const existing = await getOrderByCart(env, body.cartId);
  if (existing && (existing.status === 'paid' || existing.status === 'processing')) {
    return fail('This order has already been paid for.', 409, { orderId: existing.id });
  }
  const order = await saveOrder(env, body.cartId, existing, priced);
  const base: IntentResponse = { orderId: order.id, subtotal: order.subtotal, deliveryFee: order.delivery_fee, total: order.total };
  if (payments === 'mock') return json({ ...base, mock: true } satisfies IntentResponse);

  const pi = await upsertIntent(env, order);
  if (pi.status === 'succeeded' || pi.status === 'processing') {
    // Paid in another tab while this one was open: settle it and send the customer to the order.
    await settle(env, ctx, order, pi);
    return fail('This order has already been paid for.', 409, { orderId: order.id });
  }
  return json({ ...base, clientSecret: pi.client_secret } satisfies IntentResponse);
}

/** Applies a PaymentIntent's state to its order. Safe to call any number of times. */
async function settle(env: Env, ctx: ExecutionContext, order: OrderRow, pi: PaymentIntent) {
  if (pi.status === 'succeeded') {
    await markPaid(env, order.id);
    ctx.waitUntil(forwardToPos(env, order.id));
  } else if (pi.status === 'processing') {
    await markProcessing(env, order.id);
  } else if (pi.status === 'canceled' || (pi.status === 'requires_payment_method' && pi.last_payment_error)) {
    await markFailed(env, order.id, pi.last_payment_error?.message ?? 'The payment was cancelled.');
  }
}

async function webhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.text();
  if (!env.STRIPE_WEBHOOK_SECRET || !(await verifyWebhook(body, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return fail('Invalid signature.', 400);
  }
  const event = JSON.parse(body) as { type: string; data: { object: PaymentIntent } };
  if (!event.type.startsWith('payment_intent.')) return json({ received: true });
  const pi = event.data.object;
  const order = await getOrderByIntent(env, pi.id);
  if (!order) {
    console.warn(`Stripe ${event.type} for ${pi.id}, which matches no order.`);
    return json({ received: true });
  }
  await settle(env, ctx, order, pi);
  return json({ received: true });
}

async function orderStatus(env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  let order = await getOrder(env, id);
  if (!order) return fail('We could not find that order.', 404);
  // The webhook may not have arrived (or may not exist, as in local testing): ask Stripe directly.
  if (order.status !== 'paid' && order.payment_intent_id && mode(env) === 'stripe') {
    await settle(env, ctx, order, await stripe<PaymentIntent>(env, 'GET', `payment_intents/${order.payment_intent_id}`));
  }
  // Mock mode: a "processing" payment clears after ten seconds, to show the waiting screen.
  if (order.status === 'processing' && mode(env) === 'mock' && Date.now() - Date.parse(order.updated_at) > 10_000) {
    await markPaid(env, order.id);
  }
  order = (await getOrder(env, id))!;
  // A paid order the POS has not taken yet is retried while the customer watches.
  if (order.status === 'paid' && !order.pos_order_id) {
    ctx.waitUntil(forwardToPos(env, order.id));
  }
  return json(toView(order));
}

async function mockPay(request: Request, env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  if (mode(env) !== 'mock') return fail('Not found.', 404);
  const order = await getOrder(env, id);
  if (!order) return fail('We could not find that order.', 404);
  const { outcome } = (await readJson<{ outcome: string }>(request)) ?? {};
  if (outcome === 'decline') {
    await markFailed(env, id, 'Your card was declined.');
    return fail('Your card was declined. Try another card, or call us.', 402);
  }
  if (outcome === 'processing') await markProcessing(env, id);
  else {
    await markPaid(env, id);
    ctx.waitUntil(forwardToPos(env, id));
  }
  return json({ orderId: id });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    try {
      if (pathname === '/api/config' && method === 'GET') {
        return json({ payments: mode(env), stripePublishableKey: env.STRIPE_SECRET_KEY ? env.STRIPE_PUBLISHABLE_KEY : undefined } satisfies ConfigResponse);
      }
      if (pathname === '/api/checkout/intent' && method === 'POST') return await createIntent(request, env, ctx, url);
      if (pathname === '/api/webhooks/stripe' && method === 'POST') return await webhook(request, env, ctx);
      let m = pathname.match(/^\/api\/orders\/(aj-[a-z0-9]{8})$/);
      if (m && method === 'GET') return await orderStatus(env, ctx, m[1]);
      m = pathname.match(/^\/api\/dev\/mock-pay\/(aj-[a-z0-9]{8})$/);
      if (m && method === 'POST') return await mockPay(request, env, ctx, m[1]);
      if (pathname.startsWith('/api/')) return fail('Not found.', 404);
      // Every /order/<id> is the same static page; it reads the id from the address.
      if (pathname.startsWith('/order/') && pathname !== '/order/') {
        const page = await env.ASSETS.fetch(new URL('/order/', url).href);
        return new Response(page.body, { status: page.status, headers: page.headers });
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(`${method} ${pathname} failed:`, e instanceof Error ? e.stack ?? e.message : e);
      return fail('Something went wrong on our side. Please try again, or call us to order.', 500);
    }
  },
};
