"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildOrder, makeOrderId, OrderError } = require("../order.js");

const TODAY = "2026-10-30";
const validBody = (overrides = {}) => ({
  items: [{ id: "pork-longganisa", qty: 2 }, { id: "pork-tocino", qty: 1 }],
  customer: { name: "Juan Dela Cruz", phone: "0917 555 1234", email: "juan@example.com" },
  method: "delivery",
  address: "12 Mabini St, Brgy San Isidro, Quezon City",
  date: "2026-10-31",
  notes: "",
  ...overrides,
});
const build = (body) => buildOrder(body, { orderId: "ANG-TEST", today: TODAY });

test("prices items from the catalog and adds the delivery fee under the free threshold", () => {
  const order = build(validBody());
  assert.equal(order.subtotal, 40 * 2 + 60);
  assert.equal(order.deliveryFee, 80);
  assert.equal(order.total, 220);
  assert.equal(order.wholesale, false);
  assert.equal(order.customer.phone, "09175551234");
});

test("ignores any price sent by the browser", () => {
  const order = build(validBody({ items: [{ id: "pork-longganisa", qty: 1, price: 1 }] }));
  assert.equal(order.lines[0].unitPrice, 40);
});

test("delivery is free at or above the free delivery minimum", () => {
  const order = build(validBody({ items: [{ id: "pork-longganisa", qty: 25 }] }));
  assert.equal(order.subtotal, 1000);
  assert.equal(order.deliveryFee, 0);
});

test("pick up is always free and does not need an address", () => {
  const order = build(validBody({ method: "pickup", address: "" }));
  assert.equal(order.deliveryFee, 0);
  assert.equal(order.address, "");
});

test("49 packs stay at retail prices", () => {
  const order = build(validBody({ items: [{ id: "pork-longganisa", qty: 29 }, { id: "pork-tocino", qty: 20 }] }));
  assert.equal(order.wholesale, false);
  assert.equal(order.subtotal, 29 * 40 + 20 * 60);
});

test("50 packs of any mix switch every line to wholesale prices", () => {
  const order = build(validBody({ items: [{ id: "pork-longganisa", qty: 30 }, { id: "pork-tocino", qty: 20 }] }));
  assert.equal(order.wholesale, true);
  assert.equal(order.totalPacks, 50);
  assert.deepEqual(order.lines.map((l) => l.unitPrice), [36, 55]);
  assert.equal(order.subtotal, 30 * 36 + 20 * 55);
  assert.equal(order.deliveryFee, 0);
});

test("every product has a wholesale price no higher than retail", () => {
  const { PRODUCTS } = require("../../public/js/config.js");
  assert.equal(PRODUCTS.length, 19);
  for (const p of PRODUCTS) assert.ok(p.wholesalePrice <= p.price, p.id);
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
});

test("rejects unknown products, bad quantities and duplicates", () => {
  assert.throws(() => build(validBody({ items: [{ id: "steak", qty: 1 }] })), OrderError);
  assert.throws(() => build(validBody({ items: [{ id: "pork-tocino", qty: 0 }] })), OrderError);
  assert.throws(() => build(validBody({ items: [{ id: "pork-tocino", qty: 1.5 }] })), OrderError);
  assert.throws(() => build(validBody({ items: [{ id: "pork-tocino", qty: 501 }] })), OrderError);
  assert.throws(() => build(validBody({ items: [{ id: "pork-tocino", qty: 1 }, { id: "pork-tocino", qty: 1 }] })), OrderError);
  assert.throws(() => build(validBody({ items: [] })), OrderError);
});

test("rejects invalid customer details", () => {
  assert.throws(() => build(validBody({ customer: { name: "J", phone: "09175551234" } })), /full name/);
  assert.throws(() => build(validBody({ customer: { name: "Juan", phone: "12345" } })), /mobile number/);
  assert.throws(() => build(validBody({ customer: { name: "Juan", phone: "09175551234", email: "nope" } })), /email/);
  assert.throws(() => build(validBody({ address: "short" })), /address/);
  assert.throws(() => build(validBody({ date: TODAY })), /date/);
  assert.throws(() => build(validBody({ date: "next week" })), /date/);
});

test("order ids are unique and prefixed", () => {
  const ids = new Set(Array.from({ length: 5000 }, () => makeOrderId()));
  assert.equal(ids.size, 5000);
  for (const id of ids) assert.match(id, /^ANG-[A-Z0-9]{11}$/);
});
