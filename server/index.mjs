import http from 'http';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
/** Railway: mount a volume and set LEADERBOARD_FILE to a path inside it for persistence across deploys. */
const DATA_FILE = process.env.LEADERBOARD_FILE || path.join(root, 'data', 'leaderboard.json');
/** Optional separate file for per-level time boards (recommended to place on a volume in prod). */
const LEVEL_TIMES_FILE = process.env.LEVEL_TIMES_FILE || path.join(root, 'data', 'level-times.json');
/** If set, PUT /api/leaderboard requires Authorization: Bearer <token> or X-Admin-Token: <token>. */
const LEADERBOARD_ADMIN_TOKEN = process.env.LEADERBOARD_ADMIN_TOKEN;
const BASE_PORT = Number(process.env.PORT) || 3001;
/** When PORT is unset (local dev), try next ports if EADDRINUSE. Railway always sets PORT. */
const TRY_PORT_FALLBACK = process.env.PORT === undefined;

function sanitizeName(raw) {
  const s = String(raw ?? '').trim().slice(0, 24);
  const cleaned = s.replace(/[^a-zA-Z0-9\s._-]/g, '');
  return cleaned.trim() || 'Anonymous';
}

async function readScores() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.scores) ? data.scores : [];
  } catch {
    return [];
  }
}

async function writeScores(scores) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify({ scores }, null, 2), 'utf8');
}

async function readLevelTimes() {
  try {
    const raw = await fs.readFile(LEVEL_TIMES_FILE, 'utf8');
    const data = JSON.parse(raw);
    return typeof data === 'object' && data && typeof data.levels === 'object' ? data.levels : {};
  } catch {
    return {};
  }
}

async function writeLevelTimes(levels) {
  await fs.mkdir(path.dirname(LEVEL_TIMES_FILE), { recursive: true });
  await fs.writeFile(LEVEL_TIMES_FILE, JSON.stringify({ levels }, null, 2), 'utf8');
}

/** Higher distance first; on equal distance, newer `at` wins so a fresh submission replaces an old tie. */
function sortScoresDesc(a, b) {
  if (b.distance !== a.distance) {
    return b.distance - a.distance;
  }
  return String(b.at).localeCompare(String(a.at));
}

/** Lower timeMs first; on equal time, newer `at` wins. */
function sortTimesAsc(a, b) {
  if (a.timeMs !== b.timeMs) {
    return a.timeMs - b.timeMs;
  }
  return String(b.at).localeCompare(String(a.at));
}

function adminAuthorized(req) {
  if (!LEADERBOARD_ADMIN_TOKEN) {
    return true;
  }
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const header = req.headers['x-admin-token'];
  return bearer === LEADERBOARD_ADMIN_TOKEN || header === LEADERBOARD_ADMIN_TOKEN;
}

// --- Minimal HTTP layer on plain node:http (Express added ~14MB of idle RSS for 5 routes) ---

