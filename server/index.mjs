import express from 'express';
import http from 'http';
import fs from 'fs/promises';
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

const app = express();

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
  }
  next();
});

app.use(express.json({ limit: '16kb' }));

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

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const scores = await readScores();
    const sorted = [...scores].sort(sortScoresDesc);
    const top = sorted.slice(0, 3);
    res.json({ scores: top });
  } catch (e) {
    res.status(500).json({ error: 'read_failed' });
  }
});

app.post('/api/leaderboard', async (req, res) => {
  try {
    const distance = Number(req.body?.distance);
    if (!Number.isFinite(distance) || distance < 0 || distance > 1e9) {
      res.status(400).json({ error: 'invalid_distance' });
      return;
    }
    const name = sanitizeName(req.body?.name);
    const at = new Date().toISOString();
    const scores = await readScores();
    const merged = [...scores, { name, distance: Math.floor(distance), at }];
    merged.sort(sortScoresDesc);
    const top = merged.slice(0, 3);
    await writeScores(top);
    res.json({ scores: top });
  } catch (e) {
    res.status(500).json({ error: 'write_failed' });
  }
});

/** Replace stored leaderboard with up to three entries (sorted by distance descending before save). */
app.put('/api/leaderboard', async (req, res) => {
  try {
    if (!adminAuthorized(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const raw = req.body?.scores;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 3) {
      res.status(400).json({ error: 'scores must be a non-empty array with at most 3 entries' });
      return;
    }
    const now = new Date().toISOString();
    const parsed = [];
    for (const row of raw) {
      const distance = Number(row?.distance);
      if (!Number.isFinite(distance) || distance < 0 || distance > 1e9) {
        res.status(400).json({ error: 'invalid_distance', detail: row });
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
    res.json({ scores: top });
  } catch (e) {
    res.status(500).json({ error: 'write_failed' });
  }
});

app.get('/api/level-times', async (req, res) => {
  try {
    const level = Number(req.query?.level);
    if (!Number.isFinite(level) || level < 1 || level > 999) {
      res.status(400).json({ error: 'invalid_level' });
      return;
    }
    const levels = await readLevelTimes();
    const key = String(Math.floor(level));
    const rows = Array.isArray(levels[key]) ? levels[key] : [];
    const sorted = [...rows].sort(sortTimesAsc);
    res.json({ level: Math.floor(level), scores: sorted.slice(0, 3) });
  } catch {
    res.status(500).json({ error: 'read_failed' });
  }
});

app.post('/api/level-times', async (req, res) => {
  try {
    const level = Number(req.body?.level);
    const timeMs = Number(req.body?.timeMs);
    if (!Number.isFinite(level) || level < 1 || level > 999) {
      res.status(400).json({ error: 'invalid_level' });
      return;
    }
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 3_600_000) {
      res.status(400).json({ error: 'invalid_time' });
      return;
    }
    const name = sanitizeName(req.body?.name);
    const at = new Date().toISOString();

    const levels = await readLevelTimes();
    const key = String(Math.floor(level));
    const prev = Array.isArray(levels[key]) ? levels[key] : [];
    const merged = [...prev, { name, timeMs: Math.floor(timeMs), at }];
    merged.sort(sortTimesAsc);
    levels[key] = merged.slice(0, 3);
    await writeLevelTimes(levels);
    res.json({ level: Math.floor(level), scores: levels[key] });
  } catch {
    res.status(500).json({ error: 'write_failed' });
  }
});

const dist = path.join(root, 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

const server = http.createServer(app);
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
