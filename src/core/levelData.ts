/** Timed levels: geometry + placements. X uses ratio of game width (0–1); Y uses pixels above startY (positive = further up). */
export type LevelPad = {
  xRatio: number;
  dyFromStart: number;
  w: number;
  h: number;
};

export type LevelCoin = {
  xRatio: number;
  dyFromStart: number;
};

/**
 * Solid slab in world space: x from xRatioLeft..xRatioRight, y from startY-dyTop .. startY-dyBottom
 * (dyTop > dyBottom so the band reaches further upward).
 */
export type LevelWall = {
  xRatioLeft: number;
  xRatioRight: number;
  dyTop: number;
  dyBottom: number;
};

export type LevelDefinition = {
  /** 1-based display id */
  id: number;
  title: string;
  dividerCount: number;
  gateWidth: number;
  targetXRatio: number;
  /** target world y = startY - targetDyFromStart */
  targetDyFromStart: number;
  targetRadius: number;
  pads: LevelPad[];
  coins: LevelCoin[];
  /** Optional vertical wall chunks (variation). */
  walls?: LevelWall[];
  /** Divider stack indices (1-based) with a narrower gate opening. */
  tightStacks?: number[];
};

export const LEVEL_COUNT = 10;

function pad(
  xRatio: number,
  dyFromStart: number,
  w: number,
  h: number,
): LevelPad {
  return { xRatio, dyFromStart, w, h };
}

function coin(xRatio: number, dyFromStart: number): LevelCoin {
  return { xRatio, dyFromStart };
}

function wall(xL: number, xR: number, dyBottom: number, dyTop: number): LevelWall {
  return { xRatioLeft: xL, xRatioRight: xR, dyTop, dyBottom };
}