const JSON_BODY_LIMIT = 16 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** Reads a JSON body like express.json(): non-JSON content types and empty bodies yield undefined. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!/^application\/(.+\+)?json\b/i.test(type)) {
      req.resume();
      resolve(undefined);
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > JSON_BODY_LIMIT) {
        // Stop buffering but keep the socket alive so the 413 reaches the client (sent with Connection: close).
        chunks.length = 0;
        reject(new HttpError(413, 'payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > JSON_BODY_LIMIT) {
        return;
      }
      if (size === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

async function getLeaderboard(_req, res) {
  try {
    const scores = await readScores();
    const sorted = [...scores].sort(sortScoresDesc);
    sendJson(res, 200, { scores: sorted.slice(0, 3) });
  } catch {
    sendJson(res, 500, { error: 'read_failed' });
  }
}

async function postLeaderboard(_req, res, body) {
  try {
    const distance = Number(body?.distance);
    if (!Number.isFinite(distance) || distance < 0 || distance > 1e9) {
      sendJson(res, 400, { error: 'invalid_distance' });
      return;
    }
    const name = sanitizeName(body?.name);
    const at = new Date().toISOString();
    const scores = await readScores();
    const merged = [...scores, { name, distance: Math.floor(distance), at }];
    merged.sort(sortScoresDesc);
    const top = merged.slice(0, 3);
    await writeScores(top);
    sendJson(res, 200, { scores: top });
  } catch {
    sendJson(res, 500, { error: 'write_failed' });
  }
}

/** Replace stored leaderboard with up to three entries (sorted by distance descending before save). */
async function putLeaderboard(req, res, body) {
  try {
    if (!adminAuthorized(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const raw = body?.scores;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 3) {
      sendJson(res, 400, { error: 'scores must be a non-empty array with at most 3 entries' });
      return;
    }
    const now = new Date().toISOString();
    const parsed = [];
    for (const row of raw) {
      const distance = Number(row?.distance);
      if (!Number.isFinite(distance) || distance < 0 || distance > 1e9) {
        sendJson(res, 400, { error: 'invalid_distance', detail: row });
        return;
      }
      const name = sanitizeName(row?.name);
      const atRaw = row?.at;
      const at =
        typeof atRaw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(atRaw) ? atRaw : now;
      parsed.push({ name, distance: Math.floor(distance), at });
    }
    parsed.sort(sortScoresDesc);
    const top = parsed.slice(0, 3);
    await writeScores(top);
    sendJson(res, 200, { scores: top });
  } catch {
    sendJson(res, 500, { error: 'write_failed' });
  }
}

async function getLevelTimes(_req, res, _body, url) {
  try {
    const level = Number(url.searchParams.get('level') ?? undefined);
    if (!Number.isFinite(level) || level < 1 || level > 999) {
      sendJson(res, 400, { error: 'invalid_level' });
      return;
    }
    const levels = await readLevelTimes();
    const key = String(Math.floor(level));
    const rows = Array.isArray(levels[key]) ? levels[key] : [];
    const sorted = [...rows].sort(sortTimesAsc);
    sendJson(res, 200, { level: Math.floor(level), scores: sorted.slice(0, 3) });
  } catch {
    sendJson(res, 500, { error: 'read_failed' });
  }
}

async function postLevelTimes(_req, res, body) {
  try {
    const level = Number(body?.level);
    const timeMs = Number(body?.timeMs);
    if (!Number.isFinite(level) || level < 1 || level > 999) {
      sendJson(res, 400, { error: 'invalid_level' });
      return;
    }
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 3_600_000) {
      sendJson(res, 400, { error: 'invalid_time' });
      return;
    }
    const name = sanitizeName(body?.name);
    const at = new Date().toISOString();

    const levels = await readLevelTimes();
    const key = String(Math.floor(level));
    const prev = Array.isArray(levels[key]) ? levels[key] : [];
    const merged = [...prev, { name, timeMs: Math.floor(timeMs), at }];
    merged.sort(sortTimesAsc);
    levels[key] = merged.slice(0, 3);
    await writeLevelTimes(levels);
    sendJson(res, 200, { level: Math.floor(level), scores: levels[key] });
  } catch {
    sendJson(res, 500, { error: 'write_failed' });
  }
}

const API_ROUTES = {
  '/api/leaderboard': { GET: getLeaderboard, POST: postLeaderboard, PUT: putLeaderboard },
  '/api/level-times': { GET: getLevelTimes, POST: postLevelTimes },
};

// --- Static files (built client in dist/, SPA fallback to index.html) ---

const dist = path.join(root, 'dist');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function statFile(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

async function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let filePath = path.join(dist, path.normalize(rel));
  if (filePath !== dist && !filePath.startsWith(dist + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  let st = await statFile(filePath);
  if (!st) {
    // Directory index, then SPA fallback (same as the old app.get('*') → index.html).
    const dirIndex = path.join(filePath, 'index.html');
    st = await statFile(dirIndex);
    filePath = st ? dirIndex : path.join(dist, 'index.html');
    st = st || (await statFile(filePath));
    if (!st) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
  }

  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const isHtml = path.extname(filePath).toLowerCase() === '.html';
  const headers = {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Last-Modified': st.mtime.toUTCString(),
    ETag: etag,
    // Vite fingerprints dist/assets/*, so those can be cached for good; HTML must revalidate.
    'Cache-Control':
      !isHtml && pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers).end();
    return;
  }
  headers['Content-Length'] = st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    res.writeHead(400).end();
    return;
  }
  const { pathname } = url;
  const method = req.method || 'GET';

  try {
    if (pathname.startsWith('/api')) {
      for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
      if (method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      const route = API_ROUTES[pathname.replace(/\/+$/, '')];
      const handler = route?.[method] ?? (method === 'HEAD' ? route?.GET : undefined);
      if (!handler) {
        sendJson(res, 404, { error: 'not_found' });
        return;
      }
      const body = method === 'POST' || method === 'PUT' ? await readJsonBody(req) : undefined;
      await handler(req, res, body, url);
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (e) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (e instanceof HttpError) {
      res.setHeader('Connection', 'close');
      sendJson(res, e.status, { error: e.code });
      return;
    }
    console.error(e);
    sendJson(res, 500, { error: 'internal_error' });
  }
}

const server = http.createServer(handleRequest);
let listenPort = BASE_PORT;
const maxPort = TRY_PORT_FALLBACK ? BASE_PORT + 15 : BASE_PORT;
let shuttingDown = false;

function onListening() {
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : listenPort;
  console.log(`CableRacer server listening on ${p} (data: ${DATA_FILE})`);
  if (!LEADERBOARD_ADMIN_TOKEN) {
    console.warn('LEADERBOARD_ADMIN_TOKEN unset — PUT /api/leaderboard has no auth.');
  }
  if (TRY_PORT_FALLBACK && p !== 3001) {
    console.warn(
      `Vite dev proxy targets port 3001. Either free 3001 and restart, or point vite proxy at http://127.0.0.1:${p}.`,
    );
  }
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && TRY_PORT_FALLBACK && listenPort < maxPort) {
    const taken = listenPort;
    listenPort += 1;
    console.warn(`Port ${taken} in use, trying ${listenPort}...`);
    server.listen(listenPort, onListening);
    return;
  }
  console.error(err);
  process.exit(1);
});

function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Received ${signal}; closing HTTP server...`);
  server.close((err) => {
    if (err) {
      console.error('Error while closing server:', err);
      process.exit(1);
      return;
    }
    console.log('HTTP server closed cleanly.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(listenPort, onListening);
