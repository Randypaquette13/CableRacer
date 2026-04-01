import Phaser from 'phaser';
import { CAR_SKINS, MAP_THEMES, SCENES, type GameSceneData } from '../core/config';
import { getLevelByIndex, LEVEL_COUNT, type LevelDefinition } from '../core/levelData';
import { InputManager } from '../core/InputManager';
import { ProgressionService } from '../core/ProgressionService';
import {
  hidePhoneGameControls,
  setPhoneGameCenterRetry,
  showPhoneGameControls,
} from '../core/phoneGameControls';
import { fontSize, isCoarsePointer } from '../core/uiLayout';

/** Touch on some mobile browsers — prefer wasTouch + pointerType. */
function isTouchPointer(pointer: Phaser.Input.Pointer): boolean {
  if (pointer.wasTouch) {
    return true;
  }
  const pt = (pointer as unknown as { pointerType?: string }).pointerType;
  return pt === 'touch';
}

type ExtendingHook = {
  /** World position where the cable was shot from (fixed ray origin) */
  fireLaunchPoint: Phaser.Math.Vector2;
  direction: Phaser.Math.Vector2;
  currentLength: number;
  sideSign: -1 | 1;
};

type HookState = {
  anchor: Phaser.Math.Vector2;
  radius: number;
  angle: number;
  angularSign: number;
  sideSign: -1 | 1;
  extending?: ExtendingHook;
};

type Coin = {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Arc;
};

const CAR_RADIUS = 18;
const BASE_SPEED = 300;
const MAX_SPEED = 430;
const ACCEL = 28;
/** Distance (m) at which speed ramp starts; below this, multiplier is 1.0 */
const DISTANCE_SPEED_RAMP_START = 3000;
/** Distance (m) at which speed ramp ends; at and above this, multiplier is 1.5 */
const DISTANCE_SPEED_RAMP_END = 100000;
const HOOK_RANGE = 1400;
/** Cable extends toward the wall at this speed (px/s); fast but not instant */
const CABLE_SHOOT_SPEED = 1800;
/** Max swing angular velocity (rad/s) so short cables don't whip the car */
const MAX_HOOK_OMEGA = 4.2;
const PATH_SIDE_PADDING = 0;
const STACK_HEIGHT = 340;
const DIVIDER_THICKNESS = 24;
const SIDE_WALL_THICKNESS = 12;
const GATE_WIDTH = 250;
/** Level mode: speed bump per pad (once each). */
const PAD_SPEED_BOOST = 70;
const LEVEL_SPEED_CAP = 660;
const SKID_SAMPLE_DISTANCE = 6;
const MAX_SKID_POINTS = 2600;
/** Avoid showing 0.01s immediately on level start / retry due to first-frame delay. */
const LEVEL_TIMER_ZERO_GRACE_MS = 90;

export class GameScene extends Phaser.Scene {
  private car!: Phaser.GameObjects.Container;
  private carPosition = new Phaser.Math.Vector2(0, 0);
  private carHeading = -Math.PI * 0.5;
  private speed = BASE_SPEED;
  private startY = 0;
  private distance = 0;
  private coinsCollected = 0;
  private hook: HookState | null = null;
  private hookGraphics!: Phaser.GameObjects.Graphics;
  private caveGraphics!: Phaser.GameObjects.Graphics;
  private skidGraphics!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private coins: Coin[] = [];
  private nextCoinY = 0;
  private gameEnded = false;
  private theme: (typeof MAP_THEMES)[number] = MAP_THEMES[0];
  private skin: (typeof CAR_SKINS)[number] = CAR_SKINS[0];
  private hookLeftKey?: Phaser.Input.Keyboard.Key;
  private hookRightKey?: Phaser.Input.Keyboard.Key;
  private releaseHookKey?: Phaser.Input.Keyboard.Key;
  private skidLeft: Phaser.Math.Vector2[] = [];
  private skidRight: Phaser.Math.Vector2[] = [];
  private lastSkidSample = new Phaser.Math.Vector2();
  private hasSkidSample = false;
  /** Touch-first phones: DOM grapple bar under canvas (see phoneGameControls.ts). */
  private phoneSplit = false;
  private runMode: 'endless' | 'level' = 'endless';
  private levelIndex = 0;
  private levelDef: LevelDefinition | null = null;
  private maxDividerStack = 1_000_000;
  private effectiveGateWidth = GATE_WIDTH;
  private targetX = 0;
  private targetY = 0;
  private targetRadiusPx = 44;
  private levelPadBounds: { left: number; top: number; right: number; bottom: number }[] = [];
  private padsTriggered: boolean[] = [];
  /** Axis-aligned level wall slabs (world px). top < bottom in screen Y. */
  private levelWallBounds: { left: number; top: number; right: number; bottom: number }[] = [];
  /** Explicit level timer; avoids scene clock drift and always starts from 0 on scene create. */
  private levelElapsedMs = 0;

