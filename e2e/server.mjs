// Serves the production build (dist/) the way Cloudflare does, for the browser tests:
// the response headers from dist/_headers (Content-Security-Policy included), "/privacy"
// for privacy.html, index.html for unknown paths (single-page app), and no API: /api/*
// answers 404, as when signed out with the server unreachable.
//
// node e2e/server.mjs [port]
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = join(import.meta.dirname, "..", "dist");
const port = Number(process.argv[2] ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
};

/** The _headers file as [pattern, headers] rules: an unindented path line, then indented "Name: value" lines. */
function readHeaderRules(file) {
  const rules = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push([line.trim(), {}]);
      continue;
    }
    const at = line.indexOf(":");
    if (at > 0 && rules.length) rules.at(-1)[1][line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return rules;
}

const rules = readHeaderRules(join(root, "_headers"));
const matches = (pattern, path) => (pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

/** The file a path is served from: itself, path + ".html", or index.html. */
function fileFor(path) {
  const direct = join(root, normalize(path));
  if (!direct.startsWith(root)) return null;
  if (existsSync(direct) && statSync(direct).isFile()) return direct;
  if (existsSync(`${direct}.html`)) return `${direct}.html`;
  return join(root, "index.html");
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  if (path.startsWith("/api/")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end('{"error":"not found"}');
    return;
  }
  const file = fileFor(path);
  if (!file) {
    res.writeHead(400);
    res.end();
    return;
  }
  const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" };
  for (const [pattern, values] of rules) if (matches(pattern, path)) Object.assign(headers, values);
  res.writeHead(200, headers);
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => process.stdout.write(`Serving dist/ on http://127.0.0.1:${port}\n`));
