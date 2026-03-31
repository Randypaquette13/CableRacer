import Phaser from 'phaser';
import { CAR_SKINS, MAP_THEMES, SCENES } from '../core/config';
import { ProgressionService } from '../core/ProgressionService';
import { fontSize } from '../core/uiLayout';

export class CustomizeScene extends Phaser.Scene {
  private infoText?: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.customize);
  }

  create(): void {
    const { width, height } = this.scale;
    const save = ProgressionService.data;
    const narrow = width < 720;
    const pad = Math.max(16, width * 0.04);
    const rowH = narrow ? 60 : 66;
    const gutter = Math.max(18, width * 0.03);
    const columnWidth = narrow ? width - pad * 2 : Math.floor((width - pad * 2 - gutter) * 0.5);
    const leftX = pad;
    const rightX = narrow ? pad : leftX + columnWidth + gutter;

    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x09111f);
    this.add.text(pad, 18, 'Customize', { fontSize: fontSize(40, width, 20, 56), color: '#ffffff' });
    this.add.text(pad, 72, `Coins: ${save.walletCoins}`, { fontSize: fontSize(26, width), color: '#ffd54f' });

    this.add.text(leftX, 124, 'Car Skins', { fontSize: fontSize(28, width), color: '#90caf9' });
    const rowY = 168;
    CAR_SKINS.forEach((skin, index) => {
      const y = rowY + index * rowH;
      const unlocked = save.unlockedSkins.includes(skin.id);
      const selected = save.selectedSkin === skin.id;
      this.createPurchaseButton(
        leftX,
        columnWidth,
        y,
        `${skin.name} (${skin.cost})`,
        selected ? 'SELECTED' : unlocked ? 'USE' : 'BUY',
        () => {
          if (!ProgressionService.buySkin(skin.id)) {
            this.setInfo('Not enough coins.');
            return;
          }
          this.scene.restart();
        },
      );
    });

    const themesHeaderY = narrow ? rowY + CAR_SKINS.length * rowH + 32 : 124;
    const themesStartY = narrow ? themesHeaderY + 36 : 168;
    this.add.text(rightX, themesHeaderY, 'Map Themes', {
      fontSize: fontSize(28, width),
      color: '#90caf9',
    });
    MAP_THEMES.forEach((theme, index) => {
      const y = themesStartY + index * rowH;
      const unlocked = save.unlockedThemes.includes(theme.id);
      const selected = save.selectedTheme === theme.id;
      this.createPurchaseButton(
        rightX,
        columnWidth,
        y,
        `${theme.name} (${theme.cost})`,
        selected ? 'SELECTED' : unlocked ? 'USE' : 'BUY',
        () => {
          if (!ProgressionService.buyTheme(theme.id)) {
            this.setInfo('Not enough coins.');
            return;
          }
          this.scene.restart();
        },
      );
    });

    const backY = height - Math.max(36, height * 0.06);
    this.createMenuButton(width * 0.5, backY, 'Back', () => {
      this.scene.start(SCENES.menu);
    });

    this.infoText = this.add.text(pad, backY - 32, '', {
      fontSize: fontSize(20, width),
      color: '#ef9a9a',
      wordWrap: { width: width - pad * 2 - 100 },
    });
  }

  private createPurchaseButton(
    x: number,
    width: number,
    y: number,
    label: string,
    actionLabel: string,
    onClick: () => void,
  ): void {
    const w = this.scale.width;
    const actionWidth = Math.min(130, Math.max(88, Math.floor(width * 0.34)));
    const actionX = x + width;
    this.add.text(x, y, label, {
      fontSize: fontSize(22, w),
      color: '#ffffff',
      wordWrap: { width: Math.max(110, width - actionWidth - 16) },
    });
    const action = this.add
      .text(actionX, y, `[${actionLabel}]`, {
        fontSize: fontSize(22, w),
        color: '#ffd54f',
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    action.on('pointerdown', onClick);
  }

  private createMenuButton(x: number, y: number, label: string, onClick: () => void): void {
    const w = this.scale.width;
    const bw = Math.min(200, w - 32);
    const bg = this.add.rectangle(x, y, bw, 52, 0x1e2a44).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: fontSize(22, w),
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.on('pointerdown', onClick);
    text.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
  }

  private setInfo(message: string): void {
    this.infoText?.setText(message);
  }
}
