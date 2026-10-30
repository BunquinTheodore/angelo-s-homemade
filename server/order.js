"use strict";

const crypto = require("node:crypto");
const { CONFIG, PRODUCTS, MAX_QTY } = require("../public/js/config.js");

const MAX_LINES = PRODUCTS.length;
const PHONE_RE = /^(09\d{9}|\+639\d{9})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

class OrderError extends Error {
  constructor(message) {
    super(message);
    this.name = "OrderError";
  }
}

function priceItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new OrderError("Your cart is empty.");
  if (items.length > MAX_LINES) throw new OrderError("Your cart has too many items.");

  const seen = new Set();
  const validated = items.map((item) => {
    const product = PRODUCTS.find((p) => p.id === item?.id);
    const qty = item?.qty;
    if (!product) throw new OrderError("One of the products in your cart is no longer available.");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new OrderError(`Please check the quantity for ${product.name}.`);
    if (seen.has(product.id)) throw new OrderError("Your cart has a duplicate item.");
    seen.add(product.id);
    return { product, qty };
  });

  return validated.map(({ product, qty }) => ({
    id: product.id,
    name: product.name,
    unitPrice: product.price,
    qty,
    lineTotal: product.price * qty,
  }));
}

function validateCustomer(body, today) {
  const customer = {
    name: str(body?.customer?.name, 80),
    phone: str(body?.customer?.phone, 20).replace(/[\s().-]/g, ""),
    email: str(body?.customer?.email, 120),
  };
  const method = body?.method === "pickup" ? "pickup" : "delivery";
  const address = method === "delivery" ? str(body?.address, 300) : "";
  const date = str(body?.date, 10);
  const notes = str(body?.notes, 300);

  if (customer.name.length < 2) throw new OrderError("Please enter your full name.");
  if (!PHONE_RE.test(customer.phone)) throw new OrderError("Please enter a valid mobile number.");
  if (customer.email && !EMAIL_RE.test(customer.email)) throw new OrderError("Please enter a valid email address.");
  if (method === "delivery" && address.length < 8) throw new OrderError("Please enter your complete address.");
  if (!DATE_RE.test(date) || date <= today) throw new OrderError("Please pick a delivery date from tomorrow onwards.");

  return { customer, method, address, date, notes };
}

/**
 * Turns an untrusted checkout request into a priced order.
 * Prices always come from the catalog, never from the browser.
 */
function buildOrder(body, { orderId, today }) {
  const lines = priceItems(body?.items);
  const details = validateCustomer(body, today);
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const totalPacks = lines.reduce((sum, l) => sum + l.qty, 0);
  const deliveryFee = details.method === "pickup" || subtotal >= CONFIG.freeDeliveryMin ? 0 : CONFIG.deliveryFee;

  return {
    id: orderId,
    status: "pending_payment",
    createdAt: new Date().toISOString(),
    ...details,
    lines,
    totalPacks,
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    currency: CONFIG.currency,
  };
}

/* 5 time characters + 6 cryptographically random characters (about 2 billion per millisecond). */
function makeOrderId() {
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  const rand = crypto.randomInt(36 ** 6).toString(36).padStart(6, "0").toUpperCase();
  return `ANG-${stamp}${rand}`;
}

module.exports = { buildOrder, makeOrderId, OrderError };
