import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES, BUILTIN_THEME_NAMES } from '../builtin-themes';
import { contrastRatio } from '../contrast';

// Pilnuje, że wbudowane motywy nie schodzą poniżej progu WCAG AA (4.5:1) dla dwóch
// najważniejszych par tekst/tło. Regresja: motyw `dark` miał primary-content/primary
// ≈ 4.13:1 (edycja `#edf1fe` → `#ffffff`).
const AA_NORMAL_TEXT = 4.5;

describe('builtin themes — WCAG AA contrast', () => {
  it.each(BUILTIN_THEME_NAMES)('%s: base-content on base-100 ≥ 4.5:1', (name) => {
    const c = BUILTIN_THEMES[name].colors;
    expect(contrastRatio(c.baseContent, c.base100)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(BUILTIN_THEME_NAMES)('%s: primary-content on primary ≥ 4.5:1', (name) => {
    const c = BUILTIN_THEMES[name].colors;
    expect(contrastRatio(c.primaryContent, c.primary)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  // `primaryText` jest kolorowanym tekstem/ikonami (`text-primary-text`) na powierzchniach
  // bazowych — inne niż wypełnienie `primary`. Musi przejść AA na base-100 i base-200.
  it.each(BUILTIN_THEME_NAMES)('%s: primary-text on base-100 ≥ 4.5:1', (name) => {
    const c = BUILTIN_THEMES[name].colors;
    expect(contrastRatio(c.primaryText, c.base100)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(BUILTIN_THEME_NAMES)('%s: primary-text on base-200 ≥ 4.5:1', (name) => {
    const c = BUILTIN_THEMES[name].colors;
    expect(contrastRatio(c.primaryText, c.base200)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('expands 3-digit shorthand', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  });
});
