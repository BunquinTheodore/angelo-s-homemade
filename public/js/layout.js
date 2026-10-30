"use strict";

/*
 * Shared page chrome: header, footer, cart drawer, product and checkout dialogs.
 * Every page includes this file, so these parts only live in one place.
 */
const NAV_LINKS = Object.freeze([
  { page: "shop", href: "shop.html", label: "Shop" },
  { page: "how", href: "how-to-order.html", label: "How to order" },
  { page: "story", href: "our-story.html", label: "Our story" },
  { page: "faq", href: "faq.html", label: "FAQ" },
]);

function headerHTML(currentPage) {
  const links = NAV_LINKS.map(
    (l) => `<a href="${l.href}"${l.page === currentPage ? ' aria-current="page"' : ""}>${l.label}</a>`
  ).join("");
  return `
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="announce" role="note">
    <span>Free delivery on orders over <strong>${money(CONFIG.freeDeliveryMin)}</strong></span>
  </div>
  <header class="site-header">
    <div class="container header-inner">
      <a href="index.html" class="brand" aria-label="Angelo's home">
        <picture><source type="image/avif" srcset="images/logo-340.avif"><img src="images/logo-340.webp" alt="Angelo's Homemade Meat Products since 2016" width="340" height="186"></picture>
      </a>
      <nav class="main-nav" aria-label="Main">${links}</nav>
      <button class="cart-btn" type="button" data-open-cart aria-label="Open cart">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>
        <span class="cart-btn-label">Cart</span>
        <span class="cart-count" data-cart-count aria-live="polite">0</span>
      </button>
    </div>
  </header>`;
}

function footerHTML() {
  return `
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <picture><source type="image/avif" srcset="images/logo-340.avif"><img src="images/logo-340.webp" alt="Angelo's" class="footer-logo" loading="lazy" decoding="async" width="340" height="186"></picture>
        <p>Homemade meat products since 2016.</p>
        <p class="footer-address">${CONFIG.address}</p>
      </div>
      <div>
        <h3>Contact us</h3>
        <ul class="contact-list">
          <li><a href="tel:${CONFIG.phone}">${CONFIG.phoneDisplay}</a></li>
          <li><a href="mailto:${CONFIG.email}">${CONFIG.email}</a></li>
          <li><a href="${CONFIG.messengerUrl}" target="_blank" rel="noopener">Message us on Messenger</a></li>
          <li><a href="${CONFIG.facebookUrl}" target="_blank" rel="noopener">Facebook page</a></li>
        </ul>
      </div>
      <div>
        <h3>Shop</h3>
        <ul class="contact-list">
          ${NAV_LINKS.map((l) => `<li><a href="${l.href}">${l.label}</a></li>`).join("")}
        </ul>
      </div>
    </div>
    <p class="container copyright">© ${new Date().getFullYear()} Angelo's Homemade Meat Products. Keep frozen.</p>
  </footer>`;
}

function cartDrawerHTML() {
  return `
  <button type="button" class="mobile-cart-bar" data-open-cart hidden>
    <span data-cart-items-label>0 items</span>
    <span>View cart · <strong data-cart-subtotal>₱0</strong></span>
  </button>

  <div class="overlay" data-overlay hidden></div>
  <aside class="drawer" id="cart" role="dialog" aria-modal="true" aria-labelledby="cart-title" hidden>
    <div class="drawer-head">
      <h2 id="cart-title">Your cart</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close cart">✕</button>
    </div>
    <div class="free-meter" data-free-meter>
      <p data-free-text></p>
      <div class="meter"><span data-free-bar></span></div>
    </div>
    <div class="drawer-body" data-cart-items></div>
    <div class="drawer-foot" data-cart-foot>
      <div class="totals-row"><span>Subtotal</span><strong data-cart-subtotal>₱0</strong></div>
      <p class="muted small">Delivery fee is computed at checkout.</p>
      <button type="button" class="btn btn-primary btn-block btn-lg" data-checkout>Checkout</button>
      <button type="button" class="btn btn-link btn-block" data-close>Continue shopping</button>
    </div>
  </aside>`;
}

function productModalHTML() {
  return `
  <div class="modal" id="product-modal" role="dialog" aria-modal="true" aria-labelledby="pm-title" hidden>
    <div class="modal-card modal-product">
      <button type="button" class="icon-btn modal-close" data-close aria-label="Close">✕</button>
      <div class="pm-media">
        <img data-pm-img alt="" width="800" height="1200">
        <div class="pm-thumbs" data-pm-thumbs role="group" aria-label="Product photos"></div>
      </div>
      <div class="pm-body">
        <p class="eyebrow" data-pm-tag></p>
        <h2 id="pm-title" data-pm-name></h2>
        <p class="pm-price"><strong data-pm-price></strong> <span class="muted" data-pm-size></span></p>
        <p data-pm-desc></p>
        <div class="pm-actions" data-pm-actions></div>
        <p class="keep-frozen">❄ Keep frozen</p>
      </div>
    </div>
  </div>`;
}

