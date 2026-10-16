#!/usr/bin/env node
/**
 * Zero-dependency static file server for the graphing calculator.
 *
 *   npm start          -> http://0.0.0.0:3000
 *   PORT=8080 npm start
 *
 * Binds to 0.0.0.0 so it works inside containers / sandboxes / LAN previews.
 * Only an explicit allow-list of static assets is served — dotfiles, .git,
 * node_modules and the server/tests themselves are never exposed.
 */
import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * Top-level entries that may ever be served. Anything else 404s, no matter how
 * it is spelled in the request.
 */
export const PUBLIC_PATHS = new Set(['index.html', 'styles.css', 'src', 'public', 'assets', 'favicon.ico', 'robots.txt']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Resolve a request path to a servable file inside ROOT, or null. */
export async function resolveFile(pathname) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  // Reject NUL bytes and any dot-segment (".git", ".env", ".ssh", ...).
  if (decoded.includes('\0')) return null;
  const segments = decoded.split(/[/\\]+/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith('.'))) return null;

  // Only allow-list roots are reachable.
  if (segments.length === 0) return null;
  const [first, ...rest] = segments;
  if (!PUBLIC_PATHS.has(first)) return null;
  if (rest.length === 0 && first !== 'index.html') {
    // "/src" would be a directory listing; require a real file path.
    const direct = path.join(ROOT, first);
    if (path.extname(first) === '') {
      const html = await statFile(path.join(direct, 'index.html'));
      return html;
    }
    return statFile(direct);
  }

  let target = ROOT;
  for (const segment of segments) target = path.join(target, segment);
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) return null;

  return statFile(target);
}

async function statFile(target) {
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) return statFile(path.join(target, 'index.html'));
    return stat.isFile() ? target : null;
  } catch {
    return null;
  }
}

export function createStaticServer(options = {}) {
  const quiet = options.quiet ?? false;

  return createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    const file = await resolveFile(url.pathname === '/' ? '/index.html' : url.pathname);

    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('404 Not Found');
      if (!quiet) log(req, 404, started);
      return;
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      // Always serve fresh code while hacking on this thing.
      'cache-control': 'no-store, must-revalidate',
      // No restrictive security headers: the page is meant to be embeddable.
    });

    if (req.method === 'HEAD') {
      res.end();
      if (!quiet) log(req, 200, started);
      return;
    }

    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res)
      .on('finish', () => !quiet && log(req, 200, started));
  });
}

function log(req, status, started) {
  console.log(`${status} ${req.method} ${req.url} (${Date.now() - started}ms)`);
}

/* Listen only when executed directly (so tests can import this module). */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  createStaticServer().listen(port, host, () => {
    console.log(`\n  Graphing Calculator running at http://localhost:${port}\n`);
  });
}
