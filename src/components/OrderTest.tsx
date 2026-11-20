import { useEffect, useMemo, useState } from 'react';
import { loadStripe, type Stripe, type StripeCardElementChangeEvent } from '@stripe/stripe-js/pure';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';

// Test ordering page for the POS storefront + Stripe flow (see STRIPE_STOREFRONT_INTEGRATION_GUIDE.md).
// Order of calls: menu items + payment config on load; on Pay: common-auth → create-intent →
// stripe.confirmCardPayment → checkout. Every call is logged on the page so gaps are easy to see.
// The login token lives only in this component's memory and is never saved in the browser.

interface Props {
  apiUrl: string;
  restaurantId: string;
}

interface ApiItem {
  id: number;
  category: number;
  name: string;
  price: string;
  description: string;
  is_active: boolean;
  is_purchasable: boolean;
  size_options: unknown[];
}

interface LogEntry {
  step: string;
  status: 'running' | 'ok' | 'error' | 'warn';
  detail?: string;
}

// Preferred test dishes, one per category. Missing ones are filled from other categories.
const PREFERRED = ['Aloo Kulcha', 'Dal Makhni', 'Butter Chicken - Bone/Boneless', 'Mango Lassi', 'Gulab Jamun'];
const DELIVERY_FEE = 5;
const money = (n: number) => `$${n.toFixed(2)}`;

// Hide secrets in the on-page log.
const redact = (data: unknown) =>
  JSON.stringify(
    data,
    (k, v) => (['access', 'refresh', 'client_secret'].includes(k) && typeof v === 'string' ? `${v.slice(0, 12)}…` : v),
    2,
  );

class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    super(`HTTP ${status}`);
  }
}

function pickItems(items: ApiItem[]): ApiItem[] {
  // Sized items are skipped for now: the guide doesn't say which ID to send for a chosen size.
  const usable = items.filter((i) => i.is_active && Number(i.price) > 0 && i.size_options.length === 0);
  const chosen = PREFERRED.map((n) => usable.find((i) => i.name === n)).filter((i): i is ApiItem => !!i);
  for (const i of usable) {
    if (chosen.length >= 5) break;
    if (!chosen.some((c) => c.category === i.category)) chosen.push(i);
  }
  return chosen.slice(0, 5);
}

