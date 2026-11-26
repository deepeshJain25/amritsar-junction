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

This is the same flow as the internal `/order-test` page, run by the Worker so the POS token never reaches the browser:

1. **Pay pressed:** the Worker checks the basket, saves the order in D1, then calls the POS: `POST /storefront/common-auth/` (customer by phone), then `POST /storefront/payment/create-intent/` with the items. The POS prices the order and creates the Stripe PaymentIntent on its own Stripe account.
2. **Card:** the browser confirms that PaymentIntent with Stripe's Payment Element, using the publishable key from `GET /storefront/payment/config/`. Card is the only way to pay: checkout uses Stripe's card field and `confirmCardPayment`, as the order-test page does, so bank debits, pay-later methods, wallets and Link never show, whatever the Stripe account allows. (Stripe will not confirm a Payment Element limited to cards against the PaymentIntent the POS creates.) If the POS's total differs from the basket preview, the page shows the POS's total first and the customer presses Pay again.
3. **Order:** the order page asks the Worker for the order's status. The Worker reads the PaymentIntent from Stripe (with the publishable key and its client secret, as Stripe.js does), and once it has succeeded, calls `POST /storefront/checkout/` with `payment_method: STRIPE` and the `payment_intent_id`. The POS records the order as paid and prints the docket.

Stripe's webhooks go to the POS, not to the Worker. The docket's notes carry the pickup or delivery time and the web order number. Each dish's size or style is in that dish's note, because the POS names a sized dish without its size. A size is ordered by sending the size's own id as `menu_item_id`. If the POS checkout fails, the Worker retries up to 3 times. After that, the customer is asked to call, and the order stays in D1 with `pos_error` set.

Card payments are on when the POS's `payment/config` says `stripe_enabled` with a publishable key. Test or live is whichever keys are in the POS admin.

## Try it locally

```sh
cp .dev.vars.example .dev.vars        # mock payments on, nothing sent to the POS
npm run build
npx wrangler d1 migrations apply amritsar-junction-orders --local
npx wrangler dev                      # http://localhost:8787
```

`npm run dev` (Astro on its own) shows the basket but has no `/api`, so checkout says online payment is not set up. Use `wrangler dev` to test checkout.

With `MOCK_PAYMENTS=true`, checkout shows a test panel where you pick what happens: success, a declined card, or a slow payment.

With `MOCK_PAYMENTS=false`, checkout pays through the POS with whatever Stripe keys are in the POS admin. With test keys, use card `4242 4242 4242 4242`. Every paid order is placed in the POS and can print a docket.

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
