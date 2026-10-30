"use strict";

/*
 * Store settings and product catalog.
 * This file is loaded by the browser AND by the server (server/order.js),
 * so prices only ever need to be changed here.
 */
const CONFIG = Object.freeze({
  currency: "PHP",
  deliveryFee: 80,
  freeDeliveryMin: 1000,
  /* Wholesale prices apply when the whole order has at least this many packs (mix and match). */
  wholesaleMinPacks: 50,
  phone: "+639178053229",
  phoneDisplay: "0917 805 3229",
  email: "angelosmeatproducts.office@gmail.com",
  address: "029 Puting Bato East, Calaca City, Batangas",
  facebookUrl: "https://www.facebook.com/angelosmeatproducts",
  messengerUrl: "https://m.me/angelosmeatproducts",
  /* Set to false to hide the "Pay online" option (for example, before PayMongo is set up). */
  onlinePayments: true,
  /* Static QR Ph code from PayMongo. Customers scan it and type the amount themselves. */
  qrphImage: "images/qrph.png",
  qrphName: "Angelos Homemade",
});

/* Filter chips, in display order. "best" shows products with a badge. */
const CATEGORIES = Object.freeze([
  { id: "all", label: "All" },
  { id: "best", label: "Best sellers" },
  { id: "longganisa", label: "Longganisa" },
  { id: "skinless", label: "Skinless" },
  { id: "hamonado", label: "Hamonado" },
  { id: "ham", label: "Ham" },
  { id: "embotido", label: "Embotido" },
  { id: "tocino-tapa", label: "Tocino and Tapa" },
  { id: "chicken", label: "Chicken" },
]);


/*
 * gallery: photos available in public/images, named "<id>-<kind>.webp".
 * The card uses "<id>.webp". An empty gallery shows the "photo coming soon" placeholder.
 */
const defineProduct = (id, name, tags, retail, wholesale, desc, extra = {}) =>
  Object.freeze({ id, name, tags, price: retail, wholesalePrice: wholesale, desc, size: "per pack", badge: "", gallery: [], ...extra });

const PRODUCTS = Object.freeze([
  defineProduct("chicken-hamonado", "Chicken Hamonado", ["hamonado", "chicken"], 40, 37,
    "Sweet and savory chicken hamonado rounds with a glossy glaze. Our top pick.",
    { badge: "Top pick", size: "240 g pack", gallery: ["poster"] }),
  defineProduct("special-skinless", "Special Skinless", ["skinless", "longganisa"], 35, 32,
    "No casing, all flavor. Tender, sweet and savory links that cook up in minutes.",
    { badge: "Best seller", size: "240 g pack", gallery: ["photo", "poster"] }),
  defineProduct("pork-longganisa", "Pork Longganisa", ["longganisa"], 40, 36,
    "Our classic sweet and garlicky Filipino sausage in plump links. Caramelizes beautifully in the pan.",
    { badge: "Top seller", size: "240 g pack", gallery: ["photo", "poster"] }),
  defineProduct("cooked-ham", "Cooked Ham", ["ham"], 52, 50,
    "Tender, ready to eat sliced ham. Great fried for breakfast or stacked in a sandwich.",
    { badge: "Top seller", size: "240 g pack" }),
  defineProduct("pork-hamonado", "Pork Hamonado", ["hamonado"], 40, 36,
    "Sweet, ham style pork rounds sliced and ready to fry. A rich, glossy breakfast treat.",
    { gallery: ["photo", "poster"] }),
  defineProduct("pork-embotido-mini", "Pork Embotido (Mini)", ["embotido"], 35, 31,
    "Snack size Filipino meatloaf roll. Just steam or fry, slice and serve."),
  defineProduct("chicken-longganisa", "Chicken Longganisa", ["longganisa", "chicken"], 40, 37,
    "Our longganisa recipe made with chicken. Lighter, with the same sweet garlicky flavor."),
  defineProduct("pork-skinless", "Pork Skinless", ["skinless", "longganisa"], 35, 32,
    "Classic pork skinless longganisa. Quick to cook and loved by kids."),
  defineProduct("chicken-skinless", "Chicken Skinless", ["skinless", "longganisa", "chicken"], 35, 32,
    "Skinless longganisa made with chicken. Tender, sweet and quick to cook."),
  defineProduct("pork-embotido-big", "Pork Embotido (Big)", ["embotido"], 60, 55,
    "A full size Filipino pork meatloaf roll, perfect for sharing."),
  defineProduct("chicken-embotido-big", "Chicken Embotido (Big)", ["embotido", "chicken"], 55, 50,
    "A full size Filipino chicken meatloaf roll, perfect for sharing."),
  defineProduct("sweet-spicy-longganisa", "Sweet and Spicy Longganisa", ["longganisa"], 60, 55,
    "Our sweet longganisa with a kick of chili heat."),
  defineProduct("native-longganisa", "Native Longganisa", ["longganisa"], 60, 60,
    "Traditional, garlicky native style longganisa."),
  defineProduct("de-recado-longganisa", "De Recado (Garlic) Longganisa", ["longganisa"], 60, 58,
    "Savory longganisa loaded with garlic, in the de recado style."),
  defineProduct("sweet-ham", "Sweet Ham", ["ham"], 45, 42,
    "Sweet cured ham slices. Pan fry until the edges caramelize."),
  defineProduct("ham-cheese-round", "Ham and Cheese (Round)", ["ham"], 45, 42,
    "Ham and cheese in a round cut, ready to fry for breakfast or baon."),
  defineProduct("ham-cheese-rectangle", "Ham and Cheese (Rectangle)", ["ham"], 45, 42,
    "Ham and cheese in a rectangle cut, ready to fry for breakfast or baon."),
  defineProduct("pork-tapa", "Pork Tapa", ["tocino-tapa"], 70, 70,
    "Savory marinated pork tapa. Fry and pair with garlic rice and egg for tapsilog."),
  defineProduct("pork-tocino", "Pork Tocino", ["tocino-tapa"], 60, 55,
    "Sweet cured pork slices with that signature red glaze. Made for a classic tosilog breakfast.",
    { gallery: ["photo", "poster"] }),
]);

const MAX_QTY = 500;

/* Wholesale pricing applies to every line once the order reaches the minimum total packs. */
const isWholesaleOrder = (totalPacks) => totalPacks >= CONFIG.wholesaleMinPacks;
const unitPriceFor = (product, totalPacks) => (isWholesaleOrder(totalPacks) ? product.wholesalePrice : product.price);

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG, CATEGORIES, PRODUCTS, MAX_QTY, isWholesaleOrder, unitPriceFor };
}
