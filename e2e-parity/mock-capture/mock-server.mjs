#!/usr/bin/env node
/**
 * Minimal static file server for the frozen-mock capture harness (issue #2076 Amendment-1, AC12).
 *
 * Serves docs/design/retrends-design-system/ AS THE DOCUMENT ROOT — this is a verified hard
 * requirement, not a preference. index.html references ../../styles.css and ../../_ds_bundle.js;
 * serving from ui_kits/new_discover/ instead 404s the bundle and throws 6x "Cannot read properties
 * of undefined (reading 'Icon')" (see docs/audit/issue-2076/state-mapping.md). This server is
 * launched by playwright.mock-capture.config.ts's `webServer.command` and torn down by Playwright
 * itself when the test run ends — no manual process management is required by callers.
 *
 * Deliberately dependency-free (plain node:http) — no new package.json dependency was justified
 * for a handful of static file types.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// docs/design/retrends-design-system/, resolved from this file's location
// (e2e-parity/mock-capture/mock-server.mjs) — never CWD-relative, so it works the same whether
// Playwright launches this script from the repo root or from within this directory.
const DOC_ROOT = path.resolve(__dirname, '../../docs/design/retrends-design-system');

const PORT = Number(process.env.MOCK_CAPTURE_PORT || 8927);
const HOST = '127.0.0.1';

if (!fs.existsSync(DOC_ROOT)) {
  console.error(`[mock-server] FATAL: document root does not exist: ${DOC_ROOT}`);
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const requestUrl = req.url || '/';
  const requestPath = decodeURIComponent(requestUrl.split('?')[0]);

  // Reject any path-traversal attempt outright rather than trying to sanitise it into something
  // "safe" — a static server for a fixed, known-content directory has no legitimate need to
  // resolve outside DOC_ROOT.
  const resolved = path.resolve(DOC_ROOT, `.${requestPath}`);
  if (!resolved.startsWith(DOC_ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden: path escapes document root');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Not found: ${requestPath}`);
      return;
    }
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-server] serving ${DOC_ROOT} at http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
