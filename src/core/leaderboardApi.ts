/**
 * Use same-origin `/api` (Vite proxies to the Node server in dev; Express serves API + static in prod).
 * Set `VITE_API_BASE` only for a split deployment (e.g. API on another host).
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export type LeaderboardEntry = {
  name: string;
  distance: number;
  at: string;
};

export type LeaderboardResult = {
  scores: LeaderboardEntry[];
  /** Set when the request fails so the UI can explain instead of failing silently. */
  error: string | null;
};

function normalizeEntry(raw: Partial<LeaderboardEntry>): LeaderboardEntry {
  const distance = Math.floor(Number(raw.distance));
  return {
    name: String(raw.name ?? ''),
    distance: Number.isFinite(distance) ? distance : 0,
    at: String(raw.at ?? ''),
  };
}

export async function fetchLeaderboard(): Promise<LeaderboardResult> {
  try {
    const r = await fetch(`${API_BASE}/api/leaderboard`);
    if (!r.ok) {
      return { scores: [], error: `Server returned ${r.status}` };
    }
    const j = (await r.json()) as { scores?: LeaderboardEntry[] };
    if (!Array.isArray(j.scores)) {
      return { scores: [], error: 'Bad response: scores missing' };
    }
    return { scores: j.scores.map((e) => normalizeEntry(e)), error: null };
  } catch (e) {
    return { scores: [], error: `Network error: ${String(e)}` };
  }
}

type EntryWithFlag = LeaderboardEntry & { isNew?: boolean };

/**
 * True if this run would appear in the top three after merging.
 * Same distance as an existing row: new run ranks ahead so ties still qualify for name entry.
 */
export function wouldMakeTopThree(distance: number, entries: LeaderboardEntry[]): boolean {
  const d = Math.floor(Number(distance));
  if (!Number.isFinite(d) || d < 0) {
    return false;
  }
  const combined: EntryWithFlag[] = [
    ...entries.map((e) => ({ ...e })),
    { name: '', distance: d, at: '', isNew: true },
  ];
  combined.sort((a, b) => {
    if (b.distance !== a.distance) {
      return b.distance - a.distance;
    }
    if (a.isNew && !b.isNew) {
      return -1;
    }
    if (!a.isNew && b.isNew) {
      return 1;
    }
    return 0;
  });
  const top3 = combined.slice(0, 3);
  return top3.some((e) => e.isNew === true);
}

export async function submitScore(name: string, distance: number): Promise<LeaderboardResult> {
  try {
    const r = await fetch(`${API_BASE}/api/leaderboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, distance: Math.floor(Number(distance)) }),
    });
    if (!r.ok) {
      return { scores: [], error: `Save failed (${r.status})` };
    }
    const j = (await r.json()) as { scores?: LeaderboardEntry[] };
    if (!Array.isArray(j.scores)) {
      return { scores: [], error: 'Bad response after save' };
    }
    return { scores: j.scores.map((e) => normalizeEntry(e)), error: null };
  } catch (e) {
    return { scores: [], error: `Save error: ${String(e)}` };
  }
}