  constructor() {
    super(SCENES.game);
  }

  shutdown(): void {
    document.body.style.cursor = '';
    hidePhoneGameControls(() => this.scale.refresh());
  }

  preload(): void {
    this.load.image('car-ember', 'assets/ember-car.png');
    this.load.image('car-supreme-gay', 'assets/supreme-gay-car.png');
  }

  create(): void {
    this.phoneSplit = isCoarsePointer();
    this.input.addPointer(2);

    const save = ProgressionService.data;
    const theme = MAP_THEMES.find((entry) => entry.id === save.selectedTheme);
    const skin = CAR_SKINS.find((entry) => entry.id === save.selectedSkin);
    if (theme) {
      this.theme = theme;
    }
    if (skin) {
      this.skin = skin;
    }

    this.applySceneRunPayload(this.sys.settings.data as GameSceneData | undefined);

    this.cameras.main.setBackgroundColor(this.theme.bg);
    this.matter.world.setGravity(0, 0);
    this.resetRunState();

    this.caveGraphics = this.add.graphics();
    this.skidGraphics = this.add.graphics();
    this.hookGraphics = this.add.graphics();
    if (this.runMode === 'level' && this.levelDef) {
      this.buildLevelDecor();
    }
    this.car = this.createCarSprite();
    if (this.runMode === 'level' && this.levelDef) {
      this.spawnLevelCoins();
    }

    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.applyGameViewCamera();
    this.cameras.main.setScroll(0, this.carPosition.y - this.scale.height * 0.5);

    const w = this.scale.width;
    this.hudText = this.add
      .text(16, 12, this.runMode === 'level' ? 'Time: 0.00s  Coins: 0' : 'Distance: 0m  Coins: 0', {
        fontSize: fontSize(26, w),
        color: '#ffffff',
      })
      .setScrollFactor(0);
    const helpLine =
      this.runMode === 'level'
        ? 'Reach the target — gates, wall slabs & tight gaps · boost pads add speed'
        : this.phoneSplit
          ? 'Use the buttons below the game'
          : isCoarsePointer()
            ? 'Tap left / right — center releases hook'
            : 'Mouse: L / R click · Keys · Space: release';
    this.add
      .text(16, 46, helpLine, {
        fontSize: fontSize(17, w),
        color: '#90caf9',
        wordWrap: { width: w - 28 },
      })
      .setScrollFactor(0);

    this.bindGameplayKeys();
    this.input.mouse?.disableContextMenu();
    document.body.style.cursor = 'none';
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.on('pointerdown', this.onPointerDown, this);
    if (this.phoneSplit) {
      showPhoneGameControls(
        {
          onHookLeft: () => {
            if (!this.gameEnded) {
              void this.fireHook(-1);
            }
          },
          onRelease: () => {
            if (!this.gameEnded) {
              this.releaseHook();
            }
          },
          onHookRight: () => {
            if (!this.gameEnded) {
              void this.fireHook(1);
            }
          },
        },
        () => this.scale.refresh(),
      );
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off('pointerdown', this.onPointerDown, this);
    });

