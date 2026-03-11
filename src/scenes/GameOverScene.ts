import Phaser from 'phaser';
import { SCENES } from '../core/config';

type GameOverData = {
  distance: number;
  coins: number;
  highScore: number;
};

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super(SCENES.gameOver);
  }

  create(data: GameOverData): void {
    const { width, height } = this.scale;
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x170b0b);

    this.add.text(width * 0.5, 90, 'Game Over', { fontSize: '64px', color: '#ff8a80' }).setOrigin(0.5);
    this.add
      .text(width * 0.5, 210, `Distance: ${Math.floor(data.distance)}m`, {
        fontSize: '40px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(width * 0.5, 270, `Coins Collected: ${data.coins}`, {
        fontSize: '38px',
        color: '#ffd54f',
      })
      .setOrigin(0.5);
    this.add
      .text(width * 0.5, 330, `Best Distance: ${Math.floor(data.highScore)}m`, {
        fontSize: '34px',
        color: '#90caf9',
      })
      .setOrigin(0.5);

    this.createButton(width * 0.5, 450, 'Retry', () => {
      this.scene.stop(SCENES.gameOver);
      this.scene.start(SCENES.game);
    });
    this.createButton(width * 0.5, 540, 'Main Menu', () => this.scene.start(SCENES.menu));
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 260, 65, 0x2b1a1a).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: '30px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x3d2424));
    bg.on('pointerout', () => bg.setFillStyle(0x2b1a1a));
    bg.on('pointerdown', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }
}
