// The basket, kept in this browser only (localStorage "aj.cart.v1") and shared by every page and tab.
// There are no accounts: a basket left alone for a week is emptied, and a placed order starts a new one.
import { ordering } from '../../content/ordering';
import type { Catalog } from './catalog';
import { resolveLine } from './catalog';

export interface CartLine {
  /** sku, chosen labels and note: one line per dish, choice and note. */
  key: string;
  sku: string;
  name: string;
  variantLabels: string[];
  /** Cents, as shown when added; refreshed from the catalog before checkout. The server reprices anyway. */
  unitPrice: number;
  qty: number;
  /** For the kitchen about this dish, from the choice sheet. */
  note?: string;
}

export interface Cart {
  v: 1;
  /** Ties retries of one checkout to one order and one payment. Renewed once an order is placed. */
  cartId: string;
  updatedAt: number;
  lines: CartLine[];
  kitchenNote: string;
}

const STORE = 'aj.cart.v1';
const EXPIRY = ordering.cartExpiryDays * 86_400_000;
const listeners = new Set<(cart: Cart) => void>();

const fresh = (): Cart => ({ v: 1, cartId: crypto.randomUUID(), updatedAt: Date.now(), lines: [], kitchenNote: '' });

function read(): Cart {
  try {
    const cart = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Cart | null;
    if (cart?.v === 1 && Date.now() - cart.updatedAt < EXPIRY) return cart;
  } catch {
    /* storage blocked or corrupt: start empty */
  }
  return fresh();
}

let current = typeof window === 'undefined' ? fresh() : read();

function write(next: Cart) {
  current = { ...next, updatedAt: Date.now() };
  try {
    localStorage.setItem(STORE, JSON.stringify(current));
  } catch {
    /* private mode: the basket still works until the tab closes */
  }
  listeners.forEach((fn) => fn(current));
}

if (typeof window !== 'undefined') {
  // Another tab changed the basket.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE) return;
    current = read();
    listeners.forEach((fn) => fn(current));
  });
}

export const lineKey = (sku: string, labels: string[], note = '') => [sku, ...labels, note.trim()].join('|');
export const getCart = () => current;
export const count = (cart = current) => cart.lines.reduce((n, l) => n + l.qty, 0);
export const subtotal = (cart = current) => cart.lines.reduce((n, l) => n + l.unitPrice * l.qty, 0);
export const qtyOf = (sku: string, cart = current) => cart.lines.filter((l) => l.sku === sku).reduce((n, l) => n + l.qty, 0);

export function subscribe(fn: (cart: Cart) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function add(line: Omit<CartLine, 'key' | 'qty'>, qty = 1) {
  const key = lineKey(line.sku, line.variantLabels, line.note);
  const lines = [...current.lines];
  const i = lines.findIndex((l) => l.key === key);
  if (i >= 0) lines[i] = { ...lines[i], qty: Math.min(ordering.maxQtyPerLine, lines[i].qty + qty) };
  else lines.push({ ...line, key, qty: Math.min(ordering.maxQtyPerLine, qty) });
  write({ ...current, lines });
}

export function setQty(key: string, qty: number) {
  const lines = current.lines
    .map((l) => (l.key === key ? { ...l, qty: Math.min(ordering.maxQtyPerLine, Math.max(0, qty)) } : l))
    .filter((l) => l.qty > 0);
  write({ ...current, lines });
}

export const remove = (key: string) => setQty(key, 0);

/** Takes one off the most recently added line of a dish, for the steppers on menu cards. */
export function removeOne(sku: string) {
  const line = [...current.lines].reverse().find((l) => l.sku === sku);
  if (line) setQty(line.key, line.qty - 1);
}

export const setKitchenNote = (kitchenNote: string) => write({ ...current, kitchenNote });

/** Empties the basket and starts a new checkout, after an order has gone through. */
export const clear = () => write(fresh());

/**
 * Brings names and prices up to date with today's catalog and drops dishes no longer on it.
 * Returns what changed, so the basket can say so.
 */
export function revalidate(catalog: Catalog): { repriced: boolean; removed: string[] } {
  const bySku = new Map(catalog.items.map((i) => [i.sku, i]));
  const removed: string[] = [];
  let repriced = false;
  const lines: CartLine[] = [];
  for (const l of current.lines) {
    const item = bySku.get(l.sku);
    const resolved = item?.available ? resolveLine(item, l.variantLabels) : undefined;
    if (!item || !resolved || 'error' in resolved) {
      removed.push(l.name);
      continue;
    }
    if (resolved.unitPrice !== l.unitPrice) repriced = true;
    lines.push({ ...l, name: item.name, unitPrice: resolved.unitPrice });
  }
  if (repriced || removed.length) write({ ...current, lines });
  return { repriced, removed };
}

let catalogPromise: Promise<Catalog> | undefined;
/** The catalog built with this version of the site, fetched once per page. */
export const loadCatalog = () => (catalogPromise ??= fetch('/catalog.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`catalog ${r.status}`)))));
