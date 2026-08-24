import { describe, it, expect } from 'vitest';
import {
  COLOR_TOKEN_IDS,
  DEFAULT_GEOMETRY,
  sanitizeHex,
  sanitizeColorRecord,
  sanitizeGeometry,
  buildEngineVars
} from '../themeModel';
import { BUILTIN_THEMES, BUILTIN_THEME_NAMES, resolveThemeAppearance } from '../builtin-themes';

describe('sanitizeHex', () => {
  it('normalizes 6-digit and expands 3-digit hex', () => {
    expect(sanitizeHex('#ABcDeF')).toBe('#abcdef');
    expect(sanitizeHex('#F0A')).toBe('#ff00aa');
  });

  it('rejects non-hex values', () => {
    expect(sanitizeHex('red')).toBeUndefined();
    expect(sanitizeHex('#12345')).toBeUndefined();
    expect(sanitizeHex(42)).toBeUndefined();
  });
});

describe('sanitizeColorRecord', () => {
  it('keeps known token ids with valid hex only', () => {
    const out = sanitizeColorRecord({ primary: '#605DFF', base200: 'zzz', junk: '#000000' });
    expect(out).toEqual({ primary: '#605dff' });
  });

  it('returns undefined for non-objects', () => {
    expect(sanitizeColorRecord(null)).toBeUndefined();
    expect(sanitizeColorRecord([1])).toBeUndefined();
  });
});

describe('sanitizeGeometry', () => {
  it('clamps radius/border into range and drops invalid keys', () => {
    const out = sanitizeGeometry({ radiusBox: 99, border: -2, depth: 1, noise: 7, junk: 1 });
    expect(out).toEqual({ radiusBox: 32, border: 0, depth: 1 });
  });

  it('accepts full valid geometry', () => {
    const out = sanitizeGeometry({ ...DEFAULT_GEOMETRY, radiusField: 12 });
    expect(out).toEqual({ ...DEFAULT_GEOMETRY, radiusField: 12 });
  });
});

describe('builtin themes registry', () => {
  it('exposes builtin themes with a complete color set', () => {
    expect(BUILTIN_THEME_NAMES).toContain('dark');
    expect(BUILTIN_THEME_NAMES).toContain('luxury');
    for (const name of BUILTIN_THEME_NAMES) {
      const t = BUILTIN_THEMES[name];
      for (const id of COLOR_TOKEN_IDS) {
        expect(t.colors[id]).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(['dark', 'light']).toContain(t.scheme);
      expect(t.glassAlpha).toBe(100);
    }
  });
});

describe('resolveThemeAppearance', () => {
  it('resolves builtin themes and applies geometry overrides', () => {
    const t = resolveThemeAppearance({
      theme: 'midnight',
      geometry: { radiusBox: 16 },
      glassAlpha: 70
    });
    expect(t.colors.primary).toBe(BUILTIN_THEMES.midnight.colors.primary);
    expect(t.geometry.radiusBox).toBe(16);
    expect(t.geometry.border).toBe(DEFAULT_GEOMETRY.border);
    expect(t.glassAlpha).toBe(70);
  });

  it('merges custom theme over seed with sanitized overrides', () => {
    const t = resolveThemeAppearance({
      theme: 'custom',
      customBase: 'light',
      customColors: { primary: '#00FF00', accent: 'nope' }
    });
    expect(t.scheme).toBe('light');
    expect(t.colors.primary).toBe('#00ff00');
    expect(t.colors.accent).toBe(BUILTIN_THEMES.light.colors.accent);
  });

  it('falls back to dark seed for unknown inputs', () => {
    const t = resolveThemeAppearance({ theme: 'nope' as string });
    expect(t.colors.primary).toBe(BUILTIN_THEMES.dark.colors.primary);
  });
});

describe('buildEngineVars', () => {
  it('emits exact css var names incl. numeric base tokens', () => {
    const t = resolveThemeAppearance({ theme: 'dark', glassAlpha: 60 });
    const vars = buildEngineVars(t, 14);
    expect(vars['--color-base-100']).toBe(t.colors.base100);
    expect(vars['--color-base-200']).toBe(t.colors.base200);
    expect(vars['--color-base-300']).toBe(t.colors.base300);
    expect(vars['--color-base-content']).toBe(t.colors.baseContent);
    expect(vars['--color-primary-content']).toBe(t.colors.primaryContent);
    expect(vars['--glass-alpha']).toBe('60%');
    expect(vars['--font-size']).toBe('14px');
  });

  it('emits all semantic vars plus engine vars and engine vars', () => {
    const t = resolveThemeAppearance({ theme: 'dark', glassAlpha: 60 });
    const vars = buildEngineVars(t, 14);
    for (const id of COLOR_TOKEN_IDS) {
      const key = `--color-${id
        .replace(/([A-Z])/g, '-$1')
        .replace(/(\d+)/g, '-$1')
        .toLowerCase()}`;
      expect(Object.keys(vars)).toContain(key);
    }
    expect(vars['--border']).toBe(`${DEFAULT_GEOMETRY.border}px`);
    expect(vars['--size-field']).toBe('2.25rem');
    expect(vars['--size-selector']).toBe('16px');
  });
});
