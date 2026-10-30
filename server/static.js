"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
});

/** Serves files from publicDir only. Rejects path traversal and dotfiles. */
function serveStatic(publicDir, req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return sendText(res, 400, "Bad request");
  }
  if (pathname.endsWith("/")) pathname += "index.html";

  const filePath = path.normalize(path.join(publicDir, pathname));
  const insideRoot = filePath.startsWith(publicDir + path.sep);
  const hasDotfile = filePath.slice(publicDir.length).split(path.sep).some((seg) => seg.startsWith("."));
  const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()];
  if (!insideRoot || hasDotfile || !type) return sendNotFound(publicDir, res);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendNotFound(publicDir, res);
    /* Code and pages always revalidate so price changes reach customers right away. Images can be cached. */
    const isImage = type.startsWith("image/");
    const lastModified = stat.mtime.toUTCString();
    if (req.headers["if-modified-since"] === lastModified) {
      res.writeHead(304, { "Last-Modified": lastModified });
      return res.end();
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stat.size,
      "Last-Modified": lastModified,
      "Cache-Control": isImage ? "public, max-age=86400" : "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

function sendNotFound(publicDir, res) {
  const notFoundPage = path.join(publicDir, "index.html");
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  fs.createReadStream(notFoundPage).on("error", () => res.end("Not found")).pipe(res);
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

module.exports = { serveStatic };
