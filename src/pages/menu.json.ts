import type { APIRoute } from 'astro';
import { RESTAURANT_ID } from 'astro:env/server';
import { getMenu } from '../lib/menu';

// /menu.json: the menu as fetched from the POS storefront API at build time, in the same
// order and shape the menu page uses. Handy for checking what the API returned, or for other tools.
export const GET: APIRoute = async () => {
  const chapters = await getMenu();
  const body = {
    restaurant_id: RESTAURANT_ID,
    generated_at: new Date().toISOString(),
    category_count: chapters.length,
    item_count: chapters.reduce((n, c) => n + c.items.length, 0),
    categories: chapters.map((c) => ({
      id: c.categoryId,
      slug: c.id,
      name: c.title,
      intro: c.deck ?? null,
      items: c.items.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.desc || null,
        price: d.amount ? Number(d.amount) : null,
        currency: 'AUD',
        sizes: (d.sizes ?? []).map((s) => ({ name: s.name, price: Number(s.price) })),
        options: d.options ? d.options.split(' · ') : [],
        vegetarian: d.veg,
        purchasable: d.purchasable,
      })),
    })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
