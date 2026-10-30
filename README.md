# Angelo's Homemade Meat Products

Online shop with cart, cash on delivery, and PayMongo online payments (GCash, Maya, card, QR Ph).

## Run it

Requires Node.js 22.9 or newer. No packages to install.

```bash
cp .env.example .env     # then fill in your PayMongo keys
npm install              # once, installs the build tool
npm start                # builds into dist/, then serves http://localhost:5173
npm test                 # runs the server tests
```

Without a PayMongo key the shop still works. Customers just won't see online payment succeed, and cash on delivery is unaffected.

## Project layout

```
public/                 The website (everything the browser loads)
  index.html            Home
  shop.html             All products with filters
  how-to-order.html     Steps, delivery and payment info
  our-story.html        Brand story
  faq.html              Questions and answers
  payment-success.html  PayMongo returns here after paying
  payment-cancelled.html PayMongo returns here if the customer cancels
  css/
    base.css            Colors, fonts, buttons
    layout.css          Header, footer, page banners
    components.css      Product cards, cart, checkout, pop-ups
    pages.css           Page sections (hero, steps, FAQ...)
  js/
    config.js           PRICES, PRODUCTS, CONTACT DETAILS (edit this one)
    utils.js            Small helpers
    layout.js           Shared header, footer, cart drawer, checkout form
    cart.js             Cart logic
    dialogs.js          Pop-ups
    checkout.js         Checkout and online payment
    main.js             Starts everything
  images/
api/                    Vercel functions (call server/handlers.js)
server/                 The backend (never sent to the browser)
  handlers.js           Checkout and webhook logic shared by local and Vercel
  server.js             Local web server for npm start
  order.js              Validates orders and computes totals from config.js
  paymongo.js           PayMongo Checkout Session and webhook signature check
  store.js              Saves orders to data/orders.json
  static.js             Serves the public/ folder safely
  test/                 Tests
```

## Editing prices and products

Change `public/js/config.js`. The server reads the same file, so the price customers see is always the price they pay. Only retail prices are on the website.

After changing prices, restart the server (`npm start`) so online payments use the new prices.

## Speed

`npm run build` (run automatically by `npm start` and on Vercel) writes the site to `dist/`: CSS is minified and inlined, JS is bundled into one cached file, and the header, footer and product cards are pre-rendered into the HTML. Edit files in `public/`, never in `dist/`.

## Adding product photos

Products with an empty `gallery` show the "Photo coming soon" placeholder. To add a photo for, say, `cooked-ham`:

1. Save the card image (720 x 470) in four versions: `public/images/cooked-ham-400.avif`, `cooked-ham-400.webp`, `cooked-ham-720.avif` and `cooked-ham-720.webp`.
2. Save the full photo as `public/images/cooked-ham-photo.webp` (and a poster as `cooked-ham-poster.webp` if you have one).
3. In `config.js`, add `gallery: ["photo"]` (or `["photo", "poster"]`) to that product.

## Deploying on Vercel

`vercel.json` serves `public/` and turns `api/` into functions. In the Vercel project settings, add these environment variables, then redeploy:

- `PAYMONGO_SECRET_KEY` (sk_test_ while testing, sk_live_ when live)
- `PAYMONGO_WEBHOOK_SECRET`
- `PAYMONGO_PAYMENT_METHODS` (currently `qrph`)
- `SITE_URL` (optional; defaults to the Vercel production address)

Vercel has no permanent disk, so orders are not saved to `data/orders.json` there. Every order and confirmed payment is written to the Vercel function logs, and the PayMongo dashboard keeps the full payment record (order number, items, customer, amount).

## Going live with PayMongo

1. Create a PayMongo account and finish verification.
2. Dashboard, Developers, API keys: copy the secret key (`sk_test_...` for testing) into `.env` as `PAYMONGO_SECRET_KEY`.
3. Deploy the site somewhere with HTTPS and set `SITE_URL` to that address.
4. Dashboard, Developers, Webhooks: add `https://your-domain.com/api/paymongo/webhook`, subscribe to `checkout_session.payment.paid`, and copy its secret into `PAYMONGO_WEBHOOK_SECRET`.
5. In `PAYMONGO_PAYMENT_METHODS`, list only the methods enabled on your account.
6. Place a test order with a test key. Check that `data/orders.json` shows the order as `paid`.
7. Swap in your `sk_live_...` key and the live webhook secret.

### How a paid order flows

1. The customer clicks "Continue to payment". The browser sends the cart to `/api/checkout`.
2. The server re-prices the cart from `config.js`, saves the order as `pending_payment`, and asks PayMongo for a checkout page.
3. The customer pays on PayMongo's page and returns to `payment-success.html`.
4. PayMongo calls the webhook. The server verifies the signature, checks the amount paid matches the order total, and marks the order `paid` (or `needs_review` if the amount is off). Paid orders are printed in the server log.

The success page alone is not proof of payment. Always go by the webhook status in `data/orders.json`.
