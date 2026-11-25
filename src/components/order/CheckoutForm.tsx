import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import type { Stripe, StripeElements, StripeElementsOptions } from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { ordering, type FulfilmentType } from '../../content/ordering';
import { fieldError, type ApiError, type ConfigResponse, type IntentRequest, type IntentResponse } from '../../lib/order/api';
import { money } from '../../lib/order/catalog';
import * as cart from '../../lib/order/cart';
import { slotsFor, type Slot } from '../../lib/order/slots';
import { track } from '../../lib/order/track';
import MockCard, { cardErrors, cardOutcome, EMPTY_CARD, type MockCardField, type MockCardValue } from './MockCard';

// The checkout: one page, three sections (Your details, When & where, Payment), then Pay.
// The Worker prices the order; the totals here are a preview from the basket.
// Payment is Stripe's Payment Element (cards, Apple Pay, Google Pay) when keys are set, a mock panel for local
// testing, or a "call us" note when online payment is not set up.

interface Props {
  phone: string;
  phoneHref: string;
}

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
    if (saved && Date.now() - saved.at < FORM_TTL) return { ...EMPTY, ...saved.fields, slot: '' };
  } catch {
    /* storage blocked */
  }
  return EMPTY;
}

const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined;

export default function CheckoutForm({ phone, phoneHref }: Props) {
  const c = useCart();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((cfg: ConfigResponse) => {
        // Stripe without a publishable key cannot take a card, so it counts as off.
        if (cfg.payments === 'stripe' && !cfg.stripePublishableKey) return setConfig({ payments: 'off' });
        if (cfg.payments === 'stripe') setStripePromise(loadStripe(cfg.stripePublishableKey!));
        setConfig(cfg);
      })
      .catch(() => setConfig({ payments: 'off' }));
    cart
      .loadCatalog()
      .then((catalog) => {
        const { repriced, removed } = cart.revalidate(catalog);
        setNotice([repriced && "We've updated prices to match today's menu.", removed.length > 0 && `${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} no longer available and ${removed.length === 1 ? 'was' : 'were'} removed.`].filter(Boolean).join(' '));
      })
      .catch(() => {});
    if (cart.count()) track('checkout_started', { value: cart.subtotal() / 100 });
  }, []);

  if (!c.lines.length) {
    return (
      <div className="cart-empty">
        <p className="text-script cart-empty__welcome"><span lang="pa">ਜੀ ਆਇਆਂ ਨੂੰ</span> · Welcome</p>
        <p className="text-heading-md">Your basket is empty. Start with a kulcha.</p>
        <a className="btn btn--primary" href="/menu">Browse the menu</a>
      </div>
    );
  }
  if (!config) return <p className="text-body checkout__loading">Loading checkout…</p>;

  const props = { c, config, phone, phoneHref, notice };
  if (config.payments !== 'stripe' || !stripePromise) return <CheckoutInner {...props} stripe={null} elements={null} />;

  // The Payment Element is shown before the order exists, so Elements starts from the amount alone ("deferred intent").
  const options: StripeElementsOptions = {
    mode: 'payment',
    amount: Math.max(50, cart.subtotal(c)),
    currency: 'aud',
    fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400..600&display=swap' }],
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: token('--brand-maroon'),
        colorBackground: token('--surface-raised'),
        colorText: token('--ink-primary'),
        colorTextSecondary: token('--ink-secondary'),
        colorDanger: token('--state-error'),
        fontFamily: 'Inter, system-ui, sans-serif',
        borderRadius: '8px',
      },
    },
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
  config: ConfigResponse;
  phone: string;
  phoneHref: string;
  notice: string;
  stripe: Stripe | null;
  elements: StripeElements | null;
}

