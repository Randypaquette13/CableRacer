import { CAR_SKINS, MAP_THEMES, STORAGE_KEY, type CarSkinId, type ThemeId } from './config';

type SaveData = {
  highScoreDistance: number;
  walletCoins: number;
  unlockedSkins: CarSkinId[];
  unlockedThemes: ThemeId[];
  selectedSkin: CarSkinId;
  selectedTheme: ThemeId;
  bonusCoinsGranted: boolean;
};

const defaultSave: SaveData = {
  highScoreDistance: 0,
  walletCoins: 1000,
  unlockedSkins: ['classic'],
  unlockedThemes: ['deepCave'],
  selectedSkin: 'classic',
  selectedTheme: 'deepCave',
  bonusCoinsGranted: true,
};

export class ProgressionService {
  private static saveData: SaveData = ProgressionService.load();

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

  private static load(): SaveData {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(defaultSave);
    }

    try {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const selectedSkin = parsed.selectedSkin ?? defaultSave.selectedSkin;
      const selectedTheme = parsed.selectedTheme ?? defaultSave.selectedTheme;
      const hadBonus = parsed.bonusCoinsGranted === true;
      return {
        highScoreDistance: parsed.highScoreDistance ?? 0,
        walletCoins: (parsed.walletCoins ?? 0) + (hadBonus ? 0 : 1000),
        unlockedSkins: parsed.unlockedSkins?.length ? parsed.unlockedSkins : ['classic'],
        unlockedThemes: parsed.unlockedThemes?.length ? parsed.unlockedThemes : ['deepCave'],
        selectedSkin,
        selectedTheme,
        bonusCoinsGranted: true,
      };
    } catch {
      return structuredClone(defaultSave);
    }
  }

  private static persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ProgressionService.saveData));
  }
}
