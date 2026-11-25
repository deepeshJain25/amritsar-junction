# Online ordering

Pickup and delivery ordering with Stripe, built to the PRD *Native Cart & Checkout*. Guest checkout only: no accounts and no order history.

## How it fits together

| Piece | Where | What it does |
|---|---|---|
| Catalog | `src/lib/order/catalog.ts`, built to `/catalog.json` | Every dish with a price: sku, price in cents, size/style choices, POS item id. Built from the POS menu with the site. |
| Basket | `src/lib/order/cart.ts` | Lives in the browser (`localStorage` `aj.cart.v1`), emptied after 7 days or once an order goes through. |
| Ordering UI | `src/lib/order/ui.ts`, `components/order/OrderUI.astro` | Add buttons and steppers on menu cards, the choice sheet, the toast, the header badge, the cart drawer (768px and up). |
| Pages | `src/pages/cart.astro`, `checkout.astro`, `order.astro` | `/cart`, `/checkout` (React + Stripe Payment Element), `/order/<id>` (waiting, success or error). |
| Settings | `src/content/ordering.ts` | Kitchen hours, prep time, slot length, delivery suburbs, fee and minimum. Shared by the pages and the Worker. |
| Worker | `worker/index.ts` | `/api/*` and `/order/*`. Prices the order from the catalog, creates the Stripe PaymentIntent, takes Stripe's webhook, stores orders in D1 and sends paid ones to the POS. |
| Database | `migrations/0001_orders.sql` | One `orders` table in Cloudflare D1. |

The browser never sets a price: the Worker reprices every order from `/catalog.json`.

### Sending orders to the kitchen

Once Stripe confirms a payment, the Worker places the order in the POS (`POST /storefront/common-auth/`, then `POST /storefront/checkout/`) so the kitchen gets a docket. The docket's notes say `PAID ONLINE $x, do not charge`, along with the pickup or delivery time and the web order number. Each dish's size or style is in that dish's note, because the POS names a sized dish without its size. A size is ordered by sending the size's own id as `menu_item_id`. If the POS cannot be reached, the Worker retries up to 3 times. After that, the customer is asked to call, and the order stays in D1 with `pos_error` set.

## Try it locally

```sh
cp .dev.vars.example .dev.vars        # mock payments on, POS hand-off off
npm run build
npx wrangler d1 migrations apply amritsar-junction-orders --local
npx wrangler dev                      # http://localhost:8787
```

`npm run dev` (Astro on its own) shows the basket but has no `/api`, so checkout says online payment is not set up. Use `wrangler dev` to test checkout.

With no Stripe secret key and `MOCK_PAYMENTS=true`, checkout shows a test panel where you pick what happens: success, a declined card, or a slow payment.

To use real Stripe test payments, add the keys to `.dev.vars`, then run `stripe listen --forward-to localhost:8787/api/webhooks/stripe` and put the `whsec_…` secret it prints in `STRIPE_WEBHOOK_SECRET`. Test card: `4242 4242 4242 4242`.

## Going live (one-off)

1. `npx wrangler login`
2. `npx wrangler d1 create amritsar-junction-orders`, then paste the printed id into `wrangler.jsonc`.
3. `npx wrangler d1 migrations apply amritsar-junction-orders --remote`
4. `npx wrangler secret put STRIPE_SECRET_KEY`, and the same for `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET`.
5. In the Stripe dashboard, add a webhook endpoint for `https://<domain>/api/webhooks/stripe` with the events `payment_intent.succeeded`, `payment_intent.payment_failed` and `payment_intent.processing`.
6. Point `STOREFRONT_API_URL` in `wrangler.jsonc` at the production POS when it exists.

Deploy with Workers Builds (push to `main`) or `npx wrangler deploy`. `npm run deploy` uses `deploy/`, which publishes the static site only, without the Worker, so ordering would not work through it.

## Still to settle

- **Kitchen hours:** the hours in `src/content/ordering.ts` come from the placeholder hours in `site.json`.
- **Delivery:** the suburbs, the $6.99 fee and the $35 minimum are suggested defaults. The POS adds its own $5.00 for delivery when it prices an order. Our charge is what the customer pays; the POS total on the docket may differ.
- **Email:** Stripe sends receipts in live mode only. Pickup-time emails (Resend or MailChannels), Wallet passes and an alert for stuck orders are not built yet.
- **Analytics:** events go to `window.dataLayer` and an `aj:track` DOM event (`src/lib/order/track.ts`) until a provider is chosen.

### Questions for the POS developers

1. **Paid elsewhere:** is there a `payment_method` that marks an order as already paid elsewhere? We send `MANUAL_CASH` (set by `POS_PAYMENT_METHOD`) and say "PAID ONLINE" in the notes, so the order shows as unpaid in the POS.
2. **`order_type`:** checkout ignores it. It comes back `null` for `pickup`, `PICKUP` and `delivery`.
3. **Validation:** checkout accepts an empty `items` list and any `payment_method` string, and creates an order from it.
4. **Purchasable flag:** all 171 items are `is_purchasable: false`, but checkout accepts them anyway. Which one is right?
5. **Order lookup:** is there an endpoint to fetch one order by id, for status updates (preparing, ready)? `GET /storefront/orders/` lists a customer's orders, with their token.
6. **Size on dockets:** can a dish's size appear on the docket? Today it is in the dish's note.
