import Phaser from 'phaser';
import { SCENES } from '../core/config';
import { fetchLeaderboard, type LeaderboardEntry } from '../core/leaderboardApi';
import { ProgressionService } from '../core/ProgressionService';

function formatLeaderboardLines(entries: LeaderboardEntry[], error: string | null): string {
  if (error) {
    return `(offline) ${error}`;
  }
  if (entries.length === 0) {
    return '—';
  }
  return entries
    .map((e, i) => `${i + 1}. ${e.name} ${Math.floor(e.distance)}m`)
    .join('\n');
}

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.menu);
  }

  create(): void {
    const { width, height } = this.scale;
    const save = ProgressionService.data;

    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x0b0f1a);
    this.add.text(30, 20, `High Score: ${Math.floor(save.highScoreDistance)}m`, {
      fontSize: '26px',
      color: '#ffffff',
    });
    this.add.text(30, 55, `Coins: ${save.walletCoins}`, {
      fontSize: '22px',
      color: '#ffd54f',
    });
    const leaderboardLabel = this.add.text(30, 88, 'Top 3 (server):\n…', {
      fontSize: '18px',
      color: '#b0bec5',
      wordWrap: { width: this.scale.width - 60 },
    });
    void fetchLeaderboard().then(({ scores, error }) => {
      leaderboardLabel.setText(`Top 3 (server):\n${formatLeaderboardLines(scores, error)}`);
    });

    this.add
      .text(width * 0.5, 100, 'Cable Racer', {
        fontSize: '64px',
        color: '#90caf9',
      })
      .setOrigin(0.5);

    this.createButton(width * 0.5, height * 0.45, 'Play', () => {
      this.requestFullscreenThen(() => this.scene.start(SCENES.game));
    });
    this.createButton(width * 0.5, height * 0.58, 'Customize Car / Map', () => {
      this.requestFullscreenThen(() => this.scene.start(SCENES.customize));
    });
    this.createButton(width * 0.5, height * 0.71, 'Settings', () => {
      this.requestFullscreenThen(() => this.scene.start(SCENES.settings));
    });
  }

  private requestFullscreenThen(callback: () => void): void {
    if (!this.scale.isFullscreen) {
      try {
        this.scale.startFullscreen();
      } catch {
        // fullscreen requires user gesture; continue without
      }
    }
    callback();
  }

  private createButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 330, 70, 0x1e2a44).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x2b3b63));
    bg.on('pointerout', () => bg.setFillStyle(0x1e2a44));
    bg.on('pointerdown', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }
}
