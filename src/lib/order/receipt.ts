// What the browser remembers about an order while the POS has no order lookup for it:
//   pending: a card payment that succeeded but whose order has not reached the POS yet. Kept in localStorage,
//            so coming back to checkout (even after closing the tab) finishes the order instead of charging again.
//   receipt: the confirmed order, shown on /order/?ref=<ref>. Kept for this browser only.
import type { PricedOrder } from './api';

export interface Pending {
  ref: string;
  cartId: string;
  paymentIntentId: string;
  total: number;
  order: PricedOrder;
  at: number;
}

export interface Receipt {
  ref: string;
  posOrderId: number;
  firstName: string;
  lines: { name: string; variantLabels: string[]; note?: string; qty: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  fulfilment: { type: 'pickup' | 'delivery'; slot: string; address?: string };
  kitchenNote?: string;
  at: number;
}

const PENDING = 'aj.pending.v1';
const RECEIPTS = 'aj.receipts.v1';
/** A payment that has waited this long for its order is shown with the "call us" message instead. */
const PENDING_TTL = 24 * 60 * 60_000;

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the order still goes through, it just can't be resumed */
  }
}

export const savePending = (p: Pending) => write(PENDING, p);
export const clearPending = () => write(PENDING, null);
export function getPending(): Pending | null {
  const p = read<Pending>(PENDING);
  return p && Date.now() - p.at < PENDING_TTL ? p : null;
}

export function saveReceipt(r: Receipt) {
  const list = (read<Receipt[]>(RECEIPTS) ?? []).filter((x) => x.ref !== r.ref).slice(-9);
  write(RECEIPTS, [...list, r]);
}
export const getReceipt = (ref: string) => (read<Receipt[]>(RECEIPTS) ?? []).find((r) => r.ref === ref) ?? null;
