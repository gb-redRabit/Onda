import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * A/B dla przyklejania okna do krawędzi (Aero Snap) na Windows.
 *
 * `true`  — stara warstwa `transparent: true`. Pełniejsze szkło, ale Windows traktuje
 *           okno jako warstwowe (WS_EX_LAYERED), przez co snap/maximize bywa ograniczony.
 * `false` — okno nieprzezroczyste z `backgroundMaterial` (acrylic/mica). Snap działa;
 *           materiał systemowy nadal daje efekt szkła, a `hasShadow` przywraca cień.
 *
 * Zostawione jako jawny przełącznik, żeby można było porównać oba warianty bez
 * rozgrzebywania całego presetu.
 */
export const WINDOW_TRANSPARENT = false;

// Tło widoczne tylko tam, gdzie nie sięga materiał systemowy (np. pierwsze malowanie,
// motyw jasny). Domyślna ciemna baza aplikacji.
const OPAQUE_BACKGROUND = '#191e24';

/**
 * Bezramkowa "szklana" oprawa wspólna dla okna głównego i okien eksploratora:
 * przezroczyste tło z akrylem na Windows i vibrancy paska bocznego na macOS.
 * Trzymane w jednym miejscu, aby dwa kreatory okien nie rozjechały się.
 */
export const GLASS_WINDOW_OPTS: Partial<BrowserWindowConstructorOptions> = {
  frame: false,
  titleBarStyle: 'hidden',
  ...(WINDOW_TRANSPARENT
    ? { transparent: true, backgroundColor: '#00000000', hasShadow: false }
    : { transparent: false, backgroundColor: OPAQUE_BACKGROUND, hasShadow: true }),
  ...(process.platform === 'win32'
    ? { backgroundMaterial: 'acrylic' as const, accentColor: OPAQUE_BACKGROUND }
    : {}),
  ...(process.platform === 'darwin'
    ? { vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
    : {})
};
