import Phaser from 'phaser';
import './style.css';
import { MainMenuScene } from './scenes/MainMenuScene';
import { CustomizeScene } from './scenes/CustomizeScene';
import { SettingsScene } from './scenes/SettingsScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GAME_HEIGHT, GAME_WIDTH } from './core/config';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: window.innerWidth || GAME_WIDTH,
  height: window.innerHeight || GAME_HEIGHT,
  antialias: true,
  backgroundColor: '#0b0f1a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [MainMenuScene, CustomizeScene, SettingsScene, GameScene, GameOverScene],
};

new Phaser.Game(config);
