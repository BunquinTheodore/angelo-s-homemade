"use strict";

/*
 * Checkout and webhook logic shared by the local server (server/server.js)
 * and the Vercel functions (api/). Handlers take plain inputs and return
 * { status, body } so they work with any HTTP layer.
 */
const { buildOrder, makeOrderId, OrderError } = require("./order.js");
const { createCheckoutSession, verifyWebhookSignature } = require("./paymongo.js");

const MAX_JSON_BYTES = 20 * 1024;
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_CHECKOUTS = 10;

const ok = (data) => ({ status: 200, body: { success: true, data, error: null } });
const fail = (status, error) => ({ status, body: { success: false, data: null, error } });
const todayInManila = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

const isLocalUrl = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(url || "");

function loadEnv(source = process.env) {
  const port = Number(source.PORT) || 5173;
  const vercelUrl = source.VERCEL_PROJECT_PRODUCTION_URL ? `https://${source.VERCEL_PROJECT_PRODUCTION_URL}` : "";
  const secretKey = source.PAYMONGO_SECRET_KEY || "";
  /* A localhost SITE_URL copied into a hosted deployment would send paying customers to a dead page. */
  const hosted = Boolean(source.VERCEL);
  const siteUrlSetting = hosted && isLocalUrl(source.SITE_URL) ? "" : source.SITE_URL;
  if (hosted && siteUrlSetting !== source.SITE_URL) console.warn(`[env] ignoring SITE_URL=${source.SITE_URL} on Vercel; using ${vercelUrl}`);
  return Object.freeze({
    port,
    siteUrl: (siteUrlSetting || vercelUrl || `http://localhost:${port}`).replace(/\/$/, ""),
    secretKey,
    isLive: secretKey.startsWith("sk_live_"),
    webhookSecret: source.PAYMONGO_WEBHOOK_SECRET || "",
    paymentMethods: (source.PAYMONGO_PAYMENT_METHODS || "qrph").split(",").map((s) => s.trim()).filter(Boolean),
  });
}

/* Used where there is no writable disk (Vercel). PayMongo's dashboard holds the order record. */
function createLogStore() {
  return {
    saveOrder: async (order) => {
      console.info(`[order] ${order.id} ${JSON.stringify({ customer: order.customer, method: order.method, address: order.address, date: order.date, notes: order.notes, lines: order.lines, total: order.total })}`);
      return order;
    },
    getOrder: async () => null,
    recordPayment: async () => ({ status: "logged" }),
  };
}

/* Simple in-memory rate limit per IP. Per instance only, which is enough to stop casual abuse. */
function createRateLimiter() {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (hits.size > 5000) hits.clear();
    hits.set(ip, [...recent, now]);
    return recent.length >= RATE_MAX_CHECKOUTS;
  };
}

/* Expected amount in centavos: from our saved order, or from the session's own line items. */
function expectedCentavos(order, session) {
  if (order) return Math.round(order.total * 100);
  const items = session?.attributes?.line_items;
  return Array.isArray(items) ? items.reduce((sum, i) => sum + i.amount * i.quantity, 0) : null;
}

function createHandlers({ env, store }) {
  const isRateLimited = createRateLimiter();

  async function checkout({ rawBody, ip }) {
    if (!env.secretKey) return fail(503, "Online payment is not set up yet.");
    if (isRateLimited(ip || "unknown")) return fail(429, "Too many attempts. Please wait a minute.");
    if (rawBody.length > MAX_JSON_BYTES) return fail(413, "Your order is too large.");

    let order;
    try {
      order = buildOrder(JSON.parse(rawBody), { orderId: makeOrderId(), today: todayInManila() });
    } catch (err) {
      if (err instanceof OrderError) return fail(400, err.message);
      return fail(400, "We couldn't read your order. Please try again.");
    }

    try {
      const session = await createCheckoutSession(order, env);
      await store.saveOrder({ ...order, paymongoSessionId: session.sessionId });
      console.info(`[checkout] ${order.id} created, total ₱${order.total}`);
      return ok({ orderId: order.id, checkoutUrl: session.checkoutUrl });
    } catch (err) {
      console.error(`[checkout] ${order.id} failed:`, err.message);
      return fail(502, "We couldn't start the online payment.");
    }
  }

  async function processPaidSession(event) {
    const session = event.attributes?.data;
    const orderId = session?.attributes?.reference_number;
    const amountPaid = session?.attributes?.payment_intent?.attributes?.amount;
    const payment = session?.attributes?.payments?.find((p) => p?.attributes?.status === "paid");
    if (!orderId) return console.warn(`[webhook] ${event.id} has no reference_number`);

    const order = await store.getOrder(orderId);
    const expected = expectedCentavos(order, session);
    const amountMatches = expected !== null && amountPaid === expected;
    const status = amountMatches ? "paid" : "needs_review";

    const result = await store.recordPayment(event.id, orderId, {
      status,
      paidAt: new Date().toISOString(),
      paymongoPaymentId: payment?.id || null,
      amountPaidCentavos: amountPaid ?? null,
    });

    const billing = session?.attributes?.billing || {};
    console.info(`[webhook] ${orderId} ${status.toUpperCase()} (${result.status}): ${billing.name || "?"}, ${billing.phone || "?"}, paid ₱${(amountPaid ?? 0) / 100}`);
    if (!amountMatches) console.warn(`[webhook] ${orderId} amount check failed: paid ${amountPaid}, expected ${expected}`);
  }

  /* Verifies the signature, then processes the event before returning (serverless platforms stop after responding). */
  async function webhook({ rawBody, signature }) {
    if (rawBody.length > MAX_WEBHOOK_BYTES) return fail(413, "Payload too large");
    if (!verifyWebhookSignature(rawBody, signature, env.webhookSecret, { livemode: env.isLive })) {
      console.warn("[webhook] rejected: invalid signature");
      return fail(401, "Invalid signature");
    }

    let event;
    try {
      event = JSON.parse(rawBody).data;
    } catch {
      console.error("[webhook] could not parse a verified payload");
      return ok({ received: true });
    }
    if (event?.attributes?.type !== "checkout_session.payment.paid") return ok({ received: true });
    if (event.attributes.livemode !== env.isLive) {
      console.warn(`[webhook] ${event.id} ignored: livemode mismatch`);
      return ok({ received: true });
    }
    try {
      await processPaidSession(event);
    } catch (err) {
      console.error(`[webhook] ${event.id} processing failed:`, err);
    }
    return ok({ received: true });
  }

  return { checkout, webhook };
}

module.exports = { createHandlers, createLogStore, loadEnv, expectedCentavos };
