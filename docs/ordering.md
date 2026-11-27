# Online ordering

Pickup and delivery ordering, paid by card through the restaurant's POS (which owns the Stripe account), built to the PRD *Native Cart & Checkout*. Guest checkout only: no accounts and no order history.

## How it fits together

| Piece | Where | What it does |
|---|---|---|
| Catalog | `src/lib/order/catalog.ts`, built to `/catalog.json` | Every dish with a price: sku, price in cents, size/style choices, POS item id. Built from the POS menu with the site. |
| Basket | `src/lib/order/cart.ts` | Lives in the browser (`localStorage` `aj.cart.v1`), emptied after 7 days or once an order goes through. |
| Ordering UI | `src/lib/order/ui.ts`, `components/order/OrderUI.astro` | Add buttons and steppers on menu cards, the choice sheet, the toast, the header badge, the cart drawer (768px and up). |
| Pages | `src/pages/cart.astro`, `checkout.astro`, `order.astro` | `/cart`, `/checkout` (React + Stripe's card field on the POS's Stripe account), `/order/<id>` (waiting, success or error). |
| Settings | `src/content/ordering.ts` | Kitchen hours, prep time, slot length, delivery suburbs, fee and minimum. Shared by the pages and the Worker. |
| Worker | `worker/index.ts`, `worker/pos.ts` | `/api/*` and `/order/*`. Checks the order against the catalog, has the POS price it and create the PaymentIntent, stores orders in D1 and places paid ones in the POS. |
| Database | `migrations/` | One `orders` table in Cloudflare D1. |

The browser never sets a price: the Worker checks every order against `/catalog.json`, and the POS prices it.

### Paying and sending orders to the kitchen

**For now the browser runs the whole payment**, the same flow as the internal `/order-test` page (`src/lib/order/storefront.ts`, called from `CheckoutForm.tsx`):

1. **Pay pressed:** the page checks the basket against `/catalog.json`, then calls the POS: `POST /storefront/common-auth/` (customer by phone), then `POST /storefront/payment/create-intent/` with the items. The POS prices the order and creates the Stripe PaymentIntent on its own Stripe account. If the POS's total differs from the basket preview, the page shows the POS's total and the customer presses Pay again.
2. **Card:** Stripe's card field and `confirmCardPayment`, with the publishable key from `GET /storefront/payment/config/`. Card is the only way to pay.
3. **Order:** once the payment has succeeded, the page calls `POST /storefront/checkout/` with `payment_method: STRIPE` and the `payment_intent_id`. The POS checks the payment with Stripe, records the order as paid and prints the docket.
4. **Confirmation:** the page keeps a receipt in the browser and opens `/order/?ref=<reference>`.

If the card is charged but `checkout` fails, the payment is saved in the browser (`localStorage`, `aj.pending.v1`). The page retries, then offers "Try again"; coming back to checkout later also finishes that order rather than charging again. It works on any host (Cloudflare or Vercel), since nothing runs on our server.

**Waiting on the POS team:** whether `checkout` checks the amount paid against the order, refuses a second use of the same payment, and catches payments whose `checkout` never arrives. Until that is confirmed, the server-side version is kept in `worker/` (the Worker holds each order in D1 between the two steps). It is deployed but checkout no longer calls it.

The docket's notes carry the pickup or delivery time and the web order reference. Each dish's size or style is in that dish's note, because the POS names a sized dish without its size. A size is ordered by sending the size's own id as `menu_item_id`.

Card payments are on when the POS's `payment/config` says `stripe_enabled` with a publishable key. Test or live is whichever keys are in the POS admin.

## Try it locally

```sh
npm run dev                           # http://localhost:4321
```

Checkout talks to the POS directly, so `npm run dev` is enough. It pays with whatever Stripe keys are in the POS admin: with live keys every payment is a real charge, and every paid order is placed in the POS and can print a docket. With test keys, use card `4242 4242 4242 4242`.

## Going live (one-off)

1. Create the D1 database and apply the migrations: `npx wrangler d1 migrations apply amritsar-junction-orders --remote` (or `cf d1 migrations apply <database id>`).
2. Put the live Stripe keys in the POS admin. Card payments switch on by themselves when `payment/config` returns them.
3. Point `STOREFRONT_API_URL` in `wrangler.jsonc` at the production POS when it exists.

Deploy with Workers Builds (push to `main`) or `npx wrangler deploy`. `npm run deploy` uses `deploy/`, which publishes the static site only, without the Worker, so ordering would not work through it.

## Still to settle

- **Kitchen hours:** the hours in `src/content/ordering.ts` come from the placeholder hours in `site.json`.
- **Delivery:** the suburbs and the $35 minimum are suggested defaults. The $5.00 fee matches what the POS adds for delivery; the POS's total is what the card is charged.
- **Email:** any Stripe receipt depends on the POS's Stripe settings. Pickup-time emails (Resend or MailChannels), Wallet passes and an alert for stuck orders are not built yet.
- **Analytics:** events go to `window.dataLayer` and an `aj:track` DOM event (`src/lib/order/track.ts`) until a provider is chosen.

### Questions for the POS developers

1. **Delivery in create-intent:** does `payment/create-intent/` add the $5.00 delivery fee for `order_type: delivery`? Checkout seems to ignore `order_type` (next question).
2. **`order_type`:** checkout ignores it. It comes back `null` for `pickup`, `PICKUP` and `delivery`.
3. **Validation:** checkout accepts an empty `items` list and any `payment_method` string, and creates an order from it.
4. **Purchasable flag:** all 171 items are `is_purchasable: false`, but checkout accepts them anyway. Which one is right?
5. **Order lookup:** is there an endpoint to fetch one order by id, for status updates (preparing, ready)? `GET /storefront/orders/` lists a customer's orders, with their token.
6. **Size on dockets:** can a dish's size appear on the docket? Today it is in the dish's note.
