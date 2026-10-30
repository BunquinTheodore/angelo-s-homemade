"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createHandlers, createLogStore, loadEnv, expectedCentavos } = require("../handlers.js");

const SECRET = "whsk_test_secret";
const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("hex");
const env = loadEnv({ PAYMONGO_SECRET_KEY: "sk_test_x", PAYMONGO_WEBHOOK_SECRET: SECRET });

const paidEvent = (amount) =>
  JSON.stringify({
    data: {
      id: "evt_1",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: false,
        data: {
          attributes: {
            reference_number: "ANG-TEST",
            billing: { name: "Juan", phone: "09175551234" },
            line_items: [{ amount: 4000, quantity: 2 }, { amount: 8000, quantity: 1 }],
            payment_intent: { attributes: { amount } },
            payments: [{ id: "pay_1", attributes: { status: "paid" } }],
          },
        },
      },
    },
  });

test("loadEnv prefers SITE_URL, then the Vercel production url, then localhost", () => {
  assert.equal(loadEnv({ SITE_URL: "https://shop.ph/" }).siteUrl, "https://shop.ph");
  assert.equal(loadEnv({ VERCEL_PROJECT_PRODUCTION_URL: "angelos.vercel.app" }).siteUrl, "https://angelos.vercel.app");
  assert.equal(loadEnv({}).siteUrl, "http://localhost:5173");
  assert.deepEqual(loadEnv({}).paymentMethods, ["qrph"]);
  assert.equal(loadEnv({ PAYMONGO_SECRET_KEY: "sk_live_abc" }).isLive, true);
});

test("expectedCentavos falls back to the session line items when no order is stored", () => {
  const session = JSON.parse(paidEvent(16000)).data.attributes.data;
  assert.equal(expectedCentavos(null, session), 16000);
  assert.equal(expectedCentavos({ total: 220 }, session), 22000);
});

test("checkout is unavailable without a secret key", async () => {
  const h = createHandlers({ env: loadEnv({}), store: createLogStore() });
  const res = await h.checkout({ rawBody: "{}", ip: "1.1.1.1" });
  assert.equal(res.status, 503);
});

test("checkout rejects invalid orders before calling PayMongo", async () => {
  const h = createHandlers({ env, store: createLogStore() });
  assert.equal((await h.checkout({ rawBody: "not json", ip: "1.1.1.2" })).status, 400);
  const res = await h.checkout({ rawBody: JSON.stringify({ items: [] }), ip: "1.1.1.2" });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /empty/);
});

test("checkout rate limits repeated attempts from one address", async () => {
  const h = createHandlers({ env, store: createLogStore() });
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await h.checkout({ rawBody: "{}", ip: "9.9.9.9" })).status);
  assert.equal(statuses.at(-1), 429);
});

test("webhook rejects a bad signature and accepts a good one", async () => {
  const h = createHandlers({ env, store: createLogStore() });
  const body = paidEvent(16000);
  assert.equal((await h.webhook({ rawBody: body, signature: "nope" })).status, 401);
  assert.equal((await h.webhook({ rawBody: body, signature: sign(body) })).status, 200);
});

test("webhook flags a payment whose amount does not match the session", async () => {
  const h = createHandlers({ env, store: createLogStore() });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const body = paidEvent(100);
    await h.webhook({ rawBody: body, signature: sign(body) });
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(warnings.some((w) => w.includes("amount check failed")));
});
