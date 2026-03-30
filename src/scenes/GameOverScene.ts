import Phaser from 'phaser';
import { SCENES } from '../core/config';
import {
  fetchLeaderboard,
  submitScore,
  wouldMakeTopThree,
  type LeaderboardEntry,
} from '../core/leaderboardApi';
import { ProgressionService } from '../core/ProgressionService';
import { hideLeaderboardOverlay, promptHighScoreName, showLeaderboardChecking } from '../core/nameEntry';

/** Run stats for this death only. Local “best” is read from ProgressionService. */
type GameOverData = {
  distance: number;
  coins: number;
};

function formatLeaderboardLines(entries: LeaderboardEntry[], fetchError: string | null): string {
  if (fetchError) {
    return `${fetchError}\n(Run npm run dev:all so Vite proxies /api to the server.)`;
  }
  if (entries.length === 0) {
    return 'No scores yet.';
  }
  return entries
    .map((e, i) => `${i + 1}. ${e.name} — ${Math.floor(e.distance)}m`)
    .join('\n');
}

function resolveGameOverData(scene: Phaser.Scene, data: GameOverData | undefined): GameOverData | null {
  const fromSettings = scene.sys.settings.data as Record<string, unknown> | undefined;
  const raw =
    data != null && (data as Record<string, unknown>).distance != null
      ? (data as Record<string, unknown>)
      : fromSettings;
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const distance = Number(raw.distance);
  const coinsRaw = Number(raw.coins);
  if (!Number.isFinite(distance) || distance < 0) {
    return null;
  }
  const coins = Number.isFinite(coinsRaw) ? Math.max(0, Math.floor(coinsRaw)) : 0;
  return { distance, coins };
}

export class GameOverScene extends Phaser.Scene {
  private leaderboardText?: Phaser.GameObjects.Text;
  /** When false, Retry / Main Menu ignore clicks (async leaderboard + name flow). */
  private navEnabled = false;

  constructor() {
    super(SCENES.gameOver);
  }

  shutdown(): void {
    hideLeaderboardOverlay();
  }

  create(data: GameOverData): void {
    document.body.style.cursor = '';
    const { width, height } = this.scale;
    const run = resolveGameOverData(this, data);
    if (!run) {
      this.add
        .text(width * 0.5, height * 0.5, 'Missing run data — returning to menu', {
          fontSize: '22px',
          color: '#ffab91',
        })
        .setOrigin(0.5);
      this.time.delayedCall(800, () => this.scene.start(SCENES.menu));
      return;
    }
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x170b0b);

    this.add.text(width * 0.5, 70, 'Game Over', { fontSize: '56px', color: '#ff8a80' }).setOrigin(0.5);
    this.add
      .text(width * 0.5, 170, `Distance: ${Math.floor(run.distance)}m`, {
        fontSize: '36px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(width * 0.5, 220, `Coins Collected: ${run.coins}`, {
        fontSize: '32px',
        color: '#ffd54f',
      })
      .setOrigin(0.5);
    this.add
      .text(width * 0.5, 268, `Your best (local): ${Math.floor(ProgressionService.data.highScoreDistance)}m`, {
        fontSize: '26px',
        color: '#90caf9',
      })
      .setOrigin(0.5);

    this.add.text(width * 0.5, 318, 'Top scores (server)', {
      fontSize: '22px',
      color: '#b0bec5',
    }).setOrigin(0.5);

    this.leaderboardText = this.add
      .text(width * 0.5, 368, 'Loading…', {
        fontSize: '20px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5);

    this.createButton(width * 0.5, height * 0.82, 'Retry', () => {
      if (!this.navEnabled) {
        return;
      }
      this.scene.stop(SCENES.gameOver);
      this.scene.start(SCENES.game);
    });
    this.createButton(width * 0.5, height * 0.92, 'Main Menu', () => {
      if (!this.navEnabled) {
        return;
      }
      this.scene.start(SCENES.menu);
    });

    void this.runLeaderboardFlow(run);
  }

  private async runLeaderboardFlow(data: GameOverData): Promise<void> {
    try {
      showLeaderboardChecking();
      const { scores, error } = await fetchLeaderboard();
      this.leaderboardText?.setText(formatLeaderboardLines(scores, error));

      if (wouldMakeTopThree(data.distance, scores)) {
        const name = await promptHighScoreName();
        const nameToSave = name !== null && name.trim() !== '' ? name.trim() : 'Anonymous';
        const saved = await submitScore(nameToSave, data.distance);
        this.leaderboardText?.setText(formatLeaderboardLines(saved.scores, saved.error));
      } else {
        hideLeaderboardOverlay();
      }
    } finally {
      this.navEnabled = true;
    }
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const bg = this.add.rectangle(x, y, 260, 55, 0x2b1a1a).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x3d2424));
    bg.on('pointerout', () => bg.setFillStyle(0x2b1a1a));
    bg.on('pointerdown', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }
}
