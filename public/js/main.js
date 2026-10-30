"use strict";

function applyFilter(filter) {
  $$("[data-filter]").forEach((chip) => {
    const active = chip.dataset.filter === filter;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-pressed", String(active));
  });
  $$(".card").forEach((card) => {
    card.hidden = filter !== "all" && !card.dataset.tags.split(" ").includes(filter);
  });
}

/* After re-render, keep keyboard focus on the same stepper control. */
function refocus(selector, original) {
  const scope = original.closest("[data-buy], [data-pm-actions], [data-cart-items]");
  const key = scope?.matches("[data-pm-actions]") ? "[data-pm-actions]" : scope?.matches("[data-cart-items]") ? "[data-cart-items]" : "[data-buy]";
  const target = $(`${key} ${selector}`);
  if (target && !target.disabled) target.focus();
}

function handleCartAction(t) {
  const { add, inc, dec, remove, undo } = t.dataset;
  if (add) {
    setQty(add, 1);
    bumpCartButton();
    toast(`Added ${findProduct(add).name} <button type="button" data-open-cart>View cart</button>`);
    $(`[data-buy="${add}"] [data-inc]`)?.focus();
  } else if (inc) {
    setQty(inc, qtyOf(inc) + 1);
    bumpCartButton();
    refocus(`[data-inc="${inc}"]`, t);
  } else if (dec) {
    setQty(dec, qtyOf(dec) - 1);
    refocus(`[data-dec="${dec}"]`, t);
  } else if (remove) {
    const prevQty = qtyOf(remove);
    setQty(remove, 0);
    toast(`Removed ${findProduct(remove).name} <button type="button" data-undo="${remove}:${prevQty}">Undo</button>`);
  } else if (undo) {
    const [id, qty] = undo.split(":");
    setQty(id, Number(qty));
    $("[data-toast]").hidden = true;
  } else {
    return false;
  }
  return true;
}

function handleClick(e) {
  const t = e.target.closest("button, a");
  if (!t) {
    if (e.target.matches(".modal, [data-overlay]")) hideDialog();
    return;
  }
  if (handleCartAction(t)) return;

  if (t.dataset.view) openProduct(t.dataset.view);
  else if (t.dataset.thumb) showGalleryImage(t.dataset.thumb);
  else if (t.dataset.filter) applyFilter(t.dataset.filter);
  else if (t.hasAttribute("data-open-cart")) showDialog($("#cart"));
  else if (t.hasAttribute("data-checkout")) openCheckout();
  else if (t.hasAttribute("data-copy-order")) copyOrderAndOpenMessenger();
  else if (t.hasAttribute("data-close")) hideDialog();
}

function handleQtyInput(e) {
  const input = e.target.closest("[data-qty-input]");
  if (!input) return;
  const id = input.dataset.qtyInput;
  const qty = Number.parseInt(input.value, 10);
  setQty(id, Number.isFinite(qty) ? qty : qtyOf(id));
  if (qty > MAX_QTY) toast(`The most you can order online is ${MAX_QTY} packs per product. Message us for more.`);
}

function fillConfigText() {
  $$("[data-config]").forEach((el) => (el.textContent = money(CONFIG[el.dataset.config])));
  $$("[data-config-text]").forEach((el) => (el.textContent = CONFIG[el.dataset.configText]));
}

/* Payment result pages (payment-success.html / payment-cancelled.html). */
function handlePaymentReturn() {
  const page = document.body.dataset.page;
  const orderId = new URLSearchParams(location.search).get("order") || "";
  $$("[data-return-order]").forEach((el) => (el.textContent = orderId || "your order"));
  if (page === "payment-success") clearCart();
}

function init() {
  renderLayout();
  fillConfigText();
  renderFilters();
  renderProducts();
  renderAll();
  initCheckout();
  handlePaymentReturn();

  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleQtyInput);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-qty-input]")) e.target.blur();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideDialog();
    trapFocus(e);
  });
  if (location.hash === "#cart") showDialog($("#cart"));
}

init();
