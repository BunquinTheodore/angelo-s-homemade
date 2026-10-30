"use strict";

const http = require("node:http");
const path = require("node:path");
const { buildOrder, makeOrderId, OrderError } = require("./order.js");
const { createCheckoutSession, verifyWebhookSignature } = require("./paymongo.js");
const { createStore } = require("./store.js");
const { serveStatic } = require("./static.js");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const env = {
  port: Number(process.env.PORT) || 5173,
  siteUrl: (process.env.SITE_URL || `http://localhost:${Number(process.env.PORT) || 5173}`).replace(/\/$/, ""),
  secretKey: process.env.PAYMONGO_SECRET_KEY || "",
  webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET || "",
  paymentMethods: (process.env.PAYMONGO_PAYMENT_METHODS || "gcash,paymaya,card,qrph")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  ordersFile: process.env.ORDERS_FILE || path.join(ROOT, "data", "orders.json"),
};
const isLiveKey = env.secretKey.startsWith("sk_live_");
const store = createStore(env.ordersFile);

const MAX_JSON_BYTES = 20 * 1024;
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_CHECKOUTS = 10;

const SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; "),
});

/* Response helpers: every API response uses { success, data, error }. */
function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
const ok = (res, data) => sendJson(res, 200, { success: true, data, error: null });
const fail = (res, status, error) => sendJson(res, status, { success: false, data: null, error });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* Simple in-memory rate limit per IP for the checkout endpoint. */
const hits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.set(ip, [...recent, now]);
  return recent.length >= RATE_MAX_CHECKOUTS;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(ip);
}, RATE_WINDOW_MS).unref();

const todayInManila = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

async function handleCheckout(req, res) {
  if (!env.secretKey) return fail(res, 503, "Online payment is not set up yet.");
  if (isRateLimited(req.socket.remoteAddress || "unknown")) return fail(res, 429, "Too many attempts. Please wait a minute.");

  let order;
  try {
    const body = JSON.parse(await readBody(req, MAX_JSON_BYTES));
    order = buildOrder(body, { orderId: makeOrderId(), today: todayInManila() });
  } catch (err) {
    if (err instanceof OrderError) return fail(res, 400, err.message);
    return fail(res, 400, "We couldn't read your order. Please try again.");
  }

  try {
    const session = await createCheckoutSession(order, env);
    await store.saveOrder({ ...order, paymongoSessionId: session.sessionId });
    console.info(`[checkout] ${order.id} created, total ₱${order.total}`);
    return ok(res, { orderId: order.id, checkoutUrl: session.checkoutUrl });
  } catch (err) {
    console.error(`[checkout] ${order.id} failed:`, err.message);
    return fail(res, 502, "We couldn't start the online payment.");
  }
}

async function processPaidSession(event) {
  const session = event.attributes?.data;
  const orderId = session?.attributes?.reference_number;
  const amountPaid = session?.attributes?.payment_intent?.attributes?.amount;
  const payment = session?.attributes?.payments?.find((p) => p?.attributes?.status === "paid");
  if (!orderId) return console.warn(`[webhook] ${event.id} has no reference_number`);

  const order = await store.getOrder(orderId);
  const expected = order ? Math.round(order.total * 100) : null;
  const amountMatches = order && amountPaid === expected;

  const result = await store.recordPayment(event.id, orderId, {
    status: amountMatches ? "paid" : "needs_review",
    paidAt: new Date().toISOString(),
    paymongoPaymentId: payment?.id || null,
    amountPaidCentavos: amountPaid ?? null,
  });

  if (result.status === "updated") {
    const o = result.order;
    console.info(`[webhook] ${orderId} ${o.status.toUpperCase()}: ${o.customer.name}, ${o.customer.phone}, ₱${o.total}`);
    if (!amountMatches) console.warn(`[webhook] ${orderId} amount mismatch: paid ${amountPaid}, expected ${expected}`);
  } else {
    console.info(`[webhook] ${event.id} for ${orderId}: ${result.status}`);
  }
}

async function handleWebhook(req, res) {
  let raw;
  try {
    raw = await readBody(req, MAX_WEBHOOK_BYTES);
  } catch {
    return fail(res, 413, "Payload too large");
  }
  const signature = req.headers["paymongo-signature"];
  if (!verifyWebhookSignature(raw, signature, env.webhookSecret, { livemode: isLiveKey })) {
    console.warn("[webhook] rejected: invalid signature");
    return fail(res, 401, "Invalid signature");
  }

  /* Acknowledge right away, then process. PayMongo retries anything that is not 2xx. */
  ok(res, { received: true });

  let event;
  try {
    event = JSON.parse(raw).data;
  } catch {
    return console.error("[webhook] could not parse a verified payload");
  }
  if (event?.attributes?.type !== "checkout_session.payment.paid") return;
  if (event.attributes.livemode !== isLiveKey) return console.warn(`[webhook] ${event.id} ignored: livemode mismatch`);
  processPaidSession(event).catch((err) => console.error(`[webhook] ${event.id} processing failed:`, err));
}

const server = http.createServer((req, res) => {
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  const { pathname } = new URL(req.url, "http://localhost");

  if (pathname === "/api/checkout") {
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");
    return handleCheckout(req, res).catch((err) => {
      console.error("[checkout] unexpected error:", err);
      if (!res.headersSent) fail(res, 500, "Something went wrong. Please try again.");
    });
  }
  if (pathname === "/api/paymongo/webhook") {
    if (req.method !== "POST") return fail(res, 405, "Method not allowed");
    return handleWebhook(req, res).catch((err) => {
      console.error("[webhook] unexpected error:", err);
      if (!res.headersSent) fail(res, 500, "Webhook error");
    });
  }
  if (pathname.startsWith("/api/")) return fail(res, 404, "Not found");
  if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "Method not allowed");
  return serveStatic(PUBLIC_DIR, req, res);
});

server.listen(env.port, () => {
  console.info(`Angelo's shop running at http://localhost:${env.port}`);
  if (!env.secretKey) console.warn("PAYMONGO_SECRET_KEY is not set. Online payment is disabled; cash on delivery still works.");
  else console.info(`PayMongo ${isLiveKey ? "LIVE" : "TEST"} mode. Methods: ${env.paymentMethods.join(", ")}`);
  if (!env.webhookSecret) console.warn("PAYMONGO_WEBHOOK_SECRET is not set. Paid orders will not be confirmed automatically.");
});
