// Local preview of the two public sites kept in this folder.
//
//   node sites/preview-server.mjs            -> http://localhost:4310 (Mahar POS landing)
//                                               http://localhost:4310/maharshwe/ (Mahar Shwe Mobile)
//
// The pages read their live figures from /api/public/...; here those calls are passed on to
// the real site (read only), so the preview shows the same numbers the public sees.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4310);
const LIVE = "https://maharpos.shop";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/public/")) {
    try {
      const upstream = await fetch(LIVE + url.pathname + url.search, { signal: AbortSignal.timeout(10000) });
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json" });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end('{"ok":false}');
    }
    return;
  }
  const brand = url.pathname === "/maharshwe" || url.pathname.startsWith("/maharshwe/");
  const root = path.join(here, brand ? "maharshwe.shop" : "maharpos.shop");
  let rel = decodeURIComponent(brand ? url.pathname.slice("/maharshwe".length) : url.pathname);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}  and  http://localhost:${PORT}/maharshwe/`));