    this.levelElapsedMs = 0;
  }

  private applySceneRunPayload(data: GameSceneData | undefined): void {
    this.runMode = 'endless';
    this.levelIndex = 0;
    this.levelDef = null;
    this.maxDividerStack = 1_000_000;
    this.effectiveGateWidth = GATE_WIDTH;
    this.levelPadBounds = [];
    this.padsTriggered = [];
    this.levelWallBounds = [];

    if (data && data.mode === 'level' && typeof data.levelIndex === 'number') {
      const idx = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(data.levelIndex)));
      const def = getLevelByIndex(idx);
      if (def) {
        this.runMode = 'level';
        this.levelIndex = idx;
        this.levelDef = def;
        this.maxDividerStack = def.dividerCount;
        this.effectiveGateWidth = def.gateWidth;
      }
    }
  }

  private buildLevelDecor(): void {
    const def = this.levelDef;
    if (!def) {
      return;
    }
    const w = this.scale.width;
    this.targetX = w * def.targetXRatio;
    this.targetY = this.startY - def.targetDyFromStart;
    this.targetRadiusPx = def.targetRadius;

    this.levelPadBounds = def.pads.map((p) => {
      const cx = w * p.xRatio;
      const cy = this.startY - p.dyFromStart;
      const hw = p.w * 0.5;
      const hh = p.h * 0.5;
      return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
    });
    this.padsTriggered = this.levelPadBounds.map(() => false);

    this.levelWallBounds = [];
    for (const wv of def.walls ?? []) {
      const left = w * wv.xRatioLeft;
      const right = w * wv.xRatioRight;
      const top = this.startY - wv.dyTop;
      const bottom = this.startY - wv.dyBottom;
      this.levelWallBounds.push({ left, right, top, bottom });
    }

    const g = this.add.graphics();
    for (const b of this.levelWallBounds) {
      g.fillStyle(0x263238, 0.92);
      g.fillRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
      g.lineStyle(3, 0x90a4ae, 0.85);
      g.strokeRect(b.left, b.top, b.right - b.left, b.bottom - b.top);
    }
    for (const p of def.pads) {
      const cx = w * p.xRatio;
      const cy = this.startY - p.dyFromStart;
      g.fillStyle(0x00e5ff, 0.45);
      g.fillRect(cx - p.w * 0.5, cy - p.h * 0.5, p.w, p.h);
      g.lineStyle(2, 0xffffff, 0.5);
      g.strokeRect(cx - p.w * 0.5, cy - p.h * 0.5, p.w, p.h);
    }
    const tx = this.targetX;
    const ty = this.targetY;
    const tr = this.targetRadiusPx;
    g.lineStyle(4, 0xff5252, 0.95);
    g.strokeCircle(tx, ty, tr);
    g.lineStyle(3, 0xffffff, 0.85);
    g.strokeCircle(tx, ty, tr * 0.55);
    g.fillStyle(0xff8a80, 0.35);
    g.fillCircle(tx, ty, tr * 0.35);
  }

  private spawnLevelCoins(): void {
    const def = this.levelDef;
    if (!def) {
      return;
    }
    const w = this.scale.width;
    for (const c of def.coins) {
      const x = w * c.xRatio;
      const y = this.startY - c.dyFromStart;
      if (this.isInsideCave(x, y, 25)) {
        const sprite = this.add.circle(x, y, 18, this.theme.coin);
        this.coins.push({ x, y, sprite });
      }
    }
  }

  private resetRunState(): void {
    /** Slightly higher start on phone (closer to first horizontal divider). */
    const marginFromBottom = this.phoneSplit ? 158 : 140;
    const startY = this.scale.height - marginFromBottom;
    this.startY = startY;
    this.carPosition.set((this.getPathMinX() + this.getPathMaxX()) * 0.5, startY);
    /** Endless keeps the original start; timed levels use the newer centered-up intro. */
    this.carHeading = this.runMode === 'level' ? -Math.PI * 0.5 : 0;
    this.speed = BASE_SPEED;
    this.distance = 0;
    this.coinsCollected = 0;
    this.hook = null;
    this.coins = [];
    this.nextCoinY = this.carPosition.y - 260;
    this.gameEnded = false;
    this.levelElapsedMs = 0;
    this.skidLeft = [];
    this.skidRight = [];
    this.hasSkidSample = false;
    this.lastSkidSample.set(this.carPosition.x, this.carPosition.y);
    this.skidGraphics?.clear();
    if (this.phoneSplit) {
      setPhoneGameCenterRetry(false);
    }
  }

  private createCarSprite(): Phaser.GameObjects.Container {
    const car = this.add.container(this.carPosition.x, this.carPosition.y);
    if (this.skin.id === 'ember' && this.textures.exists('car-ember')) {
      const emberCar = this.add.image(0, 0, 'car-ember').setDisplaySize(92, 50);
      emberCar.rotation = Math.PI;
      car.add(emberCar);
      return car;
    }
    if (this.skin.id === 'supremeGay' && this.textures.exists('car-supreme-gay')) {
      const faceCar = this.add.image(0, 0, 'car-supreme-gay').setDisplaySize(70, 70);
      faceCar.rotation = Math.PI * 0.5;
      car.add(faceCar);
      return car;
    }

    const body = this.add
      .rectangle(0, 0, 44, 22, this.skin.color)
      .setStrokeStyle(2, 0xe3f2fd, 0.6);
    const nose = this.add.rectangle(21, 0, 10, 14, Phaser.Display.Color.ValueToColor(this.skin.color).darken(12).color);
    const windshield = this.add.rectangle(4, 0, 15, 12, 0x9ad7ff).setAlpha(0.85);
    const wheelRtFront = this.add.rectangle(9, -14, 12, 5, 0x111111);
    const wheelRtBack = this.add.rectangle(-10, -14, 12, 5, 0x111111);
    const wheelLtFront = this.add.rectangle(9, 14, 12, 5, 0x111111);
    const wheelLtBack = this.add.rectangle(-10, 14, 12, 5, 0x111111);
    car.add([body, nose, windshield, wheelRtFront, wheelRtBack, wheelLtFront, wheelLtBack]);
    return car;
  }

  update(_time: number, delta: number): void {
    if (this.gameEnded) {
      return;
    }
    this.processInput();
    const dt = Math.min(delta / 1000, 0.033);
    if (this.runMode === 'level') {
      this.levelElapsedMs += delta;
    }
    this.speed = Math.min(this.speed + ACCEL * dt, MAX_SPEED);

    const prevX = this.carPosition.x;
    const prevY = this.carPosition.y;

    if (this.hook && !this.hook.extending) {
      this.updateHookedMotion(dt);
    } else {
      const forward = new Phaser.Math.Vector2(Math.cos(this.carHeading), Math.sin(this.carHeading));
      this.carPosition.add(forward.scale(this.getEffectiveSpeed() * dt));
      if (this.hook?.extending) {
        this.updateCableExtending(dt);
      }
    }

    this.distance += Phaser.Math.Distance.Between(prevX, prevY, this.carPosition.x, this.carPosition.y);
    this.syncCarVisuals();
    if (this.runMode === 'level') {
      this.checkLevelBoostPads();
    }
    this.updateCameraScroll();
    this.updateSkidMarks();
    this.updateDistance();
    this.spawnCoinsAhead();
    this.updateCoinCollection();
    this.renderCave();
    this.renderSkidMarks();
    this.renderHook();

    if (this.runMode === 'level' && this.levelDef && !this.gameEnded) {
      const distToTarget = Phaser.Math.Distance.Between(
        this.carPosition.x,
        this.carPosition.y,
        this.targetX,
        this.targetY,
      );
      if (distToTarget <= this.targetRadiusPx + CAR_RADIUS - 2) {
        this.completeLevelWin();
        return;
      }
    }

    if (!this.isInsideCave(this.carPosition.x, this.carPosition.y, CAR_RADIUS)) {
      this.endRun();
    }
  }

  private checkLevelBoostPads(): void {
    const { x, y } = this.carPosition;
    for (let i = 0; i < this.levelPadBounds.length; i += 1) {
      if (this.padsTriggered[i]) {
        continue;
      }
      const b = this.levelPadBounds[i];
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
        this.speed = Math.min(this.speed + PAD_SPEED_BOOST, LEVEL_SPEED_CAP);
        this.padsTriggered[i] = true;
      }
    }
  }

  private completeLevelWin(): void {
    if (this.gameEnded) {
      return;
    }
    this.gameEnded = true;
    const elapsed = this.levelElapsedMs / 1000;
    const { newBest } = ProgressionService.recordLevelFinish(
      this.levelIndex,
      elapsed,
      this.coinsCollected,
      true,
    );
    this.scene.start(SCENES.levelResult, {
      levelIndex: this.levelIndex,
      timeSec: elapsed,
      coins: this.coinsCollected,
      cleared: true,
      newBest,
    });
  }

  private bindGameplayKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const left = InputManager.getKeyFor('hookLeft');
    const right = InputManager.getKeyFor('hookRight');
    const release = InputManager.getKeyFor('releaseHook');

    const leftCode = this.toPhaserKeyCode(left);
    const rightCode = this.toPhaserKeyCode(right);
    const releaseCode = this.toPhaserKeyCode(release);

    this.hookLeftKey = keyboard.addKey(leftCode ?? left);
    this.hookRightKey = keyboard.addKey(rightCode ?? right);
    this.releaseHookKey = keyboard.addKey(releaseCode ?? release);
    keyboard.addCapture([left, right, release]);
  }

  private toPhaserKeyCode(code: string): number | null {
    const keyCodes = Phaser.Input.Keyboard.KeyCodes as Record<string, number | undefined>;
    const directMap: Record<string, string> = {
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      Space: 'SPACE',
      Enter: 'ENTER',
      Escape: 'ESC',
      Tab: 'TAB',
      ShiftLeft: 'SHIFT',
      ShiftRight: 'SHIFT',
      ControlLeft: 'CTRL',
      ControlRight: 'CTRL',
      AltLeft: 'ALT',
      AltRight: 'ALT',
    };

    const mapped = directMap[code];
    if (mapped && keyCodes[mapped] !== undefined) {
      return keyCodes[mapped] as number;
    }

    if (code.startsWith('Key') && code.length === 4) {
      const letter = code.slice(3).toUpperCase();
      if (keyCodes[letter] !== undefined) {
        return keyCodes[letter] as number;
      }
    }

    if (code.startsWith('Digit') && code.length === 6) {
      const digit = code.slice(5);
      const names = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
      const name = names[Number(digit)];
      if (name && keyCodes[name] !== undefined) {
        return keyCodes[name] as number;
      }
    }

    return null;
  }

  private processInput(): void {
    if (this.gameEnded) {
      return;
    }
    if (this.hookLeftKey && Phaser.Input.Keyboard.JustDown(this.hookLeftKey)) {
      this.fireHook(-1);
    }
    if (this.hookRightKey && Phaser.Input.Keyboard.JustDown(this.hookRightKey)) {
      this.fireHook(1);
    }
    if (this.releaseHookKey && Phaser.Input.Keyboard.JustDown(this.releaseHookKey)) {
      this.releaseHook();
    }
  }

  private applyGameViewCamera(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cam = this.cameras.main;
    cam.setViewport(0, 0, w, h);
    cam.setSize(w, h);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.gameEnded) {
      return;
    }
    const w = this.scale.width;
    if (w <= 0 || this.scale.height <= 0) {
      return;
    }

    const touch = isTouchPointer(pointer);

    /** Mouse / pen: left & right button; full game area. */
    if (!touch) {
      if (pointer.button === 0) {
        this.fireHook(-1);
        return;
      }
      if (pointer.button === 2) {
        this.fireHook(1);
        return;
      }
      return;
    }

    /** Phone hooks are DOM buttons under the canvas — ignore touch on gameplay area. */
    if (this.phoneSplit) {
      return;
    }

    const t = pointer.x / w;
    if (t < 0.34) {
      this.fireHook(-1);
      return;
    }
    if (t > 0.66) {
      this.fireHook(1);
      return;
    }
    this.releaseHook();
  }

  private fireHook(sideSign: -1 | 1): boolean {
    const angle = this.carHeading + sideSign * Math.PI * 0.5;
    const rayDir = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle));
    const launchPoint = this.carPosition
      .clone()
      .add(rayDir.clone().scale(CAR_RADIUS * 0.85));
    if (!this.findWallAnchor(launchPoint, rayDir)) {
      return false;
    }
    const direction = rayDir.clone().normalize();
    const nextHook: HookState = {
      anchor: new Phaser.Math.Vector2(0, 0),
      radius: 0,
      angle: 0,
      angularSign: 0,
      sideSign,
      extending: {
        fireLaunchPoint: launchPoint.clone(),
        direction,
        currentLength: 0,
        sideSign,
      },
    };
    this.hook = nextHook;
    return true;
  }

  private updateCableExtending(dt: number): void {
    if (!this.hook?.extending) {
      return;
    }
    const ex = this.hook.extending;
    const step = 8;
    const maxTravel = CABLE_SHOOT_SPEED * dt;
    let remaining = maxTravel;
    while (remaining >= step) {
      ex.currentLength += step;
      remaining -= step;
      if (ex.currentLength >= HOOK_RANGE) {
        this.hook = null;
        return;
      }
      const tipX = ex.fireLaunchPoint.x + ex.direction.x * ex.currentLength;
      const tipY = ex.fireLaunchPoint.y + ex.direction.y * ex.currentLength;
      if (!this.isInsideCave(tipX, tipY, 9)) {
        this.latchHook(new Phaser.Math.Vector2(tipX, tipY));
        return;
      }
    }
    ex.currentLength += remaining;
    if (ex.currentLength >= HOOK_RANGE) {
      this.hook = null;
      return;
    }
    const tipX = ex.fireLaunchPoint.x + ex.direction.x * ex.currentLength;
    const tipY = ex.fireLaunchPoint.y + ex.direction.y * ex.currentLength;
    if (!this.isInsideCave(tipX, tipY, 9)) {
      this.latchHook(new Phaser.Math.Vector2(tipX, tipY));
    }
  }

  private latchHook(anchor: Phaser.Math.Vector2): void {
    if (!this.hook?.extending) {
      return;
    }
    const arm = this.carPosition.clone().subtract(anchor);
    const radius = arm.length();
    const forward = new Phaser.Math.Vector2(Math.cos(this.carHeading), Math.sin(this.carHeading));
    const radialNorm = arm.clone().normalize();
    const cross = radialNorm.x * forward.y - radialNorm.y * forward.x;
    this.hook.anchor = anchor.clone();
    this.hook.radius = radius;
    this.hook.angle = Math.atan2(arm.y, arm.x);
    this.hook.angularSign = cross >= 0 ? 1 : -1;
    this.hook.extending = undefined;
  }

  private releaseHook(): void {
    this.hook = null;
  }

  private getDistanceSpeedMultiplier(): number {
    if (this.distance <= DISTANCE_SPEED_RAMP_START) return 1;
    if (this.distance >= DISTANCE_SPEED_RAMP_END) return 1.5;
    const t = (this.distance - DISTANCE_SPEED_RAMP_START) / (DISTANCE_SPEED_RAMP_END - DISTANCE_SPEED_RAMP_START);
    return 1 + t * 0.5;
  }

  private getEffectiveSpeed(): number {
    if (this.runMode === 'level') {
      return this.speed;
    }
    return this.speed * this.getDistanceSpeedMultiplier();
  }

  private updateHookedMotion(dt: number): void {
    if (!this.hook) {
      return;
    }
    const rawOmega = this.getEffectiveSpeed() / Math.max(this.hook.radius, 40);
    const omega = Math.min(rawOmega, MAX_HOOK_OMEGA) * this.hook.angularSign;
    this.hook.angle += omega * dt;
    this.carPosition.set(
      this.hook.anchor.x + Math.cos(this.hook.angle) * this.hook.radius,
      this.hook.anchor.y + Math.sin(this.hook.angle) * this.hook.radius,
    );
    this.carHeading = this.hook.angle + this.hook.angularSign * (Math.PI * 0.5);
  }

  private syncCarVisuals(): void {
    this.car.setPosition(this.carPosition.x, this.carPosition.y);
    this.car.rotation = this.carHeading;
  }

  private isInsideCave(x: number, y: number, margin: number): boolean {
    if (x < this.getPathMinX() + margin || x > this.getPathMaxX() - margin) {
      return false;
    }
    if (this.isBlockedByLevelWall(x, y, margin)) {
      return false;
    }
    return !this.isBlockedByDivider(x, y, margin);
  }

  private isBlockedByLevelWall(x: number, y: number, margin: number): boolean {
    for (const b of this.levelWallBounds) {
      if (
        x >= b.left - margin &&
        x <= b.right + margin &&
        y >= b.top - margin &&
        y <= b.bottom + margin
      ) {
        return true;
      }
    }
    return false;
  }

  private findWallAnchor(origin: Phaser.Math.Vector2, dir: Phaser.Math.Vector2): Phaser.Math.Vector2 | null {
    const unit = dir.clone().normalize();
    const probe = origin.clone();
    const step = 8;
    const steps = Math.floor(HOOK_RANGE / step);

    for (let i = 1; i <= steps; i += 1) {
      probe.set(origin.x + unit.x * step * i, origin.y + unit.y * step * i);
      if (!this.isInsideCave(probe.x, probe.y, 9)) {
        return probe.clone();
      }
    }
    return null;
  }

  private updateDistance(): void {
    if (this.runMode === 'level') {
      const elapsedMs = this.levelElapsedMs;
      const t = elapsedMs <= LEVEL_TIMER_ZERO_GRACE_MS ? 0 : elapsedMs / 1000;
      this.hudText.setText(`Time: ${t.toFixed(2)}s  Coins: ${this.coinsCollected}`);
      return;
    }
    this.hudText.setText(`Distance: ${Math.floor(this.distance)}m  Coins: ${this.coinsCollected}`);
  }

  private spawnCoinsAhead(): void {
    if (this.runMode === 'level') {
      return;
    }
    const targetY = this.carPosition.y - 1600;
    while (this.nextCoinY > targetY) {
      const x = Phaser.Math.Between(this.getPathMinX() + 70, this.getPathMaxX() - 70);
      if (this.isInsideCave(x, this.nextCoinY, 25)) {
        const sprite = this.add.circle(x, this.nextCoinY, 18, this.theme.coin);
        this.coins.push({ x, y: this.nextCoinY, sprite });
      }
      this.nextCoinY -= Phaser.Math.Between(150, 260);
    }
  }

  private updateCoinCollection(): void {
    const kept: Coin[] = [];
    for (const coin of this.coins) {
      const distance = Phaser.Math.Distance.Between(
        this.carPosition.x,
        this.carPosition.y,
        coin.x,
        coin.y,
      );
      if (distance < CAR_RADIUS + 22) {
        this.coinsCollected += 1;
        coin.sprite.destroy();
        continue;
      }
      if (coin.y > this.carPosition.y + 300) {
        coin.sprite.destroy();
        continue;
      }
      kept.push(coin);
    }
    this.coins = kept;
  }

  private renderCave(): void {
    const cam = this.cameras.main;
    const startY = cam.worldView.y - 100;
    const endY = cam.worldView.bottom + 100;
    const pathMinX = this.getPathMinX();
    const pathMaxX = this.getPathMaxX();

    this.caveGraphics.clear();
    this.caveGraphics.fillStyle(this.theme.wall, 1);

    // Outer side boundaries stay inside visible map width.
    this.caveGraphics.fillRect(pathMinX, startY, SIDE_WALL_THICKNESS, endY - startY);
    this.caveGraphics.fillRect(
      pathMaxX - SIDE_WALL_THICKNESS,
      startY,
      SIDE_WALL_THICKNESS,
      endY - startY,
    );

    // Thin stacked divider walls with alternating gates.
    const firstVisible = Math.max(1, Math.floor((this.startY - endY) / STACK_HEIGHT) - 1);
    const lastVisible = Math.floor((this.startY - startY) / STACK_HEIGHT) + 1;
    for (
      let stack = firstVisible;
      stack <= lastVisible && stack <= this.maxDividerStack;
      stack += 1
    ) {
      const dividerY = this.startY - stack * STACK_HEIGHT;
      const gate = this.getGateRange(stack);
      const top = dividerY - DIVIDER_THICKNESS * 0.5;
      if (gate.start > pathMinX) {
        this.caveGraphics.fillRect(pathMinX, top, gate.start - pathMinX, DIVIDER_THICKNESS);
      }
      if (gate.end < pathMaxX) {
        this.caveGraphics.fillRect(gate.end, top, pathMaxX - gate.end, DIVIDER_THICKNESS);
      }
    }
  }

  private getPathMinX(): number {
    return PATH_SIDE_PADDING;
  }

  private getPathMaxX(): number {
    return this.scale.width - PATH_SIDE_PADDING;
  }

  private getGateRange(stackIndex: number): { start: number; end: number } {
    const minX = this.getPathMinX();
    const maxX = this.getPathMaxX();
    let width = Math.min(this.effectiveGateWidth, maxX - minX - 50);
    if (
      this.runMode === 'level' &&
      this.levelDef?.tightStacks?.includes(stackIndex) === true
    ) {
      width = Math.max(118, width * 0.72);
    }
    if (this.runMode === 'level' && stackIndex === 1) {
      const mid = (minX + maxX) * 0.5;
      const half = width * 0.5;
      return { start: mid - half, end: mid + half };
    }
    const opensRight = stackIndex % 2 === 1;
    if (opensRight) {
      return { start: maxX - width, end: maxX };
    }
    return { start: minX, end: minX + width };
  }

  private isBlockedByDivider(x: number, y: number, margin: number): boolean {
    const progressUp = this.startY - y;
    const approxStack = Math.round(progressUp / STACK_HEIGHT);
    for (let stack = approxStack - 1; stack <= approxStack + 1; stack += 1) {
      if (stack < 1 || stack > this.maxDividerStack) {
        continue;
      }
      const dividerY = this.startY - stack * STACK_HEIGHT;
      const inBand = Math.abs(y - dividerY) <= DIVIDER_THICKNESS * 0.5 + margin;
      if (!inBand) {
        continue;
      }
      const gate = this.getGateRange(stack);
      if (x < gate.start + margin || x > gate.end - margin) {
        return true;
      }
    }
    return false;
  }

  private renderHook(): void {
    this.hookGraphics.clear();
    if (!this.hook) {
      return;
    }
    this.hookGraphics.lineStyle(3, 0xe0f7fa, 1);
    const sideAngle = this.carHeading + this.hook.sideSign * Math.PI * 0.5;
    const launchPoint = this.carPosition
      .clone()
      .add(new Phaser.Math.Vector2(Math.cos(sideAngle), Math.sin(sideAngle)).scale(CAR_RADIUS * 0.85));

    if (this.hook.extending) {
      const ex = this.hook.extending;
      const tipX = ex.fireLaunchPoint.x + ex.direction.x * ex.currentLength;
      const tipY = ex.fireLaunchPoint.y + ex.direction.y * ex.currentLength;
      this.hookGraphics.beginPath();
      this.hookGraphics.moveTo(launchPoint.x, launchPoint.y);
      this.hookGraphics.lineTo(tipX, tipY);
      this.hookGraphics.strokePath();
      this.hookGraphics.fillStyle(0xffffff, 1);
      this.hookGraphics.fillCircle(tipX, tipY, 4);
    } else {
      this.hookGraphics.beginPath();
      this.hookGraphics.moveTo(launchPoint.x, launchPoint.y);
      this.hookGraphics.lineTo(this.hook.anchor.x, this.hook.anchor.y);
      this.hookGraphics.strokePath();
      this.hookGraphics.fillStyle(0xffffff, 1);
      this.hookGraphics.fillCircle(this.hook.anchor.x, this.hook.anchor.y, 4);
    }
  }

  private updateCameraScroll(): void {
    const cam = this.cameras.main;
    const sh = this.scale.height;
    const midpointY = cam.scrollY + sh * 0.5;
    const targetUpScroll = this.carPosition.y - sh * 0.5;

    cam.scrollX = 0;
    // Camera only moves up and never down.
    if (this.carPosition.y <= midpointY) {
      cam.scrollY = Math.min(cam.scrollY, targetUpScroll);
    }
  }

  private updateSkidMarks(): void {
    if (!this.hasSkidSample) {
      this.recordSkidSample();
      this.hasSkidSample = true;
      return;
    }

    const distanceSinceLast = Phaser.Math.Distance.Between(
      this.carPosition.x,
      this.carPosition.y,
      this.lastSkidSample.x,
      this.lastSkidSample.y,
    );
    if (distanceSinceLast < SKID_SAMPLE_DISTANCE) {
      return;
    }
    this.recordSkidSample();
  }

  private recordSkidSample(): void {
    const wheelOffset = 12;
    const sideAngle = this.carHeading + Math.PI * 0.5;
    const side = new Phaser.Math.Vector2(Math.cos(sideAngle), Math.sin(sideAngle)).scale(wheelOffset);
    this.skidLeft.push(this.carPosition.clone().subtract(side));
    this.skidRight.push(this.carPosition.clone().add(side));
    this.lastSkidSample.set(this.carPosition.x, this.carPosition.y);

    if (this.skidLeft.length > MAX_SKID_POINTS) {
      this.skidLeft.shift();
      this.skidRight.shift();
    }
  }

  private renderSkidMarks(): void {
    this.skidGraphics.clear();
    if (this.skidLeft.length < 2 || this.skidRight.length < 2) {
      return;
    }

    this.skidGraphics.lineStyle(3, 0x1f1f1f, 0.42);
    this.drawSkidTrack(this.skidLeft);
    this.drawSkidTrack(this.skidRight);
  }

  private drawSkidTrack(points: Phaser.Math.Vector2[]): void {
    this.skidGraphics.beginPath();
    this.skidGraphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      this.skidGraphics.lineTo(points[i].x, points[i].y);
    }
    this.skidGraphics.strokePath();
  }

  private endRun(): void {
    if (this.gameEnded) {
      return;
    }
    this.gameEnded = true;
    if (this.runMode === 'level') {
      const elapsed = this.levelElapsedMs / 1000;
      ProgressionService.recordLevelFinish(this.levelIndex, elapsed, this.coinsCollected, false);
      this.scene.start(SCENES.levelResult, {
        levelIndex: this.levelIndex,
        timeSec: elapsed,
        coins: this.coinsCollected,
        cleared: false,
        newBest: false,
      });
      return;
    }
    ProgressionService.addRunResult(Math.floor(this.distance), this.coinsCollected);
    this.scene.start(SCENES.gameOver, {
      distance: this.distance,
      coins: this.coinsCollected,
    });
  }
}
