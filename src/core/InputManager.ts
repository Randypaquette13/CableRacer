import { DEFAULT_KEYS } from './config';

export type InputAction = keyof typeof DEFAULT_KEYS;
export type KeyBindings = Record<InputAction, string>;

const KEY_STORAGE = 'cable-racer-keys-v1';

export class InputManager {
  private static bindings: KeyBindings = InputManager.loadBindings();

  static getBindings(): KeyBindings {
    return { ...InputManager.bindings };
  }

  static getKeyFor(action: InputAction): string {
    return InputManager.bindings[action];
  }

  static setBinding(action: InputAction, keyCode: string): void {
    InputManager.bindings[action] = keyCode;
    localStorage.setItem(KEY_STORAGE, JSON.stringify(InputManager.bindings));
  }

  private static loadBindings(): KeyBindings {
    const raw = localStorage.getItem(KEY_STORAGE);
    if (!raw) {
      return { ...DEFAULT_KEYS };
    }
    try {
      const parsed = JSON.parse(raw) as Partial<KeyBindings>;
      return {
        hookLeft: parsed.hookLeft ?? DEFAULT_KEYS.hookLeft,
        hookRight: parsed.hookRight ?? DEFAULT_KEYS.hookRight,
        releaseHook: parsed.releaseHook ?? DEFAULT_KEYS.releaseHook,
      };
    } catch {
      return { ...DEFAULT_KEYS };
    }
  }
}
