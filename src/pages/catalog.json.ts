import type { APIRoute } from 'astro';
import { getMenu } from '../lib/menu';
import { toCatalog } from '../lib/order/catalog';

// /catalog.json: every orderable dish with its sku, price in cents and choices, built with the menu page.
// The basket reads it to refresh prices, and the ordering Worker prices every order from it.
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(toCatalog(await getMenu())), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
