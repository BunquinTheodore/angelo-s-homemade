"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("../store.js");

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "angelos-")), "orders.json");

test("records a payment once and ignores duplicate webhook events", async () => {
  const store = createStore(tmpFile());
  await store.saveOrder({ id: "ANG-1", status: "pending_payment", total: 100 });

  const first = await store.recordPayment("evt_1", "ANG-1", { status: "paid" });
  const second = await store.recordPayment("evt_1", "ANG-1", { status: "paid" });

  assert.equal(first.status, "updated");
  assert.equal(first.order.status, "paid");
  assert.equal(second.status, "duplicate");
  assert.equal((await store.getOrder("ANG-1")).status, "paid");
});

test("reports unknown orders without crashing", async () => {
  const store = createStore(tmpFile());
  assert.equal((await store.recordPayment("evt_9", "ANG-NOPE", { status: "paid" })).status, "unknown_order");
});

test("concurrent writes do not lose orders", async () => {
  const store = createStore(tmpFile());
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.saveOrder({ id: `ANG-${i}`, total: i })));
  for (let i = 0; i < 20; i++) assert.ok(await store.getOrder(`ANG-${i}`));
});
