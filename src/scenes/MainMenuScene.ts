import Phaser from 'phaser';
import { SCENES } from '../core/config';
import { fetchLeaderboard, type LeaderboardEntry } from '../core/leaderboardApi';
import { ProgressionService } from '../core/ProgressionService';
import { fontSize, menuButtonWidth } from '../core/uiLayout';

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
    const pad = Math.max(16, width * 0.04);
    const compact = height < 640;

    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x0b0f1a);
    this.add.text(pad, compact ? 12 : 18, `High Score: ${Math.floor(save.highScoreDistance)}m`, {
      fontSize: fontSize(24, width),
      color: '#ffffff',
    });
    this.add.text(pad, compact ? 42 : 52, `Coins: ${save.walletCoins}`, {
      fontSize: fontSize(20, width),
      color: '#ffd54f',
    });
    const leaderboardLabel = this.add.text(pad, compact ? 72 : 88, 'Top 3 (server):\n…', {
      fontSize: fontSize(16, width),
      color: '#b0bec5',
      wordWrap: { width: width - pad * 2 },
    });
    void fetchLeaderboard().then(({ scores, error }) => {
      leaderboardLabel.setText(`Top 3 (server):\n${formatLeaderboardLines(scores, error)}`);
    });

    const titleY = compact ? Math.min(118, height * 0.2) : 124;
    this.add
      .text(width * 0.5, titleY, 'Cable Racer', {
        fontSize: fontSize(56, width, 22, 72),
        color: '#90caf9',
      })
      .setOrigin(0.5);

    const btnY0 = compact ? height * 0.44 : height * 0.45;
    const gap = compact ? height * 0.1 : height * 0.11;
    this.createButton(width * 0.5, btnY0, 'Play', () => {
      this.requestFullscreenThen(() => this.scene.start(SCENES.game));
    });
    this.createButton(width * 0.5, btnY0 + gap, 'Customize Car / Map', () => {
      this.requestFullscreenThen(() => this.scene.start(SCENES.customize));
    });
    this.createButton(width * 0.5, btnY0 + gap * 2, 'Settings', () => {
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
    const w = this.scale.width;
    const bw = menuButtonWidth(w);
    const bh = w < 400 ? 56 : 64;
    const bg = this.add.rectangle(x, y, bw, bh, 0x1e2a44).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: fontSize(26, w),
        color: '#ffffff',
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x2b3b63));
    bg.on('pointerout', () => bg.setFillStyle(0x1e2a44));
    bg.on('pointerdown', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }
}
