"use strict";

/* Dialogs: one open at a time, Escape closes, focus returns to the opener. */
let openDialog = null;
let lastFocus = null;

function showDialog(el) {
  if (openDialog) hideDialog({ restoreFocus: false });
  else lastFocus = document.activeElement;
  openDialog = el;
  el.hidden = false;
  if (el.id === "cart") $("[data-overlay]").hidden = false;
  document.body.classList.add("no-scroll");
  $("[data-close], button, input, a[href]", el)?.focus();
}

function hideDialog({ restoreFocus = true } = {}) {
  if (!openDialog) return;
  openDialog.hidden = true;
  $("[data-overlay]").hidden = true;
  document.body.classList.remove("no-scroll");
  openDialog = null;
  if (restoreFocus && lastFocus?.isConnected) lastFocus.focus();
}

function trapFocus(e) {
  if (!openDialog || e.key !== "Tab") return;
  const items = $$("button, a[href], input, textarea, select", openDialog).filter(
    (n) => !n.disabled && n.offsetParent !== null
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function openProduct(id) {
  const p = findProduct(id);
  if (!p) return;
  const modal = $("#product-modal");
  modal.dataset.productId = id;
  renderGallery(p, 0);
  $("[data-pm-tag]").textContent = p.tags.includes("chicken") ? "Chicken" : "Pork";
  $("[data-pm-name]").textContent = p.name;
  $("[data-pm-price]").textContent = money(p.price);
  $("[data-pm-size]").textContent = p.size;
  $("[data-pm-desc]").textContent = p.desc;
  $("[data-pm-cook]").textContent = p.cook;
  showDialog(modal);
  renderProductModalActions();
}

function renderGallery(p, activeIndex) {
  const images = galleryImages(p);
  const img = $("[data-pm-img]");
  img.src = images[activeIndex];
  img.alt = `${p.name} by Angelo's, photo ${activeIndex + 1} of ${images.length}`;
  $("[data-pm-thumbs]").innerHTML =
    images.length < 2
      ? ""
      : images
          .map(
            (src, i) => `
        <button type="button" class="pm-thumb${i === activeIndex ? " is-active" : ""}" data-thumb="${i}"
          aria-label="Show photo ${i + 1}" aria-pressed="${i === activeIndex}">
          <img src="${src}" alt="" width="64" height="64">
        </button>`
          )
          .join("");
}

function showGalleryImage(index) {
  const p = findProduct($("#product-modal").dataset.productId);
  if (!p) return;
  renderGallery(p, Number(index));
  $(`[data-thumb="${index}"]`)?.focus();
}

function renderProductModalActions() {
  const modal = $("#product-modal");
  if (modal.hidden) return;
  $("[data-pm-actions]").innerHTML = buyControlsHTML(modal.dataset.productId);
}
