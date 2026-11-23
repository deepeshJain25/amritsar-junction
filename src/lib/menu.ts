import { menu as printedMenu } from '../content/menu';
import { sectionCopy } from '../content/menu-sections';
import { fetchMenu, type ApiMenuItem } from './storefront';

export interface Dish {
  id: number;
  name: string;
  desc: string;
  veg: boolean;
  options?: string;
  /** Display price, e.g. "$18.99". Missing when the POS price is zero. */
  price?: string;
  /** Plain number for structured data, e.g. "18.99". */
  amount?: string;
  /** Size choices from the POS, cheapest first. When present, `price` reads "From $x". */
  sizes?: { name: string; price: string }[];
  /** Whether the POS allows this item to be ordered online. */
  purchasable: boolean;
}

export interface Chapter {
  id: string;
  categoryId: number;
  kicker: string;
  title: string;
  deck?: string;
  items: Dish[];
}

const ORDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five'];

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The API has no vegetarian flag yet, so it is worked out from the category and dish name.
// Replace this with the API's own field as soon as the backend adds one: a wrong "Veg" tag is a dietary risk.
const NON_VEG_CATEGORY = /non[\s-]?veg|seafood/i;
const NON_VEG_WORDS = /\b(chicken|murg|lamb|goat|mutton|keema|fish|prawns?|egg|nuggets?|tangri)\b/i;
const isVeg = (item: ApiMenuItem, category: string) => !NON_VEG_CATEGORY.test(category) && !NON_VEG_WORDS.test(item.name);

// The POS puts choices in the name ("Butter Chicken - Bone/Boneless"). Show them as an options tag instead.
// Names listing what comes together ("Naan Basket - Roti + Naan + …") are left whole.
function splitName(name: string): { name: string; options?: string } {
  const m = name.match(/^(.+?)\s+-\s+([^+]+\/[^+]+)$/);
  return m ? { name: m[1], options: m[2].split('/').map((s) => s.trim()).join(' · ') } : { name };
}

const money = (n: number) => `$${n.toFixed(2)}`;

// Descriptions written for the printed menu card (src/content/menu.ts), used when the POS has none for a dish.
// Matched by name, ignoring case and punctuation; the POS description always wins when it has one.
const key = (s: string) => slug(s).replace(/-/g, '');
const printedDesc = new Map(
  printedMenu.flatMap((s) => s.dishes).filter((d) => d.desc).map((d) => [key(d.name), d.desc!] as const),
);

function toDish(item: ApiMenuItem, category: string): Dish {
  const sizes = item.size_options
    .map((s) => ({ name: s.size_tier_name, n: Number(s.price) }))
    .filter((s) => s.n > 0)
    .sort((a, b) => a.n - b.n);
  const n = sizes.length ? sizes[0].n : Number(item.price);
  const named = splitName(item.name.trim());
  return {
    id: item.id,
    ...named,
    desc: item.description.trim() || printedDesc.get(key(named.name)) || printedDesc.get(key(item.name)) || '',
    veg: isVeg(item, category),
    price: n > 0 ? (sizes.length > 1 ? `From ${money(n)}` : money(n)) : undefined,
    amount: n > 0 ? n.toFixed(2) : undefined,
    sizes: sizes.length ? sizes.map((s) => ({ name: s.name, price: s.n.toFixed(2) })) : undefined,
    purchasable: item.is_purchasable,
  };
}

/** The menu as chapters, in the order set by menu-sections.ts, with empty categories left out. */
export async function getMenu(): Promise<Chapter[]> {
  const { categories, items } = await fetchMenu();
  const order = Object.keys(sectionCopy);
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);

  return categories
    .filter((c) => c.is_active)
    .map((c) => ({ c, dishes: items.filter((i) => i.category === c.id && i.is_active) }))
    .filter(({ dishes }) => dishes.length > 0)
    .sort((a, b) => rank(a.c.name) - rank(b.c.name))
    .map(({ c, dishes }, i) => ({
      id: slug(c.name),
      categoryId: c.id,
      kicker: `Chapter ${ORDINALS[i] ?? i + 1}`,
      title: c.name,
      deck: sectionCopy[c.name],
      items: dishes.map((d) => toDish(d, c.name)),
    }));
}
