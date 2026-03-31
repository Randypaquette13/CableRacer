export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const STORAGE_KEY = 'cable-racer-save-v1';

export const SCENES = {
  menu: 'MainMenuScene',
  game: 'GameScene',
  gameOver: 'GameOverScene',
  customize: 'CustomizeScene',
  settings: 'SettingsScene',
  levelSelect: 'LevelSelectScene',
  levelResult: 'LevelResultScene',
} as const;

/** Payload for `scene.start(SCENES.game, data)`. */
export type GameSceneData =
  | { mode?: 'endless' }
  | { mode: 'level'; levelIndex: number };

export const DEFAULT_KEYS = {
  hookLeft: 'ArrowLeft',
  hookRight: 'ArrowRight',
  releaseHook: 'Space',
} as const;

export const CAR_SKINS = [
  { id: 'classic', name: 'Classic', color: 0x4fc3f7, cost: 0 },
  { id: 'ember', name: 'Ember', color: 0xff7043, cost: 15 },
  { id: 'mint', name: 'Mint', color: 0x66bb6a, cost: 30 },
  { id: 'violet', name: 'Violet', color: 0xab47bc, cost: 45 },
  { id: 'supremeGay', name: 'Supreme Gay', color: 0xffffff, cost: 69 },
] as const;

export const MAP_THEMES = [
  {
    id: 'deepCave',
    name: 'Deep Cave',
    bg: 0x0b0f1a,
    wall: 0x26334d,
    coin: 0xffd54f,
    cost: 0,
  },
  {
    id: 'iceCave',
    name: 'Ice Cave',
    bg: 0x041827,
    wall: 0x3f88c5,
    coin: 0xfff176,
    cost: 20,
  },
  {
    id: 'magmaCave',
    name: 'Magma Cave',
    bg: 0x1c0906,
    wall: 0x8d3a1f,
    coin: 0xffca28,
    cost: 40,
  },
] as const;

export type CarSkinId = (typeof CAR_SKINS)[number]['id'];
export type ThemeId = (typeof MAP_THEMES)[number]['id'];
