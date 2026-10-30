"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { checkoutSessionPayload, createCheckoutSession, verifyWebhookSignature } = require("../paymongo.js");

const SECRET = "whsk_test_secret";
const sign = (data) => crypto.createHmac("sha256", SECRET).update(data).digest("hex");

const order = {
  id: "ANG-TEST1234",
  currency: "PHP",
  method: "delivery",
  customer: { name: "Juan Dela Cruz", phone: "09175551234", email: "" },
  lines: [{ id: "longganisa", name: "Pork Longganisa", unitPrice: 185, qty: 2, lineTotal: 370 }],
  deliveryFee: 80,
  total: 450,
};
const opts = { siteUrl: "https://shop.example", paymentMethods: ["gcash", "card"] };

test("payload uses centavos, adds a delivery line and sets return urls", () => {
  const attrs = checkoutSessionPayload(order, opts).data.attributes;
  assert.deepEqual(attrs.line_items, [
    { name: "Pork Longganisa", amount: 18500, currency: "PHP", quantity: 2 },
    { name: "Delivery fee", amount: 8000, currency: "PHP", quantity: 1 },
  ]);
  assert.equal(attrs.reference_number, "ANG-TEST1234");
  assert.equal(attrs.success_url, "https://shop.example/payment-success.html?order=ANG-TEST1234");
  assert.equal(attrs.cancel_url, "https://shop.example/payment-cancelled.html?order=ANG-TEST1234");
  assert.deepEqual(attrs.payment_method_types, ["gcash", "card"]);
  assert.equal(attrs.send_email_receipt, false);
  assert.equal("email" in attrs.billing, false);
});

test("line item totals always add up to the order total", () => {
  const items = checkoutSessionPayload(order, opts).data.attributes.line_items;
  const sum = items.reduce((s, i) => s + i.amount * i.quantity, 0);
  assert.equal(sum, order.total * 100);
});

test("createCheckoutSession sends basic auth and returns the checkout url", async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ data: { id: "cs_123", attributes: { checkout_url: "https://checkout.paymongo.com/x" } } }), { status: 200 });
  };
  const result = await createCheckoutSession(order, { ...opts, secretKey: "sk_test_abc", fetchImpl });
  assert.deepEqual(result, { sessionId: "cs_123", checkoutUrl: "https://checkout.paymongo.com/x" });
  assert.equal(captured.url, "https://api.paymongo.com/v2/checkout_sessions");
  assert.equal(captured.init.headers.Authorization, `Basic ${Buffer.from("sk_test_abc:").toString("base64")}`);
});

test("createCheckoutSession surfaces PayMongo errors", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ errors: [{ detail: "payment method not enabled" }] }), { status: 400 });
  await assert.rejects(createCheckoutSession(order, { ...opts, secretKey: "sk_test_abc", fetchImpl }), /payment method not enabled/);
});

test("verifies a plain hex signature of the raw body", () => {
  const body = '{"data":{"id":"evt_1"}}';
  assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
  assert.equal(verifyWebhookSignature(body + " ", sign(body), SECRET), false);
  assert.equal(verifyWebhookSignature(body, sign(body), "wrong_secret"), false);
});

test("verifies the t=,te=,li= signature format for the right mode", () => {
  const body = '{"data":{"id":"evt_2"}}';
  const t = "1700000000";
  const sig = sign(`${t}.${body}`);
  assert.equal(verifyWebhookSignature(body, `t=${t},te=${sig},li=`, SECRET, { livemode: false }), true);
  assert.equal(verifyWebhookSignature(body, `t=${t},te=${sig},li=`, SECRET, { livemode: true }), false);
  assert.equal(verifyWebhookSignature(body, `t=${t},te=,li=${sig}`, SECRET, { livemode: true }), true);
});

test("rejects missing signature or secret", () => {
  assert.equal(verifyWebhookSignature("{}", undefined, SECRET), false);
  assert.equal(verifyWebhookSignature("{}", sign("{}"), ""), false);
});
