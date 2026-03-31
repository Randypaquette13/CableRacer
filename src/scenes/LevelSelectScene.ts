import Phaser from 'phaser';
import { SCENES, type GameSceneData } from '../core/config';
import { formatLevelTime, LEVELS } from '../core/levelData';
import { fetchLevelTimes } from '../core/leaderboardApi';
import { ProgressionService } from '../core/ProgressionService';
import { fontSize, menuButtonWidth } from '../core/uiLayout';

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super(SCENES.levelSelect);
  }

  create(): void {
    const { width, height } = this.scale;
    const pad = Math.max(16, width * 0.04);
    const save = ProgressionService.data;
    const compact = height < 700;

    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x0b0f1a);

    this.add
      .text(width * 0.5, pad + 4, 'Levels', {
        fontSize: fontSize(38, width, 18, 48),
        color: '#90caf9',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(width * 0.5, pad + 46, 'Hit the target · coins & boost pads · best time per level', {
        fontSize: fontSize(14, width),
        color: '#78909c',
        wordWrap: { width: width - pad * 2 },
        align: 'center',
      })
      .setOrigin(0.5, 0);

    const listTop = pad + (compact ? 84 : 92);
    const reservedBottom = pad + 76; // back button + breathing room
    const available = Math.max(260, height - listTop - reservedBottom);
    const rowH = Phaser.Math.Clamp(Math.floor(available / LEVELS.length), 40, compact ? 56 : 62);
    let listY = listTop;
    const worldTexts: Phaser.GameObjects.Text[] = [];

    for (let idx = 0; idx < LEVELS.length; idx += 1) {
      const lvl = LEVELS[idx];
      const unlocked = lvl.id <= save.maxUnlockedLevel;
      const best = save.levelBestTimes[idx];
      const timeStr = best !== null ? formatLevelTime(best) : '—';
      const label = unlocked
        ? `${lvl.id}. ${lvl.title}     ${timeStr}`
        : `${lvl.id}. ${lvl.title}     (locked)`;

      const bw = width - pad * 2;
      const hit = this.add
        .rectangle(width * 0.5, listY, bw, rowH - 4, 0x1a2438, unlocked ? 0.88 : 0.35)
        .setInteractive({ useHandCursor: unlocked });
      const rowText = this.add
        .text(pad + 10, listY, label, {
          fontSize: fontSize(rowH <= 46 ? 15 : 16, width, 12, 20),
          color: unlocked ? '#eceff1' : '#546e7a',
        })
        .setOrigin(0, 0.5);

      const worldText = this.add
        .text(width - pad - 10, listY, unlocked ? 'Top3: …' : '', {
          fontSize: fontSize(rowH <= 46 ? 11 : 12, width, 10, 16),
          color: unlocked ? '#b0bec5' : '#546e7a',
          align: 'right',
        })
        .setOrigin(1, 0.5);
      worldTexts.push(worldText);

      if (unlocked) {
        const startPayload: GameSceneData = { mode: 'level', levelIndex: idx };
        const go = () => this.scene.start(SCENES.game, startPayload);
        hit.on('pointerover', () => hit.setFillStyle(0x243552, 0.95));
        hit.on('pointerout', () => hit.setFillStyle(0x1a2438, 0.88));
        hit.on('pointerdown', go);
        rowText.setInteractive({ useHandCursor: true }).on('pointerdown', go);
      }

      listY += rowH;
    }

    // Fetch top 3 server times per level and display inline.
    void Promise.all(
      LEVELS.map(async (lvl, idx) => {
        const unlocked = lvl.id <= save.maxUnlockedLevel;
        if (!unlocked) {
          return;
        }
        const r = await fetchLevelTimes(lvl.id);
        const t = worldTexts[idx];
        if (!t) return;
        if (r.error) {
          t.setText('Top3: (offline)');
          return;
        }
        if (r.scores.length === 0) {
          t.setText('Top3: —');
          return;
        }
        const parts = r.scores.map(
          (e, i) => `${i + 1})${e.name} ${formatLevelTime(e.timeMs / 1000)}`,
        );
        t.setText(`Top3: ${parts.join('  ')}`);
      }),
    );

    this.makeButton(width * 0.5, height - pad - 28, 'Back', () => this.scene.start(SCENES.menu));
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
