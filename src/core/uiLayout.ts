/** Font size string for Phaser text — scales down on narrow viewports. */
export function fontSize(basePx: number, width: number, min = 11, max = 96): string {
  const factor = Math.min(1.12, Math.max(0.62, width / 720));
  const px = Math.round(Math.max(min, Math.min(max, basePx * factor)));
  return `${px}px`;
}

/** Primary input is touch / coarse pointer (phones, many tablets). */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Max width for menu primary buttons on small screens. */
export function menuButtonWidth(width: number): number {
  return Math.min(340, Math.max(200, width - 32));
}
