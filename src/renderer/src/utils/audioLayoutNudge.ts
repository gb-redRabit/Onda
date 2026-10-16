import type { AudioLayoutElement } from '@renderer/types/settings';

// Przesuwanie elementów układu audio z KLAWIATURY (odpowiednik przeciągania myszą).
// Krok i clamp muszą zgadzać się z `useAudioElementDrag` (mysz: `100 - 5` = 95, round).
export const KEYBOARD_NUDGE_STEP = 1;
export const KEYBOARD_NUDGE_FAST = 5;
export const KEYBOARD_NUDGE_MAX = 95;

/**
 * Zwraca nową pozycję elementu po naciśnięciu strzałki (z przycięciem do 0..95),
 * albo `null`, gdy klawisz nie jest strzałką. `fast` (Shift) zwiększa skok do 5%.
 */
export function nudgeElement(
  el: Pick<AudioLayoutElement, 'x' | 'y'>,
  key: string,
  fast: boolean
): { x: number; y: number } | null {
  const step = fast ? KEYBOARD_NUDGE_FAST : KEYBOARD_NUDGE_STEP;
  let x = el.x;
  let y = el.y;
  switch (key) {
    case 'ArrowLeft':
      x -= step;
      break;
    case 'ArrowRight':
      x += step;
      break;
    case 'ArrowUp':
      y -= step;
      break;
    case 'ArrowDown':
      y += step;
      break;
    default:
      return null;
  }
  return {
    x: Math.max(0, Math.min(KEYBOARD_NUDGE_MAX, x)),
    y: Math.max(0, Math.min(KEYBOARD_NUDGE_MAX, y))
  };
}
