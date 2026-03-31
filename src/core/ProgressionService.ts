import { CAR_SKINS, MAP_THEMES, STORAGE_KEY, type CarSkinId, type ThemeId } from './config';
import { LEVEL_COUNT } from './levelData';

/** Set to true to reset high score once on next load, then set back to false. */
const RESET_HIGHSCORE_ONCE = false;

type SaveData = {
  highScoreDistance: number;
  walletCoins: number;
  unlockedSkins: CarSkinId[];
  unlockedThemes: ThemeId[];
  selectedSkin: CarSkinId;
  selectedTheme: ThemeId;
  bonusCoinsGranted: boolean;
  /** Best time in seconds per level index (null = not completed). Lower is better. */
  levelBestTimes: (number | null)[];
  /** 1-based: highest level index (1–10) the player may open. Starts at 1. */
  maxUnlockedLevel: number;
};

const defaultSave: SaveData = {
  highScoreDistance: 0,
  walletCoins: 0,
  unlockedSkins: ['classic'],
  unlockedThemes: ['deepCave'],
  selectedSkin: 'classic',
  selectedTheme: 'deepCave',
  bonusCoinsGranted: true,
  levelBestTimes: Array.from({ length: LEVEL_COUNT }, () => null),
  maxUnlockedLevel: 1,
};

export class ProgressionService {
  private static saveData: SaveData = (() => {
    const loaded = ProgressionService.load();
    if (RESET_HIGHSCORE_ONCE) {
      loaded.highScoreDistance = 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    }
    if (import.meta.env.DEV) {
      // Dev convenience: allow testing any level without grinding unlocks.
      loaded.maxUnlockedLevel = LEVEL_COUNT;
    }
    return loaded;
  })();

  static get data(): SaveData {
    return structuredClone(ProgressionService.saveData);
  }

  static canBuySkin(id: CarSkinId): boolean {
    const skin = CAR_SKINS.find((entry) => entry.id === id);
    if (!skin) {
      return false;
    }
    if (ProgressionService.saveData.unlockedSkins.includes(id)) {
      return true;
    }
    return ProgressionService.saveData.walletCoins >= skin.cost;
  }

  static canBuyTheme(id: ThemeId): boolean {
    const theme = MAP_THEMES.find((entry) => entry.id === id);
    if (!theme) {
      return false;
    }
    if (ProgressionService.saveData.unlockedThemes.includes(id)) {
      return true;
    }
    return ProgressionService.saveData.walletCoins >= theme.cost;
  }

  static buySkin(id: CarSkinId): boolean {
    const skin = CAR_SKINS.find((entry) => entry.id === id);
    if (!skin) {
      return false;
    }
    if (!ProgressionService.saveData.unlockedSkins.includes(id)) {
      if (ProgressionService.saveData.walletCoins < skin.cost) {
        return false;
      }
      ProgressionService.saveData.walletCoins -= skin.cost;
      ProgressionService.saveData.unlockedSkins.push(id);
    }
    ProgressionService.saveData.selectedSkin = id;
    ProgressionService.persist();
    return true;
  }

  static buyTheme(id: ThemeId): boolean {
    const theme = MAP_THEMES.find((entry) => entry.id === id);
    if (!theme) {
      return false;
    }
    if (!ProgressionService.saveData.unlockedThemes.includes(id)) {
      if (ProgressionService.saveData.walletCoins < theme.cost) {
        return false;
      }
      ProgressionService.saveData.walletCoins -= theme.cost;
      ProgressionService.saveData.unlockedThemes.push(id);
    }
    ProgressionService.saveData.selectedTheme = id;
    ProgressionService.persist();
    return true;
  }

  static addRunResult(distance: number, coinsCollected: number): void {
    ProgressionService.saveData.walletCoins += coinsCollected;
    ProgressionService.saveData.highScoreDistance = Math.max(
      ProgressionService.saveData.highScoreDistance,
      distance,
    );
    ProgressionService.persist();
  }

  /**
   * Level mode: grant coins always. On clear, update best time (lower) and unlock next level.
   * @returns Whether the time was a new personal best (only meaningful when cleared is true).
   */
  static recordLevelFinish(
    levelIndexZeroBased: number,
    timeSec: number,
    coinsCollected: number,
    cleared: boolean,
  ): { newBest: boolean } {
    const s = ProgressionService.saveData;
    s.walletCoins += Math.max(0, Math.floor(coinsCollected));
    let newBest = false;
    if (
      cleared &&
      levelIndexZeroBased >= 0 &&
      levelIndexZeroBased < LEVEL_COUNT &&
      Number.isFinite(timeSec) &&
      timeSec >= 0
    ) {
      s.maxUnlockedLevel = Math.min(
        LEVEL_COUNT,
        Math.max(s.maxUnlockedLevel, levelIndexZeroBased + 2),
      );
      const prev = s.levelBestTimes[levelIndexZeroBased];
      if (prev === null || timeSec < prev) {
        s.levelBestTimes[levelIndexZeroBased] = timeSec;
        newBest = true;
      }
    }
    ProgressionService.persist();
    return { newBest };
  }

  private static load(): SaveData {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultSave);
    }

    try {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const selectedSkin = parsed.selectedSkin ?? defaultSave.selectedSkin;
      const selectedTheme = parsed.selectedTheme ?? defaultSave.selectedTheme;
      const wc = parsed.walletCoins;
      const walletCoins =
        typeof wc === 'number' && Number.isFinite(wc) ? Math.max(0, Math.floor(wc)) : 0;
      const levelBestTimes = ProgressionService.normalizeLevelTimes(parsed.levelBestTimes);
      const mu = parsed.maxUnlockedLevel;
      const maxUnlockedLevel =
        typeof mu === 'number' && Number.isFinite(mu)
          ? Math.min(LEVEL_COUNT, Math.max(1, Math.floor(mu)))
          : defaultSave.maxUnlockedLevel;
      return {
        highScoreDistance: parsed.highScoreDistance ?? 0,
        walletCoins,
        unlockedSkins: parsed.unlockedSkins?.length ? parsed.unlockedSkins : ['classic'],
        unlockedThemes: parsed.unlockedThemes?.length ? parsed.unlockedThemes : ['deepCave'],
        selectedSkin,
        selectedTheme,
        bonusCoinsGranted: true,
        levelBestTimes,
        maxUnlockedLevel,
      };
    } catch {
      return structuredClone(defaultSave);
    }
  }

  private static persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ProgressionService.saveData));
  }

  private static normalizeLevelTimes(raw: unknown): (number | null)[] {
    const out: (number | null)[] = Array.from({ length: LEVEL_COUNT }, () => null);
    if (!Array.isArray(raw)) {
      return out;
    }
    for (let i = 0; i < LEVEL_COUNT; i += 1) {
      const v = raw[i];
      if (v === null || v === undefined) {
        continue;
      }
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) {
        out[i] = n;
      }
    }
    return out;
  }
}
