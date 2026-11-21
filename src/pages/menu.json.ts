import type { APIRoute } from 'astro';
import { getMenu } from '../lib/menu';

// /menu.json: the menu from src/content/menu.ts, in the same order and shape the menu page uses. Handy for other tools.
export const GET: APIRoute = async () => {
  const chapters = await getMenu();
  const body = {
    generated_at: new Date().toISOString(),
    category_count: chapters.length,
    item_count: chapters.reduce((n, c) => n + c.items.length, 0),
    categories: chapters.map((c) => ({
      slug: c.id,
      name: c.title,
      intro: c.deck ?? null,
      items: c.items.map((d) => ({
        name: d.name,
        description: d.desc || null,
        price: d.amount ? Number(d.amount) : null,
        currency: 'AUD',
        sizes: (d.sizes ?? []).map((s) => ({ name: s.name, price: Number(s.price) })),
        options: d.options ? d.options.split(' · ') : [],
        vegetarian: d.veg,
      })),
    })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
