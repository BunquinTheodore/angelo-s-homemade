"use strict";

/* Local server: serves public/ and the API. On Vercel, api/ and vercel.json do the same job. */
const http = require("node:http");
const path = require("node:path");
const { createHandlers, loadEnv } = require("./handlers.js");
const { createStore } = require("./store.js");
const { serveStatic } = require("./static.js");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const env = loadEnv();
const store = createStore(process.env.ORDERS_FILE || path.join(ROOT, "data", "orders.json"));
const handlers = createHandlers({ env, store });
const MAX_BODY_BYTES = 1024 * 1024;

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

function sendJson(res, { status, body }) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
const fail = (status, error) => ({ status, body: { success: false, data: null, error } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
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

const API_ROUTES = Object.freeze({
  "/api/checkout": async (req) => handlers.checkout({ rawBody: await readBody(req), ip: req.socket.remoteAddress }),
  "/api/paymongo/webhook": async (req) =>
    handlers.webhook({ rawBody: await readBody(req), signature: req.headers["paymongo-signature"] }),
});

const server = http.createServer((req, res) => {
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  const { pathname } = new URL(req.url, "http://localhost");

  const route = API_ROUTES[pathname];
  if (route) {
    if (req.method !== "POST") return sendJson(res, fail(405, "Method not allowed"));
    return route(req)
      .then((result) => sendJson(res, result))
      .catch((err) => {
        console.error(`[api] ${pathname} error:`, err.message);
        if (!res.headersSent) sendJson(res, fail(err.message === "BODY_TOO_LARGE" ? 413 : 500, "Something went wrong. Please try again."));
      });
  }
  if (pathname.startsWith("/api/")) return sendJson(res, fail(404, "Not found"));
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, fail(405, "Method not allowed"));
  return serveStatic(PUBLIC_DIR, req, res);
});

server.listen(env.port, () => {
  console.info(`Angelo's shop running at http://localhost:${env.port}`);
  if (!env.secretKey) console.warn("PAYMONGO_SECRET_KEY is not set. Online payment is disabled; cash on delivery still works.");
  else console.info(`PayMongo ${env.isLive ? "LIVE" : "TEST"} mode. Methods: ${env.paymentMethods.join(", ")}`);
  if (!env.webhookSecret) console.warn("PAYMONGO_WEBHOOK_SECRET is not set. Paid orders will not be confirmed automatically.");
});