function paymentChoicesHTML() {
  const online = CONFIG.onlinePayments
    ? `<label class="choice"><input type="radio" name="payment" value="online" checked><span>Pay now with QR Ph<small>Confirmed instantly</small></span></label>`
    : "";
  return `
    <div class="choice-row choice-row-3">
      ${online}
      <label class="choice"><input type="radio" name="payment" value="qrph" ${CONFIG.onlinePayments ? "" : "checked"}><span>Scan our QR code<small>Then send us your receipt</small></span></label>
      <label class="choice"><input type="radio" name="payment" value="cod"><span>Cash on delivery<small>or pay on pick up</small></span></label>
    </div>`;
}

function checkoutModalHTML() {
  return `
  <div class="modal" id="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="co-title" hidden>
    <div class="modal-card modal-checkout">
      <button type="button" class="icon-btn modal-close" data-close aria-label="Close">✕</button>
      <div data-co-form-view>
        <h2 id="co-title">Checkout</h2>
        <p class="muted">No account needed.</p>
        <form id="checkout-form" novalidate>
          <fieldset>
            <legend>1. Your details</legend>
            <div class="field">
              <label for="f-name">Full name</label>
              <input id="f-name" name="name" autocomplete="name" maxlength="80" required>
              <p class="field-error" data-error-for="name"></p>
            </div>
            <div class="field">
              <label for="f-phone">Mobile number</label>
              <input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="09XX XXX XXXX" maxlength="20" required>
              <p class="field-error" data-error-for="phone"></p>
            </div>
            <div class="field">
              <label for="f-email">Email <span class="muted">(optional, for your receipt)</span></label>
              <input id="f-email" name="email" type="email" autocomplete="email" maxlength="120">
              <p class="field-error" data-error-for="email"></p>
            </div>
          </fieldset>

          <fieldset>
            <legend>2. Delivery or pick up</legend>
            <div class="choice-row">
              <label class="choice"><input type="radio" name="method" value="delivery" checked><span>Delivery</span></label>
              <label class="choice"><input type="radio" name="method" value="pickup"><span>Pick up (free)</span></label>
            </div>
            <div class="field" data-address-field>
              <label for="f-address">Complete address</label>
              <textarea id="f-address" name="address" rows="2" autocomplete="street-address" maxlength="300" placeholder="House no., street, barangay, city" required></textarea>
              <p class="field-error" data-error-for="address"></p>
            </div>
            <div class="field">
              <label for="f-date">Preferred date</label>
              <input id="f-date" name="date" type="date" required>
              <p class="field-error" data-error-for="date"></p>
            </div>
          </fieldset>

          <fieldset>
            <legend>3. Payment</legend>
            ${paymentChoicesHTML()}
            <div class="field">
              <label for="f-notes">Notes <span class="muted">(optional)</span></label>
              <textarea id="f-notes" name="notes" rows="2" maxlength="300" placeholder="Landmark, preferred time, bulk order, etc."></textarea>
            </div>
          </fieldset>

          <div class="summary" data-co-summary></div>
          <p class="form-alert" data-co-alert role="alert" hidden></p>
          <button type="submit" class="btn btn-primary btn-block btn-lg" data-co-submit>Place order</button>
          <p class="secure-note muted small" data-secure-note>🔒 You will scan a QR Ph code on PayMongo's secure page using GCash, Maya or any bank app.</p>
        </form>
      </div>

      <div data-co-done-view hidden>
        <div class="done-badge" aria-hidden="true">✓</div>
        <h2>Almost done!</h2>
        <div class="qr-pay" data-qr-block hidden>
          <p class="qr-amount">Pay exactly <strong data-qr-amount></strong></p>
          <img src="${CONFIG.qrphImage}" alt="QR Ph code for ${CONFIG.qrphName}. Scan with any bank or e-wallet app." width="1000" height="1400" loading="lazy">
          <a class="btn btn-ghost-dark btn-block" href="${CONFIG.qrphImage}" download="Angelos-QRPh.png">Save QR image</a>
          <ol class="qr-steps">
            <li>Open GCash, Maya or your bank app and choose <strong>Scan QR</strong>. On a phone, save the QR image first and upload it from your gallery.</li>
            <li>Check that the name shows <strong>${CONFIG.qrphName}</strong>.</li>
            <li>Enter the exact amount above and add your order number <strong data-qr-order></strong> in the message if your app allows it.</li>
            <li>Take a screenshot of your receipt and send it to us with your order below.</li>
          </ol>
        </div>
        <p data-done-text>Your order number is <strong data-order-id></strong>. Send it to us using any option below so we can confirm.</p>
        <pre class="order-text" data-order-text></pre>
        <div class="send-grid">
          <a class="btn btn-primary btn-block" data-send="sms">Send by text message</a>
          <a class="btn btn-primary btn-block" data-send="email">Send by email</a>
          <button type="button" class="btn btn-ghost-dark btn-block" data-copy-order>Copy and open Messenger</button>
        </div>
        <button type="button" class="btn btn-link btn-block" data-close>Back to shop</button>
      </div>
    </div>
  </div>`;
}

/* Pages built by build.mjs already contain the layout. Only add it when missing (unbuilt source pages). */
function renderLayout() {
  if (document.querySelector(".site-header")) return;
  const page = document.body.dataset.page || "";
  document.body.insertAdjacentHTML("afterbegin", headerHTML(page));
  document.body.insertAdjacentHTML(
    "beforeend",
    footerHTML() +
      cartDrawerHTML() +
      productModalHTML() +
      checkoutModalHTML() +
      `<div class="toast" role="status" aria-live="polite" data-toast hidden></div>`
  );
}
