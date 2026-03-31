import Phaser from 'phaser';
import { SCENES, type GameSceneData } from '../core/config';
import { formatLevelTime, LEVELS } from '../core/levelData';
import {
  fetchLevelTimes,
  submitLevelTime,
  wouldMakeTopThreeTime,
  type LevelTimeEntry,
} from '../core/leaderboardApi';
import { fontSize, menuButtonWidth } from '../core/uiLayout';
import { hideLeaderboardOverlay, promptHighScoreName, showLeaderboardChecking } from '../core/nameEntry';

export type LevelResultPayload = {
  levelIndex: number;
  timeSec: number;
  coins: number;
  cleared: boolean;
  newBest: boolean;
};

function resolvePayload(scene: Phaser.Scene, data: LevelResultPayload | undefined): LevelResultPayload | null {
  const fromSettings = scene.sys.settings.data as Record<string, unknown> | undefined;
  const raw =
    data != null && typeof (data as LevelResultPayload).levelIndex === 'number'
      ? (data as unknown as Record<string, unknown>)
      : fromSettings;
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const levelIndex = Number(raw.levelIndex);
  const timeSec = Number(raw.timeSec);
  const coins = Number(raw.coins);
  const cleared = Boolean(raw.cleared);
  const newBest = Boolean(raw.newBest);
  if (!Number.isFinite(levelIndex) || levelIndex < 0 || levelIndex >= LEVELS.length) {
    return null;
  }
  return {
    levelIndex: Math.floor(levelIndex),
    timeSec: Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0,
    coins: Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : 0,
    cleared,
    newBest,
  };
}

export class LevelResultScene extends Phaser.Scene {
  private leaderboardText?: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.levelResult);
  }

  create(data: LevelResultPayload): void {
    document.body.style.cursor = '';
    const run = resolvePayload(this, data);
    const { width, height } = this.scale;
    const cx = width * 0.5;

    if (!run) {
      this.add
        .text(cx, height * 0.5, 'Missing result — returning to menu', {
          fontSize: fontSize(22, width),
          color: '#ffab91',
        })
        .setOrigin(0.5);
      this.time.delayedCall(800, () => this.scene.start(SCENES.menu));
      return;
    }

    const level = LEVELS[run.levelIndex];
    this.add.rectangle(cx, height * 0.5, width, height, run.cleared ? 0x0d1f16 : 0x170b0b);

    let y = height * 0.14;
    this.add
      .text(cx, y, run.cleared ? 'Level complete' : 'Crashed', {
        fontSize: fontSize(48, width, 22, 56),
        color: run.cleared ? '#69f0ae' : '#ff8a80',
      })
      .setOrigin(0.5);
    y += 56;
    this.add
      .text(cx, y, `${level.title} · Level ${level.id}`, {
        fontSize: fontSize(26, width),
        color: '#b0bec5',
      })
      .setOrigin(0.5);
    y += 44;
    this.add
      .text(cx, y, `Time: ${formatLevelTime(run.timeSec)}`, {
        fontSize: fontSize(32, width),
        color: '#ffffff',
      })
      .setOrigin(0.5);
    y += 40;
    this.add
      .text(cx, y, `Coins: ${run.coins}`, {
        fontSize: fontSize(26, width),
        color: '#ffd54f',
      })
      .setOrigin(0.5);
    if (run.cleared && run.newBest) {
      y += 36;
      this.add
        .text(cx, y, 'New best time!', {
          fontSize: fontSize(22, width),
          color: '#80deea',
        })
        .setOrigin(0.5);
    }

    y += 48;
    this.add
      .text(cx, y, 'Top times (server)', {
        fontSize: fontSize(20, width),
        color: '#b0bec5',
      })
      .setOrigin(0.5);
    y += 28;
    this.leaderboardText = this.add
      .text(cx, y, 'Loading…', {
        fontSize: fontSize(18, width),
        color: '#ffffff',
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: width - 24 },
      })
      .setOrigin(0.5, 0);

    const startGame = (payload: GameSceneData) => {
      this.scene.start(SCENES.game, payload);
    };

    const gap = 52;
    let by = height * 0.58;
    this.makeButton(cx, by, 'Retry', () => startGame({ mode: 'level', levelIndex: run.levelIndex }));
    by += gap;
    if (run.cleared && run.levelIndex < LEVELS.length - 1) {
      this.makeButton(cx, by, 'Next level', () =>
        startGame({ mode: 'level', levelIndex: run.levelIndex + 1 }),
      );
      by += gap;
    }
    this.makeButton(cx, by, 'Level select', () => this.scene.start(SCENES.levelSelect));
    by += gap;
    this.makeButton(cx, by, 'Main menu', () => this.scene.start(SCENES.menu));

    void this.runLevelLeaderboardFlow(level.id, run.timeSec, run.cleared);
  }

  private formatTimeLines(entries: LevelTimeEntry[], error: string | null): string {
    if (error) {
      return `(offline) ${error}`;
    }
    if (entries.length === 0) {
      return '—';
    }
    return entries
      .map((e, i) => `${i + 1}. ${e.name} — ${formatLevelTime(e.timeMs / 1000)}`)
      .join('\n');
  }

  private async runLevelLeaderboardFlow(levelIdOneBased: number, timeSec: number, cleared: boolean): Promise<void> {
    try {
      showLeaderboardChecking();
      const { scores, error } = await fetchLevelTimes(levelIdOneBased);
      this.leaderboardText?.setText(this.formatTimeLines(scores, error));

      if (!cleared || error) {
        hideLeaderboardOverlay();
        return;
      }

      const timeMs = Math.floor(timeSec * 1000);
      if (!wouldMakeTopThreeTime(timeMs, scores)) {
        hideLeaderboardOverlay();
        return;
      }

      const name = await promptHighScoreName('Top 3 time! Enter your name:');
      const nameToSave = name !== null && name.trim() !== '' ? name.trim() : 'Anonymous';
      const saved = await submitLevelTime(nameToSave, levelIdOneBased, timeMs);
      this.leaderboardText?.setText(this.formatTimeLines(saved.scores, saved.error));
    } finally {
      hideLeaderboardOverlay();
    }
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
    const w = this.scale.width;
    const bw = menuButtonWidth(w);
    const bh = w < 420 ? 48 : 52;
    const bg = this.add.rectangle(x, y, bw, bh, 0x1e2a44).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: fontSize(24, w),
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x2b3b63));
    bg.on('pointerout', () => bg.setFillStyle(0x1e2a44));
    bg.on('pointerdown', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }
}
