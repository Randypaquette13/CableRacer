import Phaser from 'phaser';
import { CAR_SKINS, MAP_THEMES, SCENES } from '../core/config';
import { ProgressionService } from '../core/ProgressionService';

export class CustomizeScene extends Phaser.Scene {
  private infoText?: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.customize);
  }

  create(): void {
    const { width } = this.scale;
    const save = ProgressionService.data;

    this.add.rectangle(width * 0.5, this.scale.height * 0.5, width, this.scale.height, 0x09111f);
    this.add.text(30, 20, 'Customize', { fontSize: '48px', color: '#ffffff' });
    this.add.text(30, 80, `Coins: ${save.walletCoins}`, { fontSize: '28px', color: '#ffd54f' });

    this.add.text(30, 140, 'Car Skins', { fontSize: '32px', color: '#90caf9' });
    CAR_SKINS.forEach((skin, index) => {
      const y = 200 + index * 58;
      const unlocked = save.unlockedSkins.includes(skin.id);
      const selected = save.selectedSkin === skin.id;
      this.createPurchaseButton(
        30,
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

    this.add.text(width * 0.5 + 30, 140, 'Map Themes', { fontSize: '32px', color: '#90caf9' });
    MAP_THEMES.forEach((theme, index) => {
      const y = 200 + index * 58;
      const unlocked = save.unlockedThemes.includes(theme.id);
      const selected = save.selectedTheme === theme.id;
      this.createPurchaseButton(
        width * 0.5 + 30,
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

    this.createMenuButton(width - 140, this.scale.height - 45, 'Back', () => {
      this.scene.start(SCENES.menu);
    });

    this.infoText = this.add.text(30, this.scale.height - 45, '', {
      fontSize: '22px',
      color: '#ef9a9a',
    });
  }

  private createPurchaseButton(
    x: number,
    y: number,
    label: string,
    actionLabel: string,
    onClick: () => void,
  ): void {
    this.add.text(x, y, label, { fontSize: '24px', color: '#ffffff' });
    const action = this.add
      .text(x + 280, y, `[${actionLabel}]`, {
        fontSize: '24px',
        color: '#ffd54f',
      })
      .setInteractive({ useHandCursor: true });
    action.on('pointerdown', onClick);
  }

  private createMenuButton(x: number, y: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 180, 54, 0x1e2a44).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: '24px',
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
