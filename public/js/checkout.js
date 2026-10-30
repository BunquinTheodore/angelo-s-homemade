"use strict";

const CHECKOUT_ENDPOINT = "/api/checkout";
const PAYMENT_LABELS = Object.freeze({ qrph: "QR Ph (receipt screenshot attached)", cod: "Cash on delivery" });
const checkoutForm = () => $("#checkout-form");
const selectedMethod = () => checkoutForm().elements.method.value;
const selectedPayment = () => checkoutForm().elements.payment.value;

function renderCheckoutSummary() {
  const subtotal = cartSubtotal();
  const fee = deliveryFeeFor(subtotal, selectedMethod());
  const rows = cartLines()
    .map(({ product, qty, lineTotal }) => `<div class="summary-line"><span>${qty} × ${product.name}</span><span>${money(lineTotal)}</span></div>`)
    .join("");
  const wholesaleRow = cartIsWholesale()
    ? `<div class="summary-line ws-applied"><span>Wholesale prices applied (${cartCount()} packs)</span><span>✓</span></div>`
    : "";
  $("[data-co-summary]").innerHTML = `
    ${rows}
    ${wholesaleRow}
    <div class="summary-line muted"><span>${selectedMethod() === "pickup" ? "Pick up" : "Delivery"}</span><span>${fee === 0 ? "Free" : money(fee)}</span></div>
    <div class="summary-line summary-total"><span>Total</span><span>${money(subtotal + fee)}</span></div>`;
}

function syncCheckoutForm() {
  const isPickup = selectedMethod() === "pickup";
  $("[data-address-field]").hidden = isPickup;
  $("#f-address").required = !isPickup;
  const isOnline = selectedPayment() === "online";
  const submitLabels = { online: "Continue to payment", qrph: "Place order and show QR", cod: "Place order" };
  $("[data-co-submit]").textContent = submitLabels[selectedPayment()];
  $("[data-secure-note]").hidden = !isOnline;
  renderCheckoutSummary();
}

