import { RESTAURANT_ID, STOREFRONT_API_URL } from 'astro:env/server';

// Read-only client for the POS storefront API. Pages call it at build time, so the
// whole menu lands in the static HTML for search engines. A failed request fails the
// build rather than publishing an empty menu.

export interface ApiCategory {
  id: number;
  name: string;
  tax_rate: string;
  is_active: boolean;
}

export interface ApiMenuItem {
  id: number;
  category: number;
  name: string;
  price: string;
  description: string;
  image_url: string | null;
  is_active: boolean;
  is_purchasable: boolean;
  is_custom_price: boolean;
  item_type: 'STANDARD' | 'BUNDLE';
  size_options: { id: number; size_tier_id: number; size_tier_name: string; price: string }[];
  modifier_groups: unknown[];
  recipe_ingredients: unknown[];
  bundle_slots: unknown[];
}

async function get<T>(path: string): Promise<T> {
  const url = new URL(`${STOREFRONT_API_URL.replace(/\/$/, '')}/storefront/${path}`);
  url.searchParams.set('restaurant_id', RESTAURANT_ID);
  url.searchParams.set('nocache', 'true');
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Storefront API ${url.pathname} returned ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

let cached: Promise<{ categories: ApiCategory[]; items: ApiMenuItem[] }> | undefined;

/** Categories and items for this restaurant, fetched once per build. */
export function fetchMenu() {
  cached ??= Promise.all([get<ApiCategory[]>('menu/categories/'), get<ApiMenuItem[]>('menu/items/')]).then(
    ([categories, items]) => {
      if (!items.length) throw new Error(`Storefront API returned no menu items for restaurant ${RESTAURANT_ID}`);
      return { categories, items };
    },
  );
  return cached;
}
