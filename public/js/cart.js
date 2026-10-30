"use strict";

/* Cart state: a plain object of { productId: qty }. Always replaced, never mutated. */
const STORAGE_KEY = "angelos-cart-v1";
let cart = loadCart();

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return Object.fromEntries(
      Object.entries(raw).filter(([id, qty]) => findProduct(id) && Number.isInteger(qty) && qty > 0 && qty <= MAX_QTY)
    );
  } catch {
    return {};
  }
}

function saveCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    /* Storage can be unavailable in private mode. The cart still works for this visit. */
  }
}

function setQty(id, qty) {
  const clamped = Math.max(0, Math.min(MAX_QTY, qty));
  const { [id]: _removed, ...rest } = cart;
  cart = clamped > 0 ? { ...rest, [id]: clamped } : rest;
  saveCart();
  renderAll();
}

function clearCart() {
  cart = {};
  saveCart();
  renderAll();
}

const qtyOf = (id) => cart[id] || 0;
const cartCount = () => Object.values(cart).reduce((sum, q) => sum + q, 0);
const cartLines = () =>
  Object.entries(cart).map(([id, qty]) => {
    const product = findProduct(id);
    return { product, qty, unitPrice: product.price, lineTotal: product.price * qty };
  });
const cartSubtotal = () => cartLines().reduce((sum, l) => sum + l.lineTotal, 0);
const deliveryFeeFor = (subtotal, method) =>
  method === "pickup" || subtotal >= CONFIG.freeDeliveryMin ? 0 : CONFIG.deliveryFee;

/* Rendering */
function stepperHTML(id, qty, small = false) {
  return `
    <div class="stepper ${small ? "stepper-sm" : ""}" role="group" aria-label="Quantity">
      <button type="button" data-dec="${id}" aria-label="Remove one">−</button>
      <input type="number" class="qty-input" inputmode="numeric" min="0" max="${MAX_QTY}" value="${qty}"
        data-qty-input="${id}" aria-label="Number of packs">
      <button type="button" data-inc="${id}" aria-label="Add one" ${qty >= MAX_QTY ? "disabled" : ""}>+</button>
    </div>`;
}

function buyControlsHTML(id) {
  const qty = qtyOf(id);
  if (qty === 0) {
    return `<button type="button" class="btn btn-primary btn-block" data-add="${id}">Add to cart</button>`;
  }
  return `${stepperHTML(id, qty)}<button type="button" class="btn btn-ghost-dark" data-open-cart>View cart</button>`;
}

/* The first cards are usually on screen when the page opens, so they load right away. */
const EAGER_CARDS = 2;

function productCardHTML(p, index = EAGER_CARDS) {
  return `
    <article class="card" data-tags="${[...p.tags, p.badge ? "best" : ""].join(" ").trim()}">
      <button type="button" class="card-media" data-view="${p.id}">
        ${cardPictureHTML(p, { eager: index < EAGER_CARDS })}
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
        <span class="view-hint">Details</span>
      </button>
      <div class="card-body">
        <h3><button type="button" data-view="${p.id}">${p.name}</button></h3>
        <p class="card-desc">${p.desc}</p>
        <div class="price-row"><span class="price">${money(p.price)}</span><span class="size">${p.size}</span></div>
        <div class="buy-row" data-buy="${p.id}">${buyControlsHTML(p.id)}</div>
      </div>
    </article>`;
}

/* Products with real photos show first; the rest keep their catalog order. */
const productsForDisplay = () => [...PRODUCTS].sort((a, b) => Number(b.gallery.length > 0) - Number(a.gallery.length > 0));

/* Grids prerendered by build.mjs are left alone so their images are not reloaded. */
function renderProducts() {
  const list = productsForDisplay();
  $$("[data-product-grid]").forEach((grid) => {
    if (grid.children.length) return;
    grid.innerHTML = list.map((p, i) => productCardHTML(p, i)).join("");
  });
}

function renderFilters() {
  $$("[data-filters]").forEach((el) => {
    if (el.children.length) return;
    el.innerHTML = CATEGORIES.map(
      (c, i) =>
        `<button type="button" class="chip${i === 0 ? " is-active" : ""}" data-filter="${c.id}" aria-pressed="${i === 0}">${c.label}</button>`
    ).join("");
  });
}

function renderBuyControls() {
  $$("[data-buy]").forEach((el) => {
    el.innerHTML = buyControlsHTML(el.dataset.buy);
  });
}

function emptyCartHTML() {
  return `
    <div class="empty-cart">
      <div class="big" aria-hidden="true">🛒</div>
      <p><strong>Your cart is empty.</strong></p>
      <p class="muted">Add some longganisa to get started.</p>
      <a href="shop.html" class="btn btn-primary">Browse products</a>
    </div>`;
}

function cartItemHTML({ product: p, qty, unitPrice, lineTotal }) {
  return `
    <div class="cart-item">
      <img src="${cardImage(p)}" alt="" width="76" height="76" loading="lazy" decoding="async">
      <div>
        <h3>${p.name}</h3>
        <p class="unit">${money(unitPrice)} · ${p.size}</p>
        ${stepperHTML(p.id, qty, true)}
      </div>
      <div class="cart-item-side">
        <strong>${money(lineTotal)}</strong>
        <button type="button" class="remove-btn" data-remove="${p.id}">Remove</button>
      </div>
    </div>`;
}

function renderCartDrawer() {
  const lines = cartLines();
  const isEmpty = lines.length === 0;
  $("[data-cart-items]").innerHTML = isEmpty ? emptyCartHTML() : lines.map(cartItemHTML).join("");
  $("[data-cart-foot]").hidden = isEmpty;
  $("[data-free-meter]").hidden = isEmpty;
  if (isEmpty) return;

  const subtotal = cartSubtotal();
  const remaining = CONFIG.freeDeliveryMin - subtotal;
  $("[data-free-text]").innerHTML =
    remaining > 0
      ? `Add <strong>${money(remaining)}</strong> more for <strong>free delivery</strong>.`
      : `🎉 You unlocked <strong>free delivery</strong>!`;
  $("[data-free-bar]").style.width = `${Math.min(100, (subtotal / CONFIG.freeDeliveryMin) * 100)}%`;
}

function renderCounters() {
  const count = cartCount();
  const subtotal = money(cartSubtotal());
  $$("[data-cart-count]").forEach((el) => (el.textContent = count));
  $$("[data-cart-subtotal]").forEach((el) => (el.textContent = subtotal));
  $("[data-cart-items-label]").textContent = `${count} ${count === 1 ? "item" : "items"}`;
  $(".mobile-cart-bar").hidden = count === 0;
  document.body.classList.toggle("has-cart-bar", count > 0);
}

function renderAll() {
  renderBuyControls();
  renderCartDrawer();
  renderCounters();
  renderProductModalActions();
  if (!$("#checkout-modal").hidden) renderCheckoutSummary();
}

function bumpCartButton() {
  const btn = $(".cart-btn");
  btn.classList.remove("bump");
  void btn.offsetWidth;
  btn.classList.add("bump");
}
