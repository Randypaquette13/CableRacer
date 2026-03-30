import express from 'express';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
/** Railway: mount a volume and set LEADERBOARD_FILE to a path inside it for persistence across deploys. */
const DATA_FILE = process.env.LEADERBOARD_FILE || path.join(root, 'data', 'leaderboard.json');
const BASE_PORT = Number(process.env.PORT) || 3001;
/** When PORT is unset (local dev), try next ports if EADDRINUSE. Railway always sets PORT. */
const TRY_PORT_FALLBACK = process.env.PORT === undefined;

const app = express();

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

/** Higher distance first; on equal distance, newer `at` wins so a fresh submission replaces an old tie. */
function sortScoresDesc(a, b) {
  if (b.distance !== a.distance) {
    return b.distance - a.distance;
  }
  return String(b.at).localeCompare(String(a.at));
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

const dist = path.join(root, 'dist');
app.use(express.static(dist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(dist, 'index.html'));
});

const server = http.createServer(app);
let listenPort = BASE_PORT;
const maxPort = TRY_PORT_FALLBACK ? BASE_PORT + 15 : BASE_PORT;

function onListening() {
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : listenPort;
  console.log(`CableRacer server listening on ${p} (data: ${DATA_FILE})`);
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

server.listen(listenPort, onListening);
