import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import type { Stripe, StripeCardElementChangeEvent, StripeElements, StripeElementsOptions } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { ordering, type FulfilmentType } from '../../content/ordering';
import site from '../../content/site.json';
import { fieldError, formatAddress, priceOrder, type IntentRequest } from '../../lib/order/api';
import { money } from '../../lib/order/catalog';
import * as cart from '../../lib/order/cart';
import { clearPending, getPending, savePending, saveReceipt, type Pending } from '../../lib/order/receipt';
import { slotsFor, type Slot } from '../../lib/order/slots';
import * as pos from '../../lib/order/storefront';
import { track } from '../../lib/order/track';

// The checkout: one page, three sections (Your details, When & where, Payment), then Pay.
// The browser runs the whole payment against the POS storefront API, as the /order-test page does:
// common-auth, then payment/create-intent (the POS prices the order and creates the Stripe PaymentIntent), then
// Stripe's card field and confirmCardPayment on the POS's Stripe account, then checkout as a STRIPE payment.
// The totals shown are a preview from the basket; the card is charged the POS's total. Card is the only way to pay.

interface Props {
  phone: string;
  phoneHref: string;
  /** The POS storefront API, e.g. https://dev.chaseintel.com.au/api */
  apiUrl: string;
  restaurantId: string;
}

type Payments = 'stripe' | 'off';
type Fields = { name: string; phone: string; type: FulfilmentType; slot: string; line1: string; suburb: string };
const FORM_STORE = 'aj.checkout.v1';
const FORM_TTL = 30 * 60_000;
const EMPTY: Fields = { name: '', phone: '', type: 'pickup', slot: '', line1: '', suburb: '' };

function useCart() {
  const [c, setC] = useState(cart.getCart());
  useEffect(() => {
    const off = cart.subscribe(setC);
    return () => void off();
  }, []);
  return c;
}

/** Form values survive a refresh for half an hour, in this tab only. */
function loadFields(): Fields {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FORM_STORE) ?? 'null') as { at: number; fields: Fields } | null;
    if (saved && Date.now() - saved.at < FORM_TTL) return { ...EMPTY, ...saved.fields, slot: '', ...(ordering.delivery.enabled ? {} : { type: 'pickup' as const }) };
  } catch {
    /* storage blocked */
  }
  return EMPTY;
}

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Places a paid order in the POS (retrying twice), keeps the receipt for the order page and empties the basket.
 * Returns false if the POS still would not take it: the payment stays saved, so the customer can try again
 * or come back later without being charged twice.
 */
async function finishOrder(sf: pos.Storefront, p: Pending): Promise<boolean> {
  for (const delay of [0, 2000, 5000]) {
    await wait(delay);
    try {
      const posToken = await pos.auth(sf, p.order.contact);
      const placed = await pos.checkout(sf, posToken, p.order, p.paymentIntentId, p.ref);
      const subtotal = p.order.lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
      saveReceipt({
        ref: p.ref,
        posOrderId: placed.id,
        firstName: p.order.contact.name.split(/\s+/)[0],
        lines: p.order.lines.map((l) => ({ name: l.name, variantLabels: l.variantLabels, note: l.note, qty: l.qty, lineTotal: l.unitPrice * l.qty })),
        subtotal,
        deliveryFee: Math.max(0, p.total - subtotal),
        total: p.total,
        fulfilment: { type: p.order.fulfilment.type, slot: p.order.fulfilment.slot, address: p.order.fulfilment.address ? formatAddress(p.order.fulfilment.address) : undefined },
        kitchenNote: p.order.kitchenNote,
        at: Date.now(),
      });
      clearPending();
      cart.clear();
      try {
        sessionStorage.removeItem(FORM_STORE);
      } catch {
        /* storage blocked */
      }
      track('checkout_completed', { order_id: p.ref, total: p.total / 100 });
      location.assign(`/order/?ref=${encodeURIComponent(p.ref)}`);
      return true;
    } catch (e) {
      console.error('POS checkout failed for a paid order', p.ref, e);
    }
  }
  track('checkout_failed', { reason: 'order' });
  return false;
}