function CheckoutInner({ c, config, phone, phoneHref, notice, stripe, elements }: InnerProps) {
  const [f, setF] = useState<Fields>(loadFields);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields | 'pay', string>>>({});
  const [busy, setBusy] = useState(false);
  // Mock mode only. Card details stay in this component and are never sent anywhere.
  const [card, setCard] = useState<MockCardValue>(EMPTY_CARD);
  const [cardErr, setCardErr] = useState<Partial<Record<MockCardField, string>>>({});
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
  const total = subtotal + deliveryFee;
  const belowMinimum = f.type === 'delivery' && subtotal < ordering.delivery.minCents;

  // Keep Stripe's wallets (Apple Pay, Google Pay) showing the right amount.
  useEffect(() => {
    elements?.update({ amount: total });
  }, [elements, total]);

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
    if (config.payments === 'mock') {
      const bad = cardErrors(card);
      setCardErr(bad);
      const first = Object.keys(bad)[0];
      if (first) return void document.getElementById(`mc-${first}`)?.focus();
    }
    setBusy(true);
    setErrors({});
    try {
      if (elements) {
        const { error } = await elements.submit();
        if (error) throw new PayError(error.message ?? 'Check your payment details.');
      }
      const body: IntentRequest = {
        cartId: c.cartId,
        lines: c.lines.map((l) => ({ sku: l.sku, variantLabels: l.variantLabels, qty: l.qty, note: l.note })),
        contact: { name: f.name, phone: f.phone },
        fulfilment: { type: f.type, slot: slot.iso, ...(f.type === 'delivery' ? { address: { line1: f.line1, suburb: f.suburb, postcode: '' } } : {}) },
        kitchenNote: c.kitchenNote,
      };
      const res = await fetch('/api/checkout/intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json()) as IntentResponse & ApiError;
      if (res.status === 409 && data.orderId) return void location.assign(`/order/${data.orderId}`);
      if (!res.ok) {
        if (data.field) {
          setErrors({ [data.field]: data.error });
          document.getElementById(`co-${data.field}`)?.focus();
          track('checkout_failed', { reason: data.field });
          return;
        }
        throw new PayError(data.error);
      }

      if (data.mock) {
        const r = await fetch(`/api/dev/mock-pay/${data.orderId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: cardOutcome(card) }) });
        if (!r.ok) throw new PayError(((await r.json()) as ApiError).error);
      } else if (stripe && elements && data.clientSecret) {
        const { error } = await stripe.confirmPayment({
          elements,
          clientSecret: data.clientSecret,
          confirmParams: { return_url: `${location.origin}/order/${data.orderId}` },
          redirect: 'if_required',
        });
        if (error) throw new PayError(error.message ?? 'Your card was not charged. Try another card, or call us.');
      }
      try {
        sessionStorage.removeItem(FORM_STORE);
      } catch {
        /* storage blocked */
      }
      location.assign(`/order/${data.orderId}`);
    } catch (err) {
      const message = err instanceof PayError ? err.message : 'We could not reach the payment service. Check your connection and try again.';
      setErrors({ pay: message });
      track('checkout_failed', { reason: 'payment' });
      payRef.current?.scrollIntoView({ block: 'center' });
    } finally {
      setBusy(false);
    }
  }

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

      <Section eyebrow="When & where" title="Pickup or delivery?">
        <div className="segmented" role="radiogroup" aria-label="Pickup or delivery" id="co-type">
          {(['pickup', 'delivery'] as const).map((t) => (
            <label key={t} className="segmented__option">
              <input type="radio" name="type" value={t} checked={f.type === t} onChange={() => setF((prev) => ({ ...prev, type: t, slot: '' }))} />
              <span>{t === 'pickup' ? 'Pickup' : `Delivery · ${money(ordering.delivery.feeCents)}`}</span>
            </label>
          ))}
        </div>
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
        {config.payments === 'stripe' && <div className="checkout__payment"><PaymentElement options={{ layout: 'tabs' }} /></div>}
        {config.payments === 'mock' && (
          <MockCard
            value={card}
            errors={cardErr}
            onChange={(v) => {
              setCard(v);
              // Clear an error as soon as the field is fixed.
              setCardErr((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => cardErrors(v)[k as MockCardField])));
            }}
            onBlur={(k) => card[k] && setCardErr((prev) => ({ ...prev, [k]: cardErrors(card)[k] }))}
          />
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

      {/* Phones: the total and Pay stay in reach; the button scrolls to the payment section, where Stripe's field lives. */}
      <div className="checkout__bar surface-raised">
        <span className="text-tabular"><span className="text-meta">Total</span> {money(total)}</span>
        <button type="button" className="btn btn--primary" onClick={() => payRef.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}>Pay</button>
      </div>
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
        <div className="cart__grand"><dt>Total</dt><dd className="text-tabular">{money(total)}</dd></div>
      </dl>
      <a className="btn btn--tertiary summary__edit" href="/cart">Edit basket</a>
    </details>
  );
}
