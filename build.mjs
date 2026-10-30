/*
 * Production build: public/ (source) -> dist/ (what gets served).
 *
 * 1. Copies static files (images, fonts, robots.txt).
 * 2. Minifies all CSS and inlines it into every page (no render-blocking request).
 * 3. Bundles and minifies the JS into one hashed, cacheable, deferred file.
 * 4. Prerenders the header, footer, dialogs, filters and product cards into the
 *    HTML so nothing shifts when JavaScript starts.
 */
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "public");
const OUT = path.join(ROOT, "dist");

const CSS_FILES = ["fonts", "base", "layout", "components", "pages"].map((n) => `css/${n}.css`);
const JS_FILES = ["config", "utils", "layout", "cart", "dialogs", "checkout", "main"].map((n) => `js/${n}.js`);
const PRELOAD_FONTS = ["fonts/dm-sans.woff2", "fonts/oswald.woff2"];
const COPY_DIRS = ["images", "fonts"];

const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 10);

async function buildCss() {
  const source = CSS_FILES.map(read).join("\n");
  const { code } = await transform(source, { loader: "css", minify: true, target: ["chrome100", "safari15", "firefox100"] });
  /* The CSS is inlined into pages at the site root, so "../images" becomes "images". */
  return code.replaceAll("../", "");
}

async function buildJs() {
  const source = JS_FILES.map(read).join("\n;\n");
  const { code } = await transform(`(() => {\n${source}\n})();`, { loader: "js", minify: true, target: "es2020" });
  const name = `assets/app.${hash(code)}.js`;
  mkdirSync(path.join(OUT, "assets"), { recursive: true });
  writeFileSync(path.join(OUT, name), code);
  return name;
}

/* Runs the real layout and card templates in a sandbox so prerendered HTML matches what the browser would render. */
function loadTemplates() {
  const source = ["js/config.js", "js/utils.js", "js/layout.js", "js/cart.js"].map(read).join("\n;\n");
  const context = vm.createContext({ Intl, console, localStorage: undefined });
  vm.runInContext(
    `${source}
    globalThis.__t = { CONFIG, CATEGORIES, headerHTML, footerHTML, cartDrawerHTML, productModalHTML,
      checkoutModalHTML, productsForDisplay, productCardHTML, money };`,
    context
  );
  return context.__t;
}

function filtersHTML(t) {
  return t.CATEGORIES.map(
    (c, i) => `<button type="button" class="chip${i === 0 ? " is-active" : ""}" data-filter="${c.id}" aria-pressed="${i === 0}">${c.label}</button>`
  ).join("");
}

function buildPage(html, { t, css, jsFile }) {
  const page = /<body data-page="([^"]*)">/.exec(html)?.[1] ?? "";
  const preloads = PRELOAD_FONTS.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join("\n  ");
  const chrome =
    t.footerHTML() + t.cartDrawerHTML() + t.productModalHTML() + t.checkoutModalHTML() +
    `<div class="toast" role="status" aria-live="polite" data-toast hidden></div>`;
  const cards = t.productsForDisplay().map((p, i) => t.productCardHTML(p, i)).join("");

  const steps = [
    [/(\s*<link rel="stylesheet" href="css\/[^"]+">)+/, `\n  ${preloads}\n  <style>${css}</style>`],
    [/(<body data-page="[^"]*">)/, `$1${t.headerHTML(page)}`],
    [/(\s*<script src="js\/[^"]+"><\/script>)+/, `\n  ${chrome}\n  <script src="${jsFile}" defer></script>`],
    [/(<div class="filters"[^>]*data-filters>)(<\/div>)/g, `$1${filtersHTML(t)}$2`],
    [/(<div class="product-grid" data-product-grid>)(<\/div>)/g, `$1${cards}$2`],
    [/(<(\w+)[^>]*data-config="(\w+)"[^>]*>)(<\/\2>)/g, (_, open, _tag, key, close) => `${open}${t.money(t.CONFIG[key])}${close}`],
  ];
  return steps.reduce((out, [pattern, replacement]) => {
    if (!pattern.global && !pattern.test(out)) throw new Error(`build: pattern not found in ${page || "page"}: ${pattern}`);
    return out.replace(pattern, replacement);
  }, html);
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const dir of COPY_DIRS) cpSync(path.join(SRC, dir), path.join(OUT, dir), { recursive: true });
  cpSync(path.join(SRC, "robots.txt"), path.join(OUT, "robots.txt"));

  const [css, jsFile] = await Promise.all([buildCss(), buildJs()]);
  const t = loadTemplates();
  const pages = readdirSync(SRC).filter((f) => f.endsWith(".html"));
  for (const file of pages) writeFileSync(path.join(OUT, file), buildPage(read(file), { t, css, jsFile }));

  const jsSize = readFileSync(path.join(OUT, jsFile)).length;
  console.info(`build: ${pages.length} pages, inline CSS ${(css.length / 1024).toFixed(1)} KB, ${jsFile} ${(jsSize / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
