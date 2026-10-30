"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

/**
 * Tiny JSON file store for orders and processed webhook events.
 * Fine for a small shop. Writes are serialized through a queue so two
 * requests can never overwrite each other. Swap for a real database as you grow.
 */
function createStore(filePath) {
  let queue = Promise.resolve();

  async function read() {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") return { orders: {}, processedEvents: [] };
      throw err;
    }
  }

  async function write(data) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, filePath);
  }

  /* Runs fn(data) => newData | undefined inside the write queue. */
  function update(fn) {
    const run = queue.then(async () => {
      const data = await read();
      const result = await fn(data);
      if (result?.next) await write(result.next);
      return result?.value;
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    saveOrder: (order) =>
      update((data) => ({ next: { ...data, orders: { ...data.orders, [order.id]: order } }, value: order })),

    getOrder: async (id) => (await read()).orders[id] || null,

    /* Marks an order paid once per webhook event. Returns { status, order }. */
    recordPayment: (eventId, orderId, payment) =>
      update((data) => {
        if (data.processedEvents.includes(eventId)) return { value: { status: "duplicate" } };
        const order = data.orders[orderId];
        const processedEvents = [...data.processedEvents, eventId].slice(-1000);
        if (!order) return { next: { ...data, processedEvents }, value: { status: "unknown_order" } };
        const updated = { ...order, ...payment };
        return {
          next: { ...data, processedEvents, orders: { ...data.orders, [orderId]: updated } },
          value: { status: "updated", order: updated },
        };
      }),
  };
}

module.exports = { createStore };