export default function CheckoutForm({ phone, phoneHref, apiUrl, restaurantId }: Props) {
  const c = useCart();
  const sf = useMemo<pos.Storefront>(() => ({ base: apiUrl, restaurantId }), [apiUrl, restaurantId]);
  const [config, setConfig] = useState<{ payments: Payments } | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    pos
      .publishableKey(sf)
      .then((key) => {
        if (key) setStripePromise(loadStripe(key));
        setConfig({ payments: key ? 'stripe' : 'off' });
      })
      .catch((e) => {
        console.error('POS payment/config failed', e);
        setConfig({ payments: 'off' });
      });
    cart
      .loadCatalog()
      .then((catalog) => {
        const { repriced, removed } = cart.revalidate(catalog);
        setNotice([repriced && "We've updated prices to match today's menu.", removed.length > 0 && `${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} no longer available and ${removed.length === 1 ? 'was' : 'were'} removed.`].filter(Boolean).join(' '));
      })
      .catch(() => {});
    if (cart.count()) track('checkout_started', { value: cart.subtotal() / 100 });
  }, []);

  // A card payment that went through but never reached the kitchen is finished first, before anything else.
  const pending = getPending();
  if (pending && pending.cartId === c.cartId) return <Unfinished sf={sf} pending={pending} phone={phone} phoneHref={phoneHref} />;

  if (!c.lines.length) {
    return (
      <div className="cart-empty">
        <p className="text-script cart-empty__welcome"><span lang="pa">ਜੀ ਆਇਆਂ ਨੂੰ</span> · Welcome</p>
        <p className="text-heading-md">Your basket is empty. Start with a kulcha.</p>
        <a className="btn btn--primary" href="/menu/">Browse the menu</a>
      </div>
    );
  }
  if (!config) return <p className="text-body checkout__loading">Loading checkout…</p>;

  const props = { c, config, sf, phone, phoneHref, notice };
  if (config.payments !== 'stripe' || !stripePromise) return <CheckoutInner {...props} stripe={null} elements={null} />;

  const options: StripeElementsOptions = {
    fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400..600&display=swap' }],
  };
  return (
    <Elements stripe={stripePromise} options={options}>
      <WithStripe>{(stripe, elements) => <CheckoutInner {...props} stripe={stripe} elements={elements} />}</WithStripe>
    </Elements>
  );
}

/** Stripe's hooks only work inside <Elements>, so they are read here and passed down. */
function WithStripe({ children }: { children: (stripe: Stripe | null, elements: StripeElements | null) => ReactNode }) {
  return <>{children(useStripe(), useElements())}</>;
}

interface InnerProps {
  c: cart.Cart;
  config: { payments: Payments };
  sf: pos.Storefront;
  phone: string;
  phoneHref: string;
  notice: string;
  stripe: Stripe | null;
  elements: StripeElements | null;
}