function openCheckout() {
  if (cartCount() === 0) return;
  $("[data-co-form-view]").hidden = false;
  $("[data-co-done-view]").hidden = true;
  setAlert("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateInput = $("#f-date");
  dateInput.min = localDateString(tomorrow);
  if (!dateInput.value) dateInput.value = dateInput.min;
  syncCheckoutForm();
  showDialog($("#checkout-modal"));
}

const normalizePhone = (v) => v.replace(/[\s().-]/g, "");

function validateCheckout(data) {
  const errors = {};
  if (data.name.trim().length < 2) errors.name = "Please enter your full name.";
  if (!/^(09\d{9}|\+639\d{9})$/.test(normalizePhone(data.phone)))
    errors.phone = "Enter a valid mobile number, like 0917 123 4567.";
  if (data.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
    errors.email = "That email doesn't look right. You can also leave it blank.";
  if (data.method === "delivery" && data.address.trim().length < 8)
    errors.address = "Please enter your complete address so we can find you.";
  if (!data.date || data.date < $("#f-date").min) errors.date = "Please pick a date from tomorrow onwards.";
  return errors;
}

function showErrors(errors) {
  $$("[data-error-for]").forEach((el) => {
    const msg = errors[el.dataset.errorFor] || "";
    el.textContent = msg;
    el.closest(".field").classList.toggle("has-error", Boolean(msg));
  });
  const firstKey = Object.keys(errors)[0];
  if (firstKey) checkoutForm().elements[firstKey].focus();
}

function setAlert(message) {
  const el = $("[data-co-alert]");
  el.textContent = message;
  el.hidden = !message;
}

function setSubmitting(isSubmitting) {
  const btn = $("[data-co-submit]");
  btn.disabled = isSubmitting;
  btn.textContent = isSubmitting ? "Connecting to PayMongo…" : "Continue to payment";
}

function readCheckoutForm() {
  const data = Object.fromEntries(new FormData(checkoutForm()));
  return { ...data, address: data.address || "", email: data.email || "", notes: data.notes || "" };
}

/* Online payment: the server re-prices the cart and creates a PayMongo Checkout Session. */
async function startOnlinePayment(data) {
  setSubmitting(true);
  setAlert("");
  try {
    const res = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: Object.entries(cart).map(([id, qty]) => ({ id, qty })),
        customer: { name: data.name, phone: data.phone, email: data.email },
        method: data.method,
        address: data.address,
        date: data.date,
        notes: data.notes,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) throw new Error(json.error || "Online payment is not available right now.");
    window.location.assign(json.data.checkoutUrl);
  } catch (err) {
    setSubmitting(false);
    const offline = err instanceof TypeError;
    setAlert(
      offline
        ? "We couldn't reach the payment server. Please try again, or choose Cash on delivery."
        : `${err.message} You can try again or choose Cash on delivery.`
    );
  }
}

function buildOrderText(orderId, data) {
  const subtotal = cartSubtotal();
  const fee = deliveryFeeFor(subtotal, data.method);
  const items = cartLines().map(({ product, qty, lineTotal }) => `• ${qty} × ${product.name} (${money(lineTotal)})`);
  const lines = [
    `NEW ORDER ${orderId}`,
    "",
    ...items,
    "",
    cartIsWholesale() ? `Wholesale prices applied (${cartCount()} packs)` : "",
    `Subtotal: ${money(subtotal)}`,
    `${data.method === "pickup" ? "Pick up" : "Delivery"}: ${fee === 0 ? "Free" : money(fee)}`,
    `TOTAL: ${money(subtotal + fee)}`,
    "",
    `Name: ${data.name.trim()}`,
    `Mobile: ${data.phone.trim()}`,
    data.email.trim() ? `Email: ${data.email.trim()}` : "",
    data.method === "delivery" ? `Address: ${data.address.trim()}` : "Method: Pick up",
    `Preferred date: ${data.date}`,
    `Payment: ${PAYMENT_LABELS[data.payment]}`,
    data.notes.trim() ? `Notes: ${data.notes.trim()}` : "",
  ];
  return lines.filter((line, i, arr) => line !== "" || arr[i - 1] !== "").join("\n").trim();
}

const makeOrderId = () => `ANG-${Date.now().toString(36).slice(-5).toUpperCase()}`;

/*
 * Cash on delivery or QR Ph: show a ready-made message the customer sends us by text, email or Messenger.
 * For QR Ph we also show the store's static QR code and the exact amount to pay.
 */
function completeManualOrder(data) {
  const orderId = makeOrderId();
  const text = buildOrderText(orderId, data);
  const total = cartSubtotal() + deliveryFeeFor(cartSubtotal(), data.method);
  const isQr = data.payment === "qrph";
  $("[data-qr-block]").hidden = !isQr;
  $("[data-qr-amount]").textContent = money(total);
  $("[data-qr-order]").textContent = orderId;
  $("[data-done-text]").innerHTML = isQr
    ? `After paying, send us your order <strong data-order-id></strong> and your receipt screenshot so we can confirm.`
    : `Your order number is <strong data-order-id></strong>. Send it to us using any option below so we can confirm.`;
  $("[data-order-id]").textContent = orderId;
  $("[data-order-text]").textContent = text;
  const body = encodeURIComponent(text);
  $('[data-send="sms"]').href = `sms:${CONFIG.phone}?&body=${body}`;
  $('[data-send="email"]').href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(`Order ${orderId}`)}&body=${body}`;

  $("[data-co-form-view]").hidden = true;
  $("[data-co-done-view]").hidden = false;
  $("#checkout-modal").scrollTop = 0;
  clearCart();
  checkoutForm().reset();
}

function handleCheckoutSubmit(e) {
  e.preventDefault();
  const data = readCheckoutForm();
  const errors = validateCheckout(data);
  showErrors(errors);
  if (Object.keys(errors).length > 0) return;
  if (data.payment === "online") startOnlinePayment(data);
  else completeManualOrder(data);
}

async function copyOrderAndOpenMessenger() {
  try {
    await navigator.clipboard.writeText($("[data-order-text]").textContent);
    toast("Order copied. Paste it in Messenger to send.");
  } catch {
    toast("Could not copy automatically. Please select the order text and copy it.");
  }
  window.open(CONFIG.messengerUrl, "_blank", "noopener");
}

function initCheckout() {
  const form = checkoutForm();
  form.addEventListener("submit", handleCheckoutSubmit);
  form.addEventListener("change", (e) => {
    if (e.target.name === "method" || e.target.name === "payment") syncCheckoutForm();
  });
  form.addEventListener("input", (e) => {
    const err = $(`[data-error-for="${e.target.name}"]`);
    if (err?.textContent) {
      err.textContent = "";
      err.closest(".field").classList.remove("has-error");
    }
  });
}
