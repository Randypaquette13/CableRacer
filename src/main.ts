import Phaser from 'phaser';
import './style.css';
import { MainMenuScene } from './scenes/MainMenuScene';
import { CustomizeScene } from './scenes/CustomizeScene';
import { SettingsScene } from './scenes/SettingsScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { LevelResultScene } from './scenes/LevelResultScene';
import { GAME_HEIGHT, GAME_WIDTH } from './core/config';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-mount',
  /** Fixed 16:9; Scale.FIT letterboxes on phones so layout matches desktop proportions. */
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  antialias: true,
  backgroundColor: '#0b0f1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    /** Default Phaser fullscreen wraps only the canvas; DOM overlays in #app would stay outside fullscreen. */
    fullscreenTarget: 'app',
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [
    MainMenuScene,
    CustomizeScene,
    SettingsScene,
    LevelSelectScene,
    LevelResultScene,
    GameScene,
    GameOverScene,
  ],
};

const game = new Phaser.Game(config);

document.addEventListener('fullscreenchange', () => {
  game.scale.refresh();
});
