import { DEFAULT_PLAYBACK } from '@renderer/utils/constants';

// Wizualizacja domyślnie podąża za motywem. Zapisane kolory równe dawnym,
// stałym wartościom traktujemy jako "użytkownik nic nie wybrał" — dzięki temu
// istniejące profile zaczynają reagować na motyw bez migracji ustawień.
export const DEFAULT_VIZ_PRIMARY = DEFAULT_PLAYBACK.visualization.primaryColor;
export const DEFAULT_VIZ_SECONDARY = DEFAULT_PLAYBACK.visualization.secondaryColor;

export type VizColorToken = 'primary' | 'secondary';

const CSS_VAR: Record<VizColorToken, string> = {
  primary: '--color-primary',
  secondary: '--color-secondary'
};

const DEFAULT: Record<VizColorToken, string> = {
  primary: DEFAULT_VIZ_PRIMARY,
  secondary: DEFAULT_VIZ_SECONDARY
};

/** Czy kolor jest nadal domyślny, czyli powinien iść za motywem. */
export function followsThemeColor(color: string | null | undefined, token: VizColorToken): boolean {
  return !color || color.toLowerCase() === DEFAULT[token];
}

/** Kolor z aktualnie zastosowanego motywu (CSS vars) albo stary fallback. */
export function themeVizColor(token: VizColorToken): string {
  if (typeof document === 'undefined') return DEFAULT[token];
  const value = getComputedStyle(document.documentElement).getPropertyValue(CSS_VAR[token]).trim();
  return value || DEFAULT[token];
}

export function resolveVizColor(color: string | null | undefined, token: VizColorToken): string {
  return followsThemeColor(color, token) ? themeVizColor(token) : color!;
}