function CheckoutInner({ c, config, sf, phone, phoneHref, notice, stripe, elements }: InnerProps) {
  const [f, setF] = useState<Fields>(loadFields);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields | 'pay', string>>>({});
  const [busy, setBusy] = useState(false);
  // Set when the card was charged but the POS would not take the order, even after retrying.
  const [stuck, setStuck] = useState<Pending | null>(null);
  const [now, setNow] = useState(() => new Date());
  const payRef = useRef<HTMLElement>(null);

  // Slots move on as the clock does.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const slots = useMemo(() => slotsFor(f.type, now), [f.type, now]);
  const slot = slots.find((s) => s.iso === f.slot) ?? slots[0];

  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_STORE, JSON.stringify({ at: Date.now(), fields: f }));
    } catch {
      /* storage blocked */
    }
  }, [f]);

  const subtotal = cart.subtotal(c);
  const deliveryFee = f.type === 'delivery' ? ordering.delivery.feeCents : 0;
  const preview = subtotal + deliveryFee;
  // The POS's total, once it differs from the preview: the card is charged what the POS says.
  const [quoted, setQuoted] = useState<{ preview: number; total: number } | null>(null);
  const total = quoted?.preview === preview ? quoted.total : preview;
  const belowMinimum = f.type === 'delivery' && subtotal < ordering.delivery.minCents;

  // Stripe's card field: whether it is filled in, and what it says is wrong.
  const [stripeCard, setStripeCard] = useState<{ complete: boolean; error?: string }>({ complete: false });

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setF((prev) => ({ ...prev, [k]: value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: fieldError(k, value) }));
  };
  const blur = (k: keyof Fields) => () => setErrors((prev) => ({ ...prev, [k]: fieldError(k, f[k]) }));

  const required: (keyof Fields)[] = ['name', 'phone', ...(f.type === 'delivery' ? (['line1', 'suburb'] as const) : [])];

  async function pay(e: FormEvent) {
    e.preventDefault();
    const found = Object.fromEntries(required.map((k) => [k, fieldError(k, f[k])]).filter(([, v]) => v));
    if (belowMinimum) {
      setErrors({ type: `Delivery starts at ${money(ordering.delivery.minCents)} of food. Add a little more, or choose pickup.` });
      return;
    }
    if (Object.keys(found).length || !slot) {
      setErrors({ ...found, ...(slot ? {} : { slot: 'There are no times left today. Please call us.' }) });
      document.getElementById(`co-${Object.keys(found)[0] ?? 'slot'}`)?.focus();
      return;
    }
    if (!stripeCard.complete) {
      setErrors({ pay: stripeCard.error ?? 'Enter your card details.' });
      elements?.getElement(CardElement)?.focus();
      return;
    }
    setBusy(true);
    setErrors({});
    let charged: Pending | null = null;
    try {
      // The same checks the server used to run: every dish still on the menu, a valid time, address and phone.
      const body: IntentRequest = {
        cartId: c.cartId,
        lines: c.lines.map((l) => ({ sku: l.sku, variantLabels: l.variantLabels, qty: l.qty, note: l.note })),
        contact: { name: f.name, phone: f.phone },
        fulfilment: { type: f.type, slot: slot.iso, ...(f.type === 'delivery' ? { address: { line1: f.line1, suburb: f.suburb, postcode: '' } } : {}) },
        kitchenNote: c.kitchenNote,
      };
      const priced = priceOrder(body, await cart.loadCatalog());
      if ('error' in priced) {
        if (priced.field) {
          setErrors({ [priced.field]: priced.error });
          document.getElementById(`co-${priced.field}`)?.focus();
          track('checkout_failed', { reason: priced.field });
          return;
        }
        throw new PayError(priced.error);
      }

      const posToken = await pos.auth(sf, priced.contact);
      const intent = await pos.createIntent(sf, posToken, priced);
      if (intent.total !== total) {
        // Never charge an amount the customer has not seen: show the POS's total and wait for another press.
        setQuoted({ preview, total: intent.total });
        throw new PayError(`The restaurant's total for this order is ${money(intent.total)}. Press Pay to pay ${money(intent.total)}.`);
      }

      const cardField = elements?.getElement(CardElement);
      if (!stripe || !cardField) throw new PayError('The card form is still loading. Try again in a moment.');
      // Stripe shows its own bank check (3-D Secure) here when the card needs one.
      const { error, paymentIntent } = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: { card: cardField, billing_details: { name: f.name.trim(), phone: f.phone } },
      });
      if (error) throw new PayError(error.message ?? 'Your card was not charged. Try another card, or call us.');
      if (paymentIntent?.status !== 'succeeded') throw new PayError('Your bank has not approved the payment yet. Call us before trying again, so you are not charged twice.');

      // Paid. Remember it before anything else, so the order can be finished even if this page closes.
      charged = { ref: pos.newRef(), cartId: c.cartId, paymentIntentId: intent.id, total: intent.total, order: priced, at: Date.now() };
      savePending(charged);
      if (!(await finishOrder(sf, charged))) setStuck(charged);
    } catch (err) {
      const message =
        err instanceof PayError
          ? err.message
          : err instanceof pos.StorefrontError
            ? 'We could not start the payment. Your card was not charged. Try again, or call us to order.'
            : 'We could not reach the payment service. Check your connection and try again.';
      if (!(err instanceof PayError)) console.error('Checkout failed', err);
      setErrors({ pay: message });
      track('checkout_failed', { reason: 'payment' });
      payRef.current?.scrollIntoView({ block: 'center' });
    } finally {
      setBusy(false);
    }
  }

  if (stuck) return <Unfinished sf={sf} pending={stuck} phone={phone} phoneHref={phoneHref} />;

  const byDay = slots.reduce<Record<string, Slot[]>>((acc, s) => ((acc[s.day] ??= []).push(s), acc), {});
  const closedNow = slots[0] && slots[0].day !== 'Today';

  return (
    <form className="checkout" onSubmit={pay} noValidate>
      {notice && <p className="cart__notice text-body-sm" role="status">{notice}</p>}

      <Section eyebrow="Your details" title="Who's it for?">
        <div className="form-grid">
          <Field id="co-name" label="Name" error={errors.name} full>
            <input className="input" id="co-name" autoComplete="name" value={f.name} onChange={set('name')} onBlur={blur('name')} aria-invalid={!!errors.name || undefined} aria-describedby={errors.name ? 'co-name-error' : undefined} required />
          </Field>
          <Field id="co-phone" label="Phone" error={errors.phone} full help="In case we need to reach you about the order.">
            <input className="input" id="co-phone" type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set('phone')} onBlur={blur('phone')} aria-invalid={!!errors.phone || undefined} aria-describedby={errors.phone ? 'co-phone-error' : 'co-phone-help'} required />
          </Field>
        </div>
      </Section>

      <Section eyebrow="When" title={ordering.delivery.enabled ? 'Pickup or delivery?' : 'When will you pick it up?'}>
        {ordering.delivery.enabled && (
          <div className="segmented" role="radiogroup" aria-label="Pickup or delivery" id="co-type">
            {(['pickup', 'delivery'] as const).map((t) => (
              <label key={t} className="segmented__option">
                <input type="radio" name="type" value={t} checked={f.type === t} onChange={() => setF((prev) => ({ ...prev, type: t, slot: '' }))} />
                <span>{t === 'pickup' ? 'Pickup' : `Delivery · ${money(ordering.delivery.feeCents)}`}</span>
              </label>
            ))}
          </div>
        )}
        {!ordering.delivery.enabled && <p className="checkout__hint text-body-sm" id="co-type">Pickup only, from our door at {site.address}. We don't deliver yet.</p>}
        {errors.type && <p className="field__error" role="alert">{errors.type}</p>}
        {belowMinimum && <p className="checkout__hint text-body-sm">Delivery starts at {money(ordering.delivery.minCents)} of food. Add {money(ordering.delivery.minCents - subtotal)} more, or choose pickup.</p>}
        {closedNow && <p className="checkout__hint text-body-sm">We're closed right now. Your order will be ready at {slots[0].time} {slots[0].day.toLowerCase()}.</p>}

        <div className="form-grid checkout__where">
          {f.type === 'delivery' && (
            <>
              <Field id="co-line1" label="Street address" error={errors.line1} full>
                <input className="input" id="co-line1" autoComplete="address-line1" value={f.line1} onChange={set('line1')} onBlur={blur('line1')} aria-invalid={!!errors.line1 || undefined} aria-describedby={errors.line1 ? 'co-line1-error' : undefined} placeholder="Unit 2, 15 Station St" required />
              </Field>
              <Field id="co-suburb" label="Suburb" error={errors.suburb} help="We deliver to these suburbs around Harris Park.">
                <select className="input" id="co-suburb" autoComplete="address-level2" value={f.suburb} onChange={set('suburb')} onBlur={blur('suburb')} aria-invalid={!!errors.suburb || undefined} aria-describedby={errors.suburb ? 'co-suburb-error' : 'co-suburb-help'} required>
                  <option value="">Choose a suburb</option>
                  {ordering.delivery.suburbs.map((s) => <option key={s.name} value={s.name}>{s.name} {s.postcode}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field id="co-slot" label={f.type === 'delivery' ? 'Deliver at' : 'Pick up at'} error={errors.slot} full={f.type === 'pickup'}>
            <select className="input" id="co-slot" value={slot?.iso ?? ''} onChange={set('slot')} disabled={!slots.length} aria-invalid={!!errors.slot || undefined} aria-describedby={errors.slot ? 'co-slot-error' : undefined}>
              {!slots.length && <option value="">No times left. Please call us.</option>}
              {Object.entries(byDay).map(([day, list]) => (
                <optgroup key={day} label={day}>
                  {list.map((s) => <option key={s.iso} value={s.iso}>{s.iso === slots[0].iso ? `Next available, ${s.time}` : s.time}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field id="co-note" label="Note for the kitchen" optional full>
            <textarea className="input" id="co-note" rows={2} maxLength={300} value={c.kitchenNote} onChange={(e) => cart.setKitchenNote(e.target.value)} placeholder="Less spicy, extra chutney, no onion…" />
          </Field>
        </div>
      </Section>

      <Section eyebrow="Payment" title="Pay securely" sectionRef={payRef}>
        <Summary c={c} subtotal={subtotal} deliveryFee={deliveryFee} total={total} />
        {config.payments === 'stripe' && (
          <div className="field checkout__payment">
            <label className="field__label text-meta" htmlFor="co-card">Card</label>
            <div className="input checkout__card" id="co-card">
              <CardElement
                options={{
                  hidePostalCode: true,
                  style: {
                    base: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: '16px', color: token('--ink-primary'), '::placeholder': { color: token('--ink-secondary') } },
                    invalid: { color: token('--state-error') },
                  },
                }}
                onChange={(e: StripeCardElementChangeEvent) => {
                  setStripeCard({ complete: e.complete, error: e.error?.message });
                  if (errors.pay) setErrors((prev) => ({ ...prev, pay: undefined }));
                }}
              />
            </div>
            {stripeCard.error && <p className="field__error">{stripeCard.error}</p>}
          </div>
        )}
        {config.payments === 'off' && (
          <p className="checkout__hint text-body">Online payment isn't switched on yet. Call us on <a href={phoneHref}>{phone}</a> and we'll take your order over the phone.</p>
        )}
        {errors.pay && <p className="checkout__error" role="alert">{errors.pay}</p>}
        {/* Pay stays pressable while fields are missing, so pressing it says what is missing; it only locks while paying. */}
        <button type="submit" className="btn btn--primary checkout__pay" disabled={busy || config.payments === 'off'} aria-busy={busy || undefined}>
          {busy ? <><span className="spinner" aria-hidden="true" /> Confirming payment…</> : `Pay ${money(total)}`}
        </button>
        <p className="checkout__fine text-body-sm">Prices include GST. Questions about your order? Call <a href={phoneHref}>{phone}</a>.</p>
      </Section>

    </form>
  );
}

class PayError extends Error {}

function Section({ eyebrow, title, children, sectionRef }: { eyebrow: string; title: string; children: ReactNode; sectionRef?: RefObject<HTMLElement | null> }) {
  const id = `co-${eyebrow.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section className="checkout__section" aria-labelledby={id} ref={sectionRef}>
      <p className="eyebrow text-meta">{eyebrow}</p>
      <h2 className="text-heading-md" id={id}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ id, label, error, help, optional, full, children }: { id: string; label: string; error?: string; help?: string; optional?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <div className={`field${full ? ' field--full' : ''}`}>
      <label className="field__label text-meta" htmlFor={id}>
        {label}
        {optional && <span className="field__optional"> (optional)</span>}
      </label>
      {children}
      {help && !error && <p className="field__help" id={`${id}-help`}>{help}</p>}
      {error && <p className="field__error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

function Summary({ c, subtotal, deliveryFee, total }: { c: cart.Cart; subtotal: number; deliveryFee: number; total: number }) {
  const n = cart.count(c);
  return (
    <details className="summary" open>
      <summary className="summary__toggle">
        <span>Your order · {n} {n === 1 ? 'item' : 'items'}</span>
        <span className="text-tabular">{money(total)}</span>
      </summary>
      <ul className="summary__lines" role="list">
        {c.lines.map((l) => (
          <li key={l.key}>
            <span>{l.qty} × {l.name}{l.variantLabels.length > 0 && <span className="summary__meta"> · {l.variantLabels.join(', ')}</span>}</span>
            <span className="text-tabular">{money(l.unitPrice * l.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="cart__totals">
        <div><dt>Subtotal</dt><dd className="text-tabular">{money(subtotal)}</dd></div>
        {deliveryFee > 0 && <div><dt>Delivery</dt><dd className="text-tabular">{money(deliveryFee)}</dd></div>}
        {total !== subtotal + deliveryFee && <div><dt>Restaurant pricing</dt><dd className="text-tabular">{total > subtotal + deliveryFee ? '' : '−'}{money(Math.abs(total - subtotal - deliveryFee))}</dd></div>}
        <div className="cart__grand"><dt>Total</dt><dd className="text-tabular">{money(total)}</dd></div>
      </dl>
      <a className="btn btn--tertiary summary__edit" href="/cart/">Edit basket</a>
    </details>
  );
}

/**
 * The card was charged but the order has not reached the POS. Tries again on its own when shown, then offers a
 * button. It never takes a new payment: it places the order for the payment already made.
 */
function Unfinished({ sf, pending, phone, phoneHref }: { sf: pos.Storefront; pending: Pending; phone: string; phoneHref: string }) {
  const [state, setState] = useState<'trying' | 'failed'>('trying');
  const attempt = () => {
    setState('trying');
    finishOrder(sf, pending).then((ok) => !ok && setState('failed'));
  };
  useEffect(attempt, []);
  return (
    <div className="checkout__unfinished" role="status" aria-live="polite">
      <p className="eyebrow text-meta">Payment received</p>
      <h2 className="text-heading-lg">{state === 'trying' ? 'Sending your order to the kitchen…' : "Your order hasn't reached our kitchen yet"}</h2>
      <p className="text-body">
        We've received your payment of {money(pending.total)}. {state === 'trying' ? 'This only takes a moment.' : "Try again, or call us and we'll sort it right away. You won't be charged again."}
      </p>
      <p className="text-body-sm">Reference {pending.ref}</p>
      {state === 'failed' && (
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={attempt}>Try again</button>
          <a className="btn btn--secondary" href={phoneHref}>Call {phone}</a>
        </div>
      )}
    </div>
  );
}
