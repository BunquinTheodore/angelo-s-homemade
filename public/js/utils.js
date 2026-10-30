"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const money = (n) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 }).format(n);

const findProduct = (id) => PRODUCTS.find((p) => p.id === id);
const PLACEHOLDER_LARGE = "images/placeholder-large.webp";
const CARD_WIDTHS = [400, 720];
const cardImageBase = (p) => `images/${p.gallery.length ? p.id : "placeholder"}`;
const cardImage = (p) => `${cardImageBase(p)}-400.webp`;

/*
 * Responsive card picture: AVIF first, WebP fallback, two widths.
 * Cards are about 47vw wide on phones (two columns) and at most 370px elsewhere.
 */
function cardPictureHTML(p, { eager = false } = {}) {
  const base = cardImageBase(p);
  const set = (ext) => CARD_WIDTHS.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");
  const sizes = "(max-width: 640px) 47vw, 370px";
  const alt = p.gallery.length ? p.name : `${p.name}, photo coming soon`;
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" decoding="async"';
  return `<picture>
          <source type="image/avif" srcset="${set("avif")}" sizes="${sizes}">
          <img src="${base}-400.webp" srcset="${set("webp")}" sizes="${sizes}" alt="${alt}" width="720" height="470" ${loading}>
        </picture>`;
}
const galleryImages = (p) =>
  p.gallery.length ? p.gallery.map((kind) => `images/${p.id}-${kind}.webp`) : [PLACEHOLDER_LARGE];

const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TOAST_MS = 3200;
let toastTimer;

function toast(html) {
  const el = $("[data-toast]");
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), TOAST_MS);
}

function localDateString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
