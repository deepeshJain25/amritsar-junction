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

// The API has no vegetarian flag yet, so it is worked out from the category and dish name.
// Replace this with the API's own field as soon as the backend adds one: a wrong "Veg" tag is a dietary risk.
const NON_VEG_CATEGORY = /non[\s-]?veg|seafood/i;
const NON_VEG_WORDS = /\b(chicken|murg|lamb|goat|mutton|keema|fish|prawns?|egg|nuggets?|tangri)\b/i;
const isVeg = (item: ApiMenuItem, category: string) => !NON_VEG_CATEGORY.test(category) && !NON_VEG_WORDS.test(item.name);

// The POS puts choices in the name ("Butter Chicken - Bone/Boneless"). Show them as an options tag instead.
function splitName(name: string): { name: string; options?: string } {
  const m = name.match(/^(.+?)\s+-\s+(.+\/.+)$/);
  return m ? { name: m[1], options: m[2].split('/').map((s) => s.trim()).join(' · ') } : { name };
}

function toDish(item: ApiMenuItem, category: string): Dish {
  const n = Number(item.price);
  return {
    id: item.id,
    ...splitName(item.name.trim()),
    desc: item.description.trim(),
    veg: isVeg(item, category),
    price: n > 0 ? `$${n.toFixed(2)}` : undefined,
    amount: n > 0 ? n.toFixed(2) : undefined,
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
      kicker: `Chapter ${ORDINALS[i] ?? i + 1}`,
      title: c.name,
      deck: sectionCopy[c.name],
      items: dishes.map((d) => toDish(d, c.name)),
    }));
}