/** Ramped difficulty: more dividers, narrower gates, longer reach, denser obstacles. */
export const LEVELS: LevelDefinition[] = [
  {
    id: 1,
    title: 'First Hook',
    dividerCount: 2,
    gateWidth: 320,
    targetXRatio: 0.5,
    targetDyFromStart: 2 * 340 + 300,
    targetRadius: 58,
    pads: [pad(0.5, 380, 120, 40)],
    coins: [coin(0.5, 260), coin(0.5, 520), coin(0.48, 720)],
  },
  {
    id: 2,
    title: 'Switchback',
    dividerCount: 4,
    gateWidth: 252,
    targetXRatio: 0.5,
    targetDyFromStart: 4 * 340 + 260,
    targetRadius: 42,
    pads: [pad(0.28, 680, 88, 32), pad(0.72, 1180, 88, 32), pad(0.5, 1580, 96, 36)],
    coins: [coin(0.5, 350), coin(0.72, 800), coin(0.28, 1280), coin(0.5, 1680)],
    walls: [wall(0.66, 0.93, 520, 700)],
    tightStacks: [4],
  },
  {
    id: 3,
    title: 'Gates',
    dividerCount: 5,
    gateWidth: 240,
    targetXRatio: 0.55,
    targetDyFromStart: 5 * 340 + 240,
    targetRadius: 40,
    pads: [pad(0.5, 600, 92, 32), pad(0.35, 1050, 84, 30), pad(0.65, 1500, 84, 30)],
    coins: [coin(0.5, 450), coin(0.35, 950), coin(0.65, 1400), coin(0.5, 1900)],
    walls: [wall(0.58, 0.82, 680, 800)],
    tightStacks: [3],
  },
  {
    id: 4,
    title: 'Narrow Path',
    dividerCount: 6,
    gateWidth: 228,
    targetXRatio: 0.45,
    targetDyFromStart: 6 * 340 + 220,
    targetRadius: 40,
    pads: [pad(0.72, 720, 80, 30), pad(0.28, 1200, 80, 30), pad(0.5, 1750, 88, 34)],
    coins: [coin(0.5, 380), coin(0.72, 850), coin(0.28, 1300), coin(0.5, 1850), coin(0.35, 2200)],
    walls: [wall(0.1, 0.32, 850, 1040)],
    tightStacks: [2, 5],
  },
  {
    id: 5,
    title: 'Velocity',
    dividerCount: 7,
    gateWidth: 216,
    targetXRatio: 0.5,
    targetDyFromStart: 7 * 340 + 200,
    targetRadius: 38,
    pads: [
      pad(0.5, 440, 106, 40),
      pad(0.33, 880, 92, 34),
      pad(0.67, 1180, 92, 34),
      pad(0.5, 1980, 129, 54),
    ],
    coins: [coin(0.5, 320), coin(0.33, 720), coin(0.67, 1120), coin(0.5, 1520), coin(0.67, 2100)],
    walls: [wall(0.7, 0.9, 460, 620)],
    tightStacks: [5],
  },
  {
    id: 6,
    title: 'Hairpins',
    dividerCount: 8,
    gateWidth: 204,
    targetXRatio: 0.52,
    targetDyFromStart: 8 * 340 + 200,
    targetRadius: 38,
    pads: [
      pad(0.72, 640, 74, 28),
      pad(0.28, 1100, 74, 28),
      pad(0.5, 1560, 84, 32),
      pad(0.38, 2200, 70, 28),
    ],
    coins: [coin(0.5, 400), coin(0.72, 900), coin(0.28, 1450), coin(0.5, 1900), coin(0.38, 2350)],
    walls: [wall(0.08, 0.27, 1020, 1240), wall(0.72, 0.9, 1680, 1880)],
    tightStacks: [3, 7],
  },
  {
    id: 7,
    title: 'Squeeze',
    dividerCount: 9,
    gateWidth: 190,
    targetXRatio: 0.48,
    targetDyFromStart: 9 * 340 + 180,
    targetRadius: 36,
    pads: [
      pad(0.5, 580, 80, 30),
      pad(0.72, 1080, 72, 26),
      pad(0.28, 1580, 72, 26),
      pad(0.5, 2480, 88, 34),
    ],
    coins: [coin(0.5, 350), coin(0.72, 820), coin(0.28, 1280), coin(0.5, 1720), coin(0.28, 2600)],
    walls: [wall(0.63, 0.88, 580, 760), wall(0.14, 0.36, 1350, 1530)],
    tightStacks: [4],
  },
  {
    id: 8,
    title: 'Ascent',
    dividerCount: 10,
    gateWidth: 178,
    targetXRatio: 0.5,
    targetDyFromStart: 10 * 340 + 180,
    targetRadius: 36,
    pads: [
      pad(0.35, 700, 68, 26),
      pad(0.65, 1200, 68, 26),
      pad(0.5, 1700, 80, 30),
      pad(0.72, 2300, 68, 26),
    ],
    coins: [coin(0.5, 420), coin(0.35, 880), coin(0.65, 1350), coin(0.5, 1880), coin(0.72, 2500)],
    walls: [wall(0.6, 0.88, 800, 980)],
    tightStacks: [6],
  },
  {
    id: 9,
    title: 'Gauntlet',
    dividerCount: 11,
    gateWidth: 165,
    targetXRatio: 0.5,
    targetDyFromStart: 11 * 340 + 160,
    targetRadius: 34,
    pads: [
      pad(0.72, 620, 64, 26),
      pad(0.28, 1050, 64, 26),
      pad(0.5, 1500, 78, 30),
      pad(0.33, 2050, 64, 26),
      pad(0.67, 2680, 64, 26),
    ],
    coins: [
      coin(0.5, 360),
      coin(0.72, 800),
      coin(0.28, 1250),
      coin(0.5, 1720),
      coin(0.33, 2200),
      coin(0.67, 2850),
    ],
    walls: [wall(0.1, 0.36, 1000, 1200)],
    tightStacks: [2, 6, 9],
  },
  {
    id: 10,
    title: 'Cable Master',
    dividerCount: 12,
    gateWidth: 148,
    targetXRatio: 0.5,
    targetDyFromStart: 12 * 340 + 140,
    targetRadius: 34,
    pads: [
      pad(0.5, 560, 76, 28),
      pad(0.72, 980, 60, 24),
      pad(0.28, 1380, 60, 24),
      pad(0.5, 1880, 76, 30),
      pad(0.38, 2480, 60, 24),
      pad(0.62, 3080, 60, 24),
    ],
    coins: [
      coin(0.5, 420),
      coin(0.72, 880),
      coin(0.28, 1320),
      coin(0.5, 1780),
      coin(0.38, 2320),
      coin(0.62, 2920),
    ],
    walls: [
      wall(0.1, 0.28, 700, 860),
      wall(0.68, 0.9, 1200, 1380),
      wall(0.62, 0.84, 1980, 2180),
    ],
    tightStacks: [3, 7, 11],
  },
];

export function getLevelByIndex(indexZeroBased: number): LevelDefinition | null {
  if (indexZeroBased < 0 || indexZeroBased >= LEVELS.length) {
    return null;
  }
  return LEVELS[indexZeroBased];
}

/** Human-readable time for level select / HUD (centisecond precision). */
export function formatLevelTime(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) {
    return '—';
  }
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  if (m === 0) {
    return `${rem.toFixed(2)}s`;
  }
  const secInt = Math.floor(rem);
  const cs = Math.min(99, Math.round((rem - secInt) * 100));
  return `${m}:${String(secInt).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

