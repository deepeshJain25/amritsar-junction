import { menu, type MenuDish } from '../content/menu';

export interface Dish {
  name: string;
  desc: string;
  veg: boolean;
  options?: string;
  /** Display price, e.g. "$18.99", or "From $16.99" when the dish has sizes. */
  price?: string;
  /** Plain number for structured data, e.g. "18.99". */
  amount?: string;
  /** Size choices, cheapest first. */
  sizes?: { name: string; price: string }[];
}

export interface Chapter {
  id: string;
  kicker: string;
  title: string;
  deck?: string;
  items: Dish[];
}

const ORDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const money = (n: number) => `$${n.toFixed(2)}`;

function toDish(d: MenuDish, sectionVeg: boolean): Dish {
  const sizes = (d.sizes ?? []).map(([name, n]) => ({ name, n })).sort((a, b) => a.n - b.n);
  const n = sizes.length ? sizes[0].n : d.price;
  return {
    name: d.name,
    desc: d.desc ?? '',
    veg: d.veg ?? sectionVeg,
    options: d.options?.join(' · '),
    price: n ? (sizes.length > 1 ? `From ${money(n)}` : money(n)) : undefined,
    amount: n ? n.toFixed(2) : undefined,
    sizes: sizes.length ? sizes.map((s) => ({ name: s.name, price: s.n.toFixed(2) })) : undefined,
  };
}

/** The menu as chapters, in the order of src/content/menu.ts. */
export async function getMenu(): Promise<Chapter[]> {
  return menu.map((s, i) => ({
    id: slug(s.title),
    kicker: `Chapter ${ORDINALS[i] ?? i + 1}`,
    title: s.title,
    deck: s.deck,
    items: s.dishes.map((d) => toDish(d, s.veg)),
  }));
}