export default function OrderTest({ apiUrl, restaurantId }: Props) {
  const base = apiUrl.replace(/\/$/, '');
  const [items, setItems] = useState<ApiItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [stripeConfig, setStripeConfig] = useState<{ enabled: boolean; key: string | null } | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    const q = `restaurant_id=${encodeURIComponent(restaurantId)}`;
    fetch(`${base}/storefront/menu/items/?${q}&nocache=true`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Menu HTTP ${r.status}`))))
      .then((data: ApiItem[]) => setItems(pickItems(data)))
      .catch((e) => setLoadError(String(e.message ?? e)));
    fetch(`${base}/storefront/payment/config/?${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Config HTTP ${r.status}`))))
      .then((c: { stripe_enabled: boolean; stripe_publishable_key: string | null }) => {
        setStripeConfig({ enabled: !!c.stripe_enabled && !!c.stripe_publishable_key, key: c.stripe_publishable_key });
        if (c.stripe_enabled && c.stripe_publishable_key) setStripePromise(loadStripe(c.stripe_publishable_key));
      })
      .catch(() => setStripeConfig({ enabled: false, key: null }));
  }, [base, restaurantId]);

  if (loadError) return <p className="ot-error">Could not load the menu from the API: {loadError}</p>;
  if (!items || !stripeConfig) return <p className="text-caption">Loading menu and payment settings…</p>;

  return (
    <Elements
      stripe={stripePromise}
      options={{ fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Vollkorn&display=swap' }] }}
    >
      <OrderForm base={base} restaurantId={restaurantId} items={items} stripeEnabled={stripeConfig.enabled} />
    </Elements>
  );
}

function OrderForm({ base, restaurantId, items, stripeEnabled }: { base: string; restaurantId: string; items: ApiItem[]; stripeEnabled: boolean }) {
  const stripe = useStripe();
  const elements = useElements();

  const [qty, setQty] = useState<Record<number, number>>({});
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', email: '', order_type: 'pickup', delivery_address: '', notes: '' });
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  // Kept so a failed checkout can be retried with the same, already-paid PaymentIntent.
  const [paid, setPaid] = useState<{ access: string; paymentIntentId: string } | null>(null);

  const lines = items.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ item: i, quantity: qty[i.id] }));
  const subtotal = lines.reduce((n, l) => n + Number(l.item.price) * l.quantity, 0);
  const fee = form.order_type === 'delivery' ? DELIVERY_FEE : 0;
  const total = subtotal + fee;

  // The same items array goes to create-intent and checkout. is_purchasable is ignored here on purpose:
  // the APIs only take menu_item_id, so whether non-purchasable items are accepted is up to the backend.
  const apiItems = useMemo(
    () => lines.map((l) => ({ menu_item_id: l.item.id, quantity: l.quantity, notes: '', modifier_ids: [], removed_ingredient_ids: [], bundle_selections: [] })),
    [JSON.stringify(lines.map((l) => [l.item.id, l.quantity]))],
  );

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const add = (entry: LogEntry) => setLog((l) => [...l, entry]);
  const finish = (status: LogEntry['status'], detail?: string) =>
    setLog((l) => l.map((e, i) => (i === l.length - 1 ? { ...e, status, detail: detail ?? e.detail } : e)));

  async function call<T>(step: string, path: string, body: unknown, token?: string): Promise<T> {
    add({ step, status: 'running', detail: `POST /storefront/${path}\n${redact(body)}` });
    const res = await fetch(`${base}/storefront/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      finish('error', `HTTP ${res.status}\n${typeof data === 'string' ? data.slice(0, 400) : redact(data)}`);
      throw new ApiError(res.status, data);
    }
    finish('ok', `HTTP ${res.status}\n${redact(data)}`);
    return data as T;
  }

  function validate(card: boolean): string {
    if (!lines.length) return 'Add at least one dish.';
    if (!form.first_name.trim()) return 'Enter a first name.';
    if (!form.phone.trim()) return 'Enter a phone number.';
    if (form.order_type === 'delivery' && !form.delivery_address.trim()) return 'Enter a delivery address.';
    if (card && !cardComplete) return 'Enter complete card details.';
    return '';
  }

  const errorText = (e: unknown) => {
    if (e instanceof ApiError) {
      const d = e.data as Record<string, unknown> | string;
      if (typeof d === 'object' && d) return String(d.error ?? d.detail ?? JSON.stringify(d));
      return `Server error (${e.status})`;
    }
    return e instanceof Error ? e.message : String(e);
  };

  async function auth() {
    const res = await call<{ access: string; user: { first_name: string; last_name: string; phone: string; email: string } }>('1. Customer (common-auth)', 'common-auth/', {
      restaurant_id: restaurantId,
      phone: form.phone,
      first_name: form.first_name,
      ...(form.last_name ? { last_name: form.last_name } : {}),
      ...(form.email ? { email: form.email } : {}),
    });
    return res;
  }

  async function placeOrder(access: string, paymentMethod: 'STRIPE' | 'MANUAL_CASH', paymentIntentId?: string, step = '4. Create order (checkout)') {
    const o = await call<Record<string, unknown>>(step, 'checkout/', {
      order_type: form.order_type,
      ...(form.order_type === 'delivery' ? { delivery_address: form.delivery_address } : {}),
      notes: form.notes,
      payment_method: paymentMethod,
      ...(paymentIntentId ? { payment_intent_id: paymentIntentId } : {}),
      items: apiItems,
    }, access);
    setOrder(o);
    setPaid(null);
  }

  async function payByCard() {
    const v = validate(true);
    if (v) return setError(v);
    if (!stripe || !elements) return setError('Stripe is still loading.');
    const card = elements.getElement(CardElement);
    if (!card) return setError('Card field not found.');
    setError('');
    setOrder(null);
    setLog([]);
    setBusy(true);
    try {
      const { access, user } = await auth();
      const intent = await call<{ client_secret: string; payment_intent_id: string; amount: string }>('2. Create payment (create-intent)', 'payment/create-intent/', { order_type: form.order_type, items: apiItems }, access);
      if (Math.abs(Number(intent.amount) - total) > 0.005) {
        add({ step: 'Total check', status: 'warn', detail: `Server total ${money(Number(intent.amount))} differs from page total ${money(total)}.` });
      }

      add({ step: '3. Charge card (Stripe confirmCardPayment)', status: 'running' });
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(intent.client_secret, {
        payment_method: {
          card,
          billing_details: {
            name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || undefined,
            phone: user.phone || undefined,
            email: user.email || undefined,
          },
        },
      });
      if (stripeError) {
        finish('error', `${stripeError.code ?? stripeError.type}: ${stripeError.message}`);
        throw new Error(stripeError.message ?? 'Card payment failed.');
      }
      if (paymentIntent?.status !== 'succeeded') {
        finish('error', `PaymentIntent status: ${paymentIntent?.status}`);
        throw new Error(`Payment not completed (status: ${paymentIntent?.status}).`);
      }
      finish('ok', `PaymentIntent ${paymentIntent.id}: ${paymentIntent.status}, ${money(paymentIntent.amount / 100)}`);

      setPaid({ access, paymentIntentId: intent.payment_intent_id });
      await placeOrder(access, 'STRIPE', intent.payment_intent_id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function retryCheckout() {
    if (!paid) return;
    setBusy(true);
    setError('');
    try {
      await placeOrder(paid.access, 'STRIPE', paid.paymentIntentId, '4. Create order (checkout, retry)');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function payCash() {
    const v = validate(false);
    if (v) return setError(v);
    setError('');
    setOrder(null);
    setLog([]);
    setBusy(true);
    try {
      const { access } = await auth();
      await placeOrder(access, 'MANUAL_CASH', undefined, '2. Create order (checkout, cash)');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  // Stripe's card field lives in an iframe, so it gets the design tokens' resolved values; it keeps its own defaults if one is missing.
  const token = (name: string) => (typeof window !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined : undefined);

  return (
    <div className="ot">
      <section className="ot-dishes" aria-labelledby="ot-dishes-title">
        <h2 id="ot-dishes-title" className="text-heading-lg">Dishes</h2>
        <ul className="ot-list">
          {items.map((i) => (
            <li key={i.id} className="ot-row">
              <div>
                <p className="ot-name">{i.name}</p>
                <p className="text-caption">
                  {money(Number(i.price))} · POS id {i.id}
                  {!i.is_purchasable && <span className="ot-flag"> · not purchasable in POS</span>}
                </p>
              </div>
              <div className="ot-qty" role="group" aria-label={`Quantity of ${i.name}`}>
                <button type="button" className="btn btn--secondary" onClick={() => setQty((q) => ({ ...q, [i.id]: Math.max(0, (q[i.id] ?? 0) - 1) }))} aria-label={`Remove one ${i.name}`} disabled={busy}>−</button>
                <output aria-live="polite">{qty[i.id] ?? 0}</output>
                <button type="button" className="btn btn--secondary" onClick={() => setQty((q) => ({ ...q, [i.id]: Math.min(20, (q[i.id] ?? 0) + 1) }))} aria-label={`Add one ${i.name}`} disabled={busy}>+</button>
              </div>
            </li>
          ))}
        </ul>
        <dl className="ot-totals">
          <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
          {fee > 0 && <div><dt>Delivery</dt><dd>{money(fee)}</dd></div>}
          <div className="ot-total"><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>
      </section>

      <section className="ot-pay" aria-labelledby="ot-pay-title">
        <h2 id="ot-pay-title" className="text-heading-lg">Your details</h2>
        <div className="form-grid">
          <div className="field"><label className="field__label text-meta" htmlFor="ot-first">First name</label><input className="input" id="ot-first" autoComplete="given-name" value={form.first_name} onChange={set('first_name')} /></div>
          <div className="field"><label className="field__label text-meta" htmlFor="ot-last">Last name <span className="field__optional">(optional)</span></label><input className="input" id="ot-last" autoComplete="family-name" value={form.last_name} onChange={set('last_name')} /></div>
          <div className="field"><label className="field__label text-meta" htmlFor="ot-phone">Phone</label><input className="input" id="ot-phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></div>
          <div className="field"><label className="field__label text-meta" htmlFor="ot-email">Email <span className="field__optional">(optional)</span></label><input className="input" id="ot-email" type="email" autoComplete="email" value={form.email} onChange={set('email')} /></div>
          <div className="field field--full">
            <label className="field__label text-meta" htmlFor="ot-type">Pickup or delivery</label>
            <select className="input" id="ot-type" value={form.order_type} onChange={set('order_type')}>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery (+{money(DELIVERY_FEE)})</option>
            </select>
          </div>
          {form.order_type === 'delivery' && (
            <div className="field field--full"><label className="field__label text-meta" htmlFor="ot-address">Delivery address</label><input className="input" id="ot-address" autoComplete="street-address" value={form.delivery_address} onChange={set('delivery_address')} /></div>
          )}
          <div className="field field--full"><label className="field__label text-meta" htmlFor="ot-notes">Notes <span className="field__optional">(optional)</span></label><input className="input" id="ot-notes" value={form.notes} onChange={set('notes')} /></div>

          <div className="field field--full">
            <label className="field__label text-meta" htmlFor="ot-card">Card</label>
            {stripeEnabled ? (
              <>
                <div className="input ot-card" id="ot-card">
                  <CardElement
                    options={{ hidePostalCode: true, style: { base: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '16px', color: token('--ink-primary') }, invalid: { color: token('--brand-maroon') } } }}
                    onChange={(e: StripeCardElementChangeEvent) => {
                      setCardComplete(e.complete);
                      setCardError(e.error?.message ?? '');
                    }}
                  />
                </div>
                {cardError && <p className="ot-error">{cardError}</p>}
              </>
            ) : (
              <p className="ot-notice">Card payments are switched off for this restaurant in the POS (payment/config returned stripe_enabled: false). Add the Stripe keys under the POS admin settings to test card payments.</p>
            )}
          </div>

          <div className="field--full btn-row">
            <button type="button" className="btn btn--primary" onClick={payByCard} disabled={busy || !stripeEnabled || !lines.length}>
              {busy ? 'Working…' : `Pay ${money(total)} by card`}
            </button>
            <button type="button" className="btn btn--secondary" onClick={payCash} disabled={busy || !lines.length}>
              Test order, pay at pickup
            </button>
          </div>
          <p className="field--full field__help">Both buttons create a real order in the POS and can print a kitchen docket.</p>
        </div>

        {error && <p className="ot-error" role="alert">{error}</p>}
        {paid && !order && (
          <p className="ot-notice">
            The card was charged (PaymentIntent {paid.paymentIntentId}) but the order was not created.{' '}
            <button type="button" className="btn btn--secondary" onClick={retryCheckout} disabled={busy}>Retry creating the order</button>
          </p>
        )}
        {order && (
          <div className="ot-done" role="status">
            <p className="eyebrow text-meta">Order placed</p>
            <p>
              Order #{String(order.id)} · {String(order.status)} · total ${String(order.total)} · {order.is_paid ? 'paid' : 'not paid'} ({String(order.payment_method)})
            </p>
          </div>
        )}
      </section>

      {log.length > 0 && (
        <section className="ot-log" aria-labelledby="ot-log-title">
          <h2 id="ot-log-title" className="text-heading-lg">API calls</h2>
          <ol>
            {log.map((e, i) => (
              <li key={i} className={`ot-log__item is-${e.status}`}>
                <p className="ot-log__step">{e.step} <span>{e.status}</span></p>
                {e.detail && <pre>{e.detail}</pre>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
