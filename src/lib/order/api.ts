// The contract between the checkout page and the ordering Worker, and the rules both sides check.
// The Worker prices every order itself from the catalog; the totals the page shows are a preview.
import { ordering, type FulfilmentType } from '../../content/ordering';
import { resolveLine, type Catalog } from './catalog';
import { isValidSlot } from './slots';

export interface Address {
  line1: string;
  suburb: string;
  postcode: string;
}

export interface IntentRequest {
  cartId: string;
  lines: { sku: string; variantLabels: string[]; qty: number; note?: string }[];
  contact: { name: string; phone: string };
  fulfilment: { type: FulfilmentType; slot: string; address?: Address };
  kitchenNote?: string;
}

export interface IntentResponse {
  orderId: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  /** For Stripe's confirmPayment. Missing in mock payment mode. */
  clientSecret?: string;
  mock?: boolean;
}

export interface ApiError {
  error: string;
  /** The form field the error belongs to, so the page can show it there. */
  field?: string;
  /** Set when the cart has already been paid for: the page goes to this order. */
  orderId?: string;
}

export interface ConfigResponse {
  /** "stripe" for real payments, "mock" for local testing without keys, "off" when not set up. */
  payments: 'stripe' | 'mock' | 'off';
  stripePublishableKey?: string;
}

export interface PricedLine {
  sku: string;
  name: string;
  variantLabels: string[];
  note?: string;
  qty: number;
  unitPrice: number;
  posId: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  contact: IntentRequest['contact'];
  fulfilment: IntentRequest['fulfilment'];
  kitchenNote?: string;
}

/** What the order page shows. Contact details stay on the server, apart from the first name. */
export interface OrderView {
  id: string;
  state: 'waiting' | 'success' | 'error';
  /** Why an order is in the error state. */
  reason?: 'payment_failed' | 'order_failed' | 'unpaid';
  firstName: string;
  lines: { name: string; variantLabels: string[]; note?: string; qty: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  fulfilment: { type: FulfilmentType; slot: string; address?: string };
  kitchenNote?: string;
  createdAt: string;
}

/* Field rules, shared so the page shows the same message the server would send. */

export const cleanPhone = (s: string) => s.replace(/[\s()-]/g, '');
/** Australian mobile or landline: 04xx xxx xxx, (02) xxxx xxxx, or with +61. */
export const isPhone = (s: string) => /^(?:\+?61|0)[2-478]\d{8}$/.test(cleanPhone(s));
export const findSuburb = (name: string) => ordering.delivery.suburbs.find((s) => s.name.toLowerCase() === name.trim().toLowerCase());

export function fieldError(field: string, value: string): string | undefined {
  switch (field) {
    case 'name':
      return value.trim().length < 2 ? 'Enter your name.' : undefined;
    case 'phone':
      return isPhone(value) ? undefined : 'Enter an Australian phone number, like 0412 345 678.';
    case 'line1':
      return value.trim().length < 4 ? 'Enter the street address.' : undefined;
    case 'suburb':
      return findSuburb(value) ? undefined : 'We only deliver to the suburbs listed. Choose pickup instead?';
    default:
      return undefined;
  }
}

/** Checks an order and prices it from the catalog. Never trusts a price or total from the browser. */
export function priceOrder(req: IntentRequest, catalog: Catalog, now = new Date()): PricedOrder | ApiError {
  if (!req || typeof req !== 'object') return { error: 'The order could not be read.' };
  if (typeof req.cartId !== 'string' || !/^[\w-]{8,64}$/.test(req.cartId)) return { error: 'The order could not be read.' };
  if (!Array.isArray(req.lines) || req.lines.length === 0) return { error: 'Your basket is empty.' };
  if (req.lines.length > 50) return { error: 'That is a very large order. Please call us to place it.' };

  const bySku = new Map(catalog.items.map((i) => [i.sku, i]));
  const lines: PricedLine[] = [];
  for (const l of req.lines) {
    const item = bySku.get(l?.sku);
    if (!item || !item.available) return { error: 'A dish in your basket is no longer on the menu. Open your basket to update it.' };
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > ordering.maxQtyPerLine) return { error: `Choose between 1 and ${ordering.maxQtyPerLine} of ${item.name}.` };
    const labels = Array.isArray(l.variantLabels) ? l.variantLabels.map(String) : [];
    const resolved = resolveLine(item, labels);
    if ('error' in resolved) return { error: resolved.error };
    const note = typeof l.note === 'string' ? l.note.trim().slice(0, 140) || undefined : undefined;
    lines.push({ sku: item.sku, name: item.name, variantLabels: labels, note, qty: l.qty, unitPrice: resolved.unitPrice, posId: resolved.posId });
  }

  const c = req.contact ?? ({} as IntentRequest['contact']);
  for (const [field, value] of [['name', c.name], ['phone', c.phone]] as const) {
    const err = fieldError(field, String(value ?? ''));
    if (err) return { error: err, field };
  }
  const contact = { name: c.name.trim().slice(0, 80), phone: cleanPhone(c.phone) };

  const f = req.fulfilment ?? ({} as IntentRequest['fulfilment']);
  if (f.type !== 'pickup' && f.type !== 'delivery') return { error: 'Choose pickup or delivery.', field: 'type' };
  if (f.type === 'delivery' && !ordering.delivery.enabled) return { error: "We don't deliver yet. Choose pickup.", field: 'type' };
  if (typeof f.slot !== 'string' || !isValidSlot(f.type, f.slot, now)) return { error: 'That time is no longer available. Choose another.', field: 'slot' };

  const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
  let fulfilment: PricedOrder['fulfilment'] = { type: f.type, slot: f.slot };
  let deliveryFee = 0;
  if (f.type === 'delivery') {
    const a = f.address ?? ({} as Address);
    for (const [field, value] of [['line1', a.line1], ['suburb', a.suburb]] as const) {
      const err = fieldError(field, String(value ?? ''));
      if (err) return { error: err, field };
    }
    if (subtotal < ordering.delivery.minCents) {
      return { error: `Delivery starts at $${ordering.delivery.minCents / 100} of food. Add a little more, or choose pickup.`, field: 'type' };
    }
    const suburb = findSuburb(a.suburb)!;
    fulfilment = { ...fulfilment, address: { line1: a.line1.trim().slice(0, 120), suburb: suburb.name, postcode: suburb.postcode } };
    deliveryFee = ordering.delivery.feeCents;
  }

  const kitchenNote = typeof req.kitchenNote === 'string' ? req.kitchenNote.trim().slice(0, 300) || undefined : undefined;
  return { lines, subtotal, deliveryFee, total: subtotal + deliveryFee, contact, fulfilment, kitchenNote };
}

export const formatAddress = (a: Address) => `${a.line1}, ${a.suburb} NSW ${a.postcode}`;
