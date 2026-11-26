// The ordering Worker. It runs in front of the static site for /api/* and /order/*; everything else is
// served straight from the built site (dist/). See wrangler.jsonc for the bindings and docs/ordering.md for setup.
//
//   GET  /api/config             which payment mode is live, and the POS's Stripe publishable key
//   POST /api/checkout/intent    checks the basket, saves the order, has the POS price it and create its PaymentIntent
//   GET  /api/orders/:id         the order page's status, checked against Stripe when still unsettled; a paid
//                                order is placed in the POS (payment_method STRIPE) so the kitchen gets it
//
// Card payments go through the POS's storefront API, which owns the Stripe account (see worker/pos.ts).
//   POST /api/dev/mock-pay/:id   local testing only: fake a payment outcome when there are no Stripe keys
//   GET  /order/:id              the order status page (one static page for every order)
import { priceOrder, type ApiError, type ConfigResponse, type IntentRequest, type IntentResponse } from '../src/lib/order/api';
import type { Catalog } from '../src/lib/order/catalog';
import type { Env, ExecutionContext } from './env';
import { forwardToPos, getOrder, getOrderByCart, markFailed, markPaid, markProcessing, saveOrder, setIntent, toView, type OrderRow } from './orders';
import { createIntent as posCreateIntent, publishableKey, retrieveIntent, type PaymentIntent } from './pos';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (error: string, status = 400, extra: Partial<ApiError> = {}) => json({ error, ...extra } satisfies ApiError, status);

/** Mock payments (local testing only) win; otherwise cards are on when the POS has Stripe switched on. */
async function config(env: Env): Promise<ConfigResponse> {
  if (env.MOCK_PAYMENTS === 'true') return { payments: 'mock' };
  const key = await publishableKey(env).catch((e) => (console.error('POS payment/config failed:', e), null));
  return key ? { payments: 'stripe', stripePublishableKey: key } : { payments: 'off' };
}

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

/** The order's PaymentIntent as Stripe has it now, or null if it has none or Stripe cannot be asked. */
async function currentIntent(cfg: ConfigResponse, order: OrderRow): Promise<PaymentIntent | null> {
  if (cfg.payments !== 'stripe' || !order.payment_intent_id || !order.payment_client_secret) return null;
  try {
    return await retrieveIntent(cfg.stripePublishableKey!, order.payment_intent_id, order.payment_client_secret);
  } catch (e) {
    console.error(`Could not read ${order.payment_intent_id} for order ${order.id}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function createIntent(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const cfg = await config(env);
  if (cfg.payments === 'off') return fail('Online payment is not set up yet. Please call us to order.', 503);
  const body = await readJson<IntentRequest>(request);
  if (!body) return fail('The order could not be read.');

  const priced = priceOrder(body, await loadCatalog(env, url));
  if ('error' in priced) return json(priced, 422);

  const existing = await getOrderByCart(env, body.cartId);
  if (existing && (existing.status === 'paid' || existing.status === 'processing')) {
    return fail('This order has already been paid for.', 409, { orderId: existing.id });
  }
  if (existing) {
    // Paid in another tab while this one was open: settle it and send the customer to the order.
    const pi = await currentIntent(cfg, existing);
    if (pi && (pi.status === 'succeeded' || pi.status === 'processing')) {
      await settle(env, ctx, existing, pi);
      return fail('This order has already been paid for.', 409, { orderId: existing.id });
    }
  }
  let order = await saveOrder(env, body.cartId, existing, priced);
  if (cfg.payments === 'mock') {
    return json({ orderId: order.id, subtotal: order.subtotal, deliveryFee: order.delivery_fee, total: order.total, mock: true } satisfies IntentResponse);
  }

  // A new PaymentIntent for every press of Pay, priced by the POS. One that is never confirmed charges nothing.
  let pi;
  try {
    pi = await posCreateIntent(env, priced);
  } catch (e) {
    console.error(`POS create-intent failed for order ${order.id}:`, e instanceof Error ? e.message : e);
    return fail('We could not start the payment. Please try again, or call us to order.', 502);
  }
  await setIntent(env, order.id, pi);
  order = (await getOrder(env, order.id))!;
  return json({ orderId: order.id, subtotal: order.subtotal, deliveryFee: order.delivery_fee, total: order.total, clientSecret: pi.clientSecret } satisfies IntentResponse);
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

async function orderStatus(env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  let order = await getOrder(env, id);
  if (!order) return fail('We could not find that order.', 404);
  const cfg = await config(env);
  // Stripe's webhooks go to the POS, so the payment's state is read from Stripe while the customer watches.
  if (order.status !== 'paid') {
    const pi = await currentIntent(cfg, order);
    if (pi) await settle(env, ctx, order, pi);
  }
  // Mock mode: a "processing" payment clears after ten seconds, to show the waiting screen.
  if (order.status === 'processing' && cfg.payments === 'mock' && Date.now() - Date.parse(order.updated_at) > 10_000) {
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
  if ((await config(env)).payments !== 'mock') return fail('Not found.', 404);
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
        return json(await config(env));
      }
      if (pathname === '/api/checkout/intent' && method === 'POST') return await createIntent(request, env, ctx, url);
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
