// The orderable catalog: every dish with a price, a stable sku, and its size or style choices.
// Built from the menu at build time (src/pages/catalog.json.ts) and read by the cart in the browser
// and by the ordering Worker, which prices every order from it so the browser never sets a total.
import type { Chapter, Dish } from '../menu';

export interface VariantOption {
  label: string;
  /** Price in cents when this choice sets the price (sizes). Style choices leave it out. */
  price?: number;
  /** The POS item to order for this choice, when it differs from the dish's own. */
  posId?: number;
}

export interface VariantGroup {
  name: 'Size' | 'Style';
  required: boolean;
  options: VariantOption[];
}

export interface CatalogItem {
  sku: string;
  name: string;
  chapter: string;
  description?: string;
  veg: boolean;
  /** Price in cents. A dish with a Size group takes its price from the chosen size. */
  price: number;
  posId: number;
  variants?: VariantGroup[];
  available: boolean;
}

export interface Catalog {
  generatedAt: string;
  currency: 'AUD';
  items: CatalogItem[];
}

const cents = (s: string | number) => Math.round(Number(s) * 100);

/** A dish as an orderable item, or undefined when it has no price (the POS has some at $0) and cannot be ordered online. */
export function toCatalogItem(d: Dish, chapter: string): CatalogItem | undefined {
  if (!d.amount) return undefined;
  const variants: VariantGroup[] = [];
  if (d.sizes && d.sizes.length > 1) {
    variants.push({ name: 'Size', required: true, options: d.sizes.map((s) => ({ label: s.name, price: cents(s.price), posId: s.id })) });
  }
  if (d.options) {
    variants.push({ name: 'Style', required: true, options: d.options.split(' · ').map((label) => ({ label })) });
  }
  // A single size is the dish's only price, and the POS takes the size's own id.
  const single = d.sizes?.length === 1 ? d.sizes[0] : undefined;
  return {
    sku: d.sku,
    name: d.name,
    chapter,
    description: d.desc || undefined,
    veg: d.veg,
    price: cents(single?.price ?? d.amount),
    posId: single?.id ?? d.id,
    variants: variants.length ? variants : undefined,
    available: true,
  };
}

export function toCatalog(chapters: Chapter[]): Catalog {
  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  for (const c of chapters) {
    for (const d of c.items) {
      const item = toCatalogItem(d, c.id);
      if (!item) continue;
      if (seen.has(item.sku)) throw new Error(`Two dishes share the sku "${item.sku}". Rename one in the POS.`);
      seen.add(item.sku);
      items.push(item);
    }
  }
  return { generatedAt: new Date().toISOString(), currency: 'AUD', items };
}

export interface ResolvedLine {
  unitPrice: number;
  posId: number;
  /** The chosen labels in group order, e.g. ["Half"] or ["Bone"]. */
  labels: string[];
}

/** Works out the price and POS item for a dish and its chosen labels, or explains what is wrong. */
export function resolveLine(item: CatalogItem, labels: string[]): ResolvedLine | { error: string } {
  const groups = item.variants ?? [];
  if (labels.length !== groups.length) return { error: `Choose ${groups.map((g) => g.name.toLowerCase()).join(' and ')} for ${item.name}.` };
  let unitPrice = item.price;
  let posId = item.posId;
  for (const [i, g] of groups.entries()) {
    const opt = g.options.find((o) => o.label === labels[i]);
    if (!opt) return { error: `${labels[i]} is not a choice for ${item.name}.` };
    if (opt.price !== undefined) unitPrice = opt.price;
    if (opt.posId !== undefined) posId = opt.posId;
  }
  return { unitPrice, posId, labels };
}

/** The lowest price a dish can be ordered at, for "From $x" labels. */
export const fromPrice = (item: CatalogItem) =>
  Math.min(item.price, ...(item.variants ?? []).flatMap((g) => g.options.map((o) => o.price ?? item.price)));

export const money = (c: number) => `$${(c / 100).toFixed(2)}`;
