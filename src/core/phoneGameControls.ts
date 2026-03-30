/** DOM grapple bar below the canvas — does not cover gameplay (see index.html #phone-game-controls). */

export type PhoneGameControlHandlers = {
  onHookLeft: () => void;
  onRelease: () => void;
  onHookRight: () => void;
};

let abort: AbortController | null = null;

export function showPhoneGameControls(handlers: PhoneGameControlHandlers, refreshScale: () => void): void {
  hidePhoneGameControls();
  const root = document.getElementById('phone-game-controls');
  if (!root) {
    return;
  }
  abort = new AbortController();
  const { signal } = abort;
  root.hidden = false;

  const bind = (id: string, fn: () => void) => {
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        fn();
      },
      { signal },
    );
  };

  bind('phone-hook-l', handlers.onHookLeft);
  bind('phone-release', handlers.onRelease);
  bind('phone-hook-r', handlers.onHookRight);

  requestAnimationFrame(() => {
    refreshScale();
    requestAnimationFrame(refreshScale);
  });
}

export function hidePhoneGameControls(refreshScale?: () => void): void {
  abort?.abort();
  abort = null;
  const root = document.getElementById('phone-game-controls');
  if (root) {
    root.hidden = true;
  }
  refreshScale?.();
  requestAnimationFrame(() => refreshScale?.());
}
