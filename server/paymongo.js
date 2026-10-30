"use strict";

const crypto = require("node:crypto");

const API_URL = "https://api.paymongo.com/v2/checkout_sessions";
const REQUEST_TIMEOUT_MS = 15000;
const toCentavos = (pesos) => Math.round(pesos * 100);

/** Builds the Checkout Session request body from a priced order. */
function checkoutSessionPayload(order, { siteUrl, paymentMethods }) {
  const lineItems = order.lines.map((l) => ({
    name: l.name,
    amount: toCentavos(l.unitPrice),
    currency: order.currency,
    quantity: l.qty,
  }));
  if (order.deliveryFee > 0) {
    lineItems.push({ name: "Delivery fee", amount: toCentavos(order.deliveryFee), currency: order.currency, quantity: 1 });
  }

  const billing = { name: order.customer.name, phone: order.customer.phone };
  if (order.customer.email) billing.email = order.customer.email;

  const orderParam = encodeURIComponent(order.id);
  return {
    data: {
      attributes: {
        line_items: lineItems,
        payment_method_types: paymentMethods,
        success_url: `${siteUrl}/payment-success.html?order=${orderParam}`,
        cancel_url: `${siteUrl}/payment-cancelled.html?order=${orderParam}`,
        reference_number: order.id,
        description: `Angelo's order ${order.id}`,
        billing,
        send_email_receipt: Boolean(order.customer.email),
        show_description: true,
        show_line_items: true,
        metadata: { order_id: order.id, method: order.method },
      },
    },
  };
}

/** Creates a PayMongo Checkout Session. Returns { sessionId, checkoutUrl }. */
async function createCheckoutSession(order, { secretKey, siteUrl, paymentMethods, fetchImpl = fetch }) {
  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(checkoutSessionPayload(order, { siteUrl, paymentMethods })),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.errors?.map((e) => e.detail).join("; ") || `HTTP ${res.status}`;
    throw new Error(`PayMongo rejected the checkout session: ${detail}`);
  }
  const checkoutUrl = json?.data?.attributes?.checkout_url;
  if (!checkoutUrl) throw new Error("PayMongo response did not include a checkout_url.");
  return { sessionId: json.data.id, checkoutUrl };
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("hex");

/**
 * Verifies the Paymongo-Signature header against the raw request body.
 * Supports both formats PayMongo has documented:
 *   1. a plain hex HMAC-SHA256 of the raw body, and
 *   2. "t=<timestamp>,te=<test sig>,li=<live sig>", signed over "<timestamp>.<raw body>".
 */
function verifyWebhookSignature(rawBody, signatureHeader, secret, { livemode } = {}) {
  if (!secret || !signatureHeader) return false;
  const header = String(signatureHeader).trim();

  if (!header.includes("=")) return safeEqualHex(hmac(secret, rawBody), header);

  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  if (!parts.t) return false;
  const expected = hmac(secret, `${parts.t}.${rawBody}`);
  const candidates = livemode === true ? [parts.li] : livemode === false ? [parts.te] : [parts.te, parts.li];
  return candidates.some((sig) => sig && safeEqualHex(expected, sig));
}

module.exports = { checkoutSessionPayload, createCheckoutSession, verifyWebhookSignature, toCentavos };
