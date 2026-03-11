import Phaser from 'phaser';
import { SCENES } from '../core/config';
import { InputManager, type InputAction } from '../core/InputManager';

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
    this.add.rectangle(width * 0.5, height * 0.5, width, height, 0x071322);
    this.add.text(40, 24, 'Settings - Keybindings', { fontSize: '44px', color: '#ffffff' });

    this.createBindingRow('hookLeft', 'Hook Left', 140);
    this.createBindingRow('hookRight', 'Hook Right', 220);
    this.createBindingRow('releaseHook', 'Release Hook', 300);

    this.statusText = this.add.text(40, 390, '', { fontSize: '22px', color: '#90caf9' });

    this.add
      .text(width - 170, height - 50, 'Back', {
        fontSize: '28px',
        color: '#ffd54f',
      })
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
    const bindings = InputManager.getBindings();
    this.add.text(40, y, label, { fontSize: '30px', color: '#ffffff' });
    const keyText = this.add.text(350, y, bindings[action], { fontSize: '30px', color: '#90caf9' });
    const rebind = this.add
      .text(520, y, '[Rebind]', { fontSize: '30px', color: '#ffd54f' })
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
