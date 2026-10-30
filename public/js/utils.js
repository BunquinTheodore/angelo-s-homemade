"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const money = (n) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 }).format(n);

const findProduct = (id) => PRODUCTS.find((p) => p.id === id);
const PLACEHOLDER_CARD = "images/placeholder.webp";
const PLACEHOLDER_LARGE = "images/placeholder-large.webp";
const cardImage = (p) => (p.gallery.length ? `images/${p.id}.webp` : PLACEHOLDER_CARD);
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
