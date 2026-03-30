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
    const rowH = narrow ? 52 : 58;

    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x09111f);
    this.add.text(pad, 18, 'Customize', { fontSize: fontSize(40, width, 20, 56), color: '#ffffff' });
    this.add.text(pad, 72, `Coins: ${save.walletCoins}`, { fontSize: fontSize(26, width), color: '#ffd54f' });

    this.add.text(pad, 124, 'Car Skins', { fontSize: fontSize(28, width), color: '#90caf9' });
    let rowY = 168;
    CAR_SKINS.forEach((skin, index) => {
      const y = rowY + index * rowH;
      const unlocked = save.unlockedSkins.includes(skin.id);
      const selected = save.selectedSkin === skin.id;
      this.createPurchaseButton(
        pad,
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

    const themesHeaderY = narrow ? rowY + CAR_SKINS.length * rowH + 28 : 124;
    const themesStartY = narrow ? themesHeaderY + 36 : 168;
    this.add.text(narrow ? pad : width * 0.5 + pad, themesHeaderY, 'Map Themes', {
      fontSize: fontSize(28, width),
      color: '#90caf9',
    });
    const themeX = narrow ? pad : width * 0.5 + pad;
    MAP_THEMES.forEach((theme, index) => {
      const y = themesStartY + index * rowH;
      const unlocked = save.unlockedThemes.includes(theme.id);
      const selected = save.selectedTheme === theme.id;
      this.createPurchaseButton(
        themeX,
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
    y: number,
    label: string,
    actionLabel: string,
    onClick: () => void,
  ): void {
    const w = this.scale.width;
    const actionX = Math.min(x + 280, w - 16);
    this.add.text(x, y, label, {
      fontSize: fontSize(22, w),
      color: '#ffffff',
      wordWrap: { width: Math.max(120, actionX - x - 12) },
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
