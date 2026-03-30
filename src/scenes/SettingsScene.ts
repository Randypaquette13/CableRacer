import Phaser from 'phaser';
import { SCENES } from '../core/config';
import { InputManager, type InputAction } from '../core/InputManager';
import { fontSize } from '../core/uiLayout';

export class SettingsScene extends Phaser.Scene {
  private listeningFor?: InputAction;
  private statusText?: Phaser.GameObjects.Text;
  private keyRows: Record<InputAction, Phaser.GameObjects.Text> = {
    hookLeft: undefined as unknown as Phaser.GameObjects.Text,
    hookRight: undefined as unknown as Phaser.GameObjects.Text,
    releaseHook: undefined as unknown as Phaser.GameObjects.Text,
  };

  constructor() {
    super(SCENES.settings);
  }

  create(): void {
    const { width, height } = this.scale;
    const pad = Math.max(16, width * 0.04);
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x071322);
    this.add.text(pad, 20, 'Settings — Keybindings', {
      fontSize: fontSize(36, width, 18, 48),
      color: '#ffffff',
      wordWrap: { width: width - pad * 2 },
    });

    const rowGap = width < 480 ? 56 : 72;
    let ry = 108;
    this.createBindingRow('hookLeft', 'Hook Left', ry);
    ry += rowGap;
    this.createBindingRow('hookRight', 'Hook Right', ry);
    ry += rowGap;
    this.createBindingRow('releaseHook', 'Release Hook', ry);

    this.statusText = this.add.text(pad, ry + 72, '', {
      fontSize: fontSize(18, width),
      color: '#90caf9',
      wordWrap: { width: width - pad * 2 },
    });

    this.add
      .text(width - pad, height - 44, 'Back', {
        fontSize: fontSize(24, width),
        color: '#ffd54f',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start(SCENES.menu));

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!this.listeningFor) {
        return;
      }
      InputManager.setBinding(this.listeningFor, event.code);
      this.keyRows[this.listeningFor].setText(event.code);
      this.setStatus(`Bound ${this.listeningFor} to ${event.code}`);
      this.listeningFor = undefined;
    });
  }

  private createBindingRow(action: InputAction, label: string, y: number): void {
    const { width } = this.scale;
    const pad = Math.max(16, width * 0.04);
    const bindings = InputManager.getBindings();
    const fs = fontSize(24, width);
    this.add.text(pad, y, label, { fontSize: fs, color: '#ffffff' });
    const keyText = this.add.text(width * 0.48, y, bindings[action], {
      fontSize: fs,
      color: '#90caf9',
    });
    const rebind = this.add
      .text(width - pad, y, '[Rebind]', { fontSize: fs, color: '#ffd54f' })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    rebind.on('pointerdown', () => {
      this.listeningFor = action;
      this.setStatus(`Press a key for ${label}`);
    });
    this.keyRows[action] = keyText;
  }

  private setStatus(text: string): void {
    this.statusText?.setText(text);
  }
}
