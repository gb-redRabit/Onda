import { nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '../useTheme';
import { resolveThemeAppearance } from '@shared/builtin-themes';
import { DEFAULT_APPEARANCE } from '@renderer/utils/constants';
import type { AppearanceSettings } from '@renderer/types/settings';

const originalInvoke = window.api.invoke;
const originalSend = window.api.send;

// Zmiany wyglądu przechodzą przez reapplyTheme(), która scala je w
// pojedynczy rAF, więc import motywu dotykający kilku pól powoduje jedno przemalowanie.
async function flushThemeFrame(): Promise<void> {
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe('useTheme window material', () => {
  afterEach(() => {
    window.api.invoke = originalInvoke;
    window.api.send = originalSend;
    vi.clearAllMocks();
  });

  it('only switches acrylic/auto at the glass threshold and avoids repeat IPC calls', async () => {
    const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE, glassAlpha: 70 });
    const invoke = vi.fn().mockResolvedValue(true);
    window.api.invoke = invoke as typeof window.api.invoke;
    const theme = useTheme(appearance);

    const materialCalls = () =>
      invoke.mock.calls.filter(([channel]) => channel === 'app:setBackgroundMaterial');

    theme.applyTheme();
    expect(materialCalls()).toEqual([['app:setBackgroundMaterial', 'acrylic']]);
    // Natywne obramowanie okna idzie za kolorem ramki motywu.
    expect(invoke.mock.calls).toContainEqual([
      'window:setBorderColor',
      resolveThemeAppearance({ ...DEFAULT_APPEARANCE, glassAlpha: 70 }).colors.base300
    ]);

    appearance.value.glassAlpha = 35;
    await flushThemeFrame();
    expect(materialCalls()).toHaveLength(1);

    appearance.value.glassAlpha = 100;
    await flushThemeFrame();
    expect(materialCalls()).toEqual([
      ['app:setBackgroundMaterial', 'acrylic'],
      ['app:setBackgroundMaterial', 'auto']
    ]);
  });

  it('asks for square window corners at radiusBox 0 and rounded above it', async () => {
    const appearance = ref<AppearanceSettings>({
      ...DEFAULT_APPEARANCE,
      glassAlpha: 100,
      geometry: { radiusBox: 0 }
    });
    const invoke = vi.fn().mockResolvedValue(true);
    window.api.invoke = invoke as typeof window.api.invoke;
    const theme = useTheme(appearance);
    const cornerCalls = () =>
      invoke.mock.calls.filter(([channel]) => channel === 'window:setRoundedCorners');

    theme.applyTheme();
    expect(cornerCalls()).toEqual([['window:setRoundedCorners', false]]);
    // Nieprzezroczyste okno: natywna krawędź ma kolor tła (znika).
    expect(invoke.mock.calls).toContainEqual([
      'window:setBorderColor',
      resolveThemeAppearance({ ...DEFAULT_APPEARANCE, glassAlpha: 100 }).colors.base200
    ]);

    appearance.value.geometry = { ...appearance.value.geometry, radiusBox: 10 };
    await flushThemeFrame();
    expect(cornerCalls()).toEqual([
      ['window:setRoundedCorners', false],
      ['window:setRoundedCorners', true]
    ]);
  });

  it('repaints once when a theme import changes several fields at once', async () => {
    const appearance = ref<AppearanceSettings>({
      ...DEFAULT_APPEARANCE,
      theme: 'midnight',
      customBase: 'dark',
      customColors: { accent: '#ff0000' } as never,
      glassAlpha: 60
    });
    const invoke = vi.fn().mockResolvedValue(true);
    // pushToPip używa send(), applyWindowMode używa invoke() — oba są efektami ubocznymi
    // na przemalowanie, więc oba trzeba zliczać.
    const send = vi.fn();
    window.api.invoke = invoke as typeof window.api.invoke;
    window.api.send = send as typeof window.api.send;
    const theme = useTheme(appearance);

    theme.applyTheme();
    const sendBaseline = send.mock.calls.length;

    // Pojedynczy import dotyka każdego obserwowanego pola; stare watchery per pole
    // wywoływały applyTheme() raz na pole, więc to przemalowywało cztery razy i wysyłało
    // cztery rundy wiadomości pip w tym samym ticku.
    appearance.value.customBase = 'light';
    appearance.value.fontSize = 15;
    appearance.value.glassAlpha = 90;
    await flushThemeFrame();

    const pipThemeSends = send.mock.calls
      .slice(sendBaseline)
      .filter((c) => c[0] === 'audio-pip:theme' || c[0] === 'pip:theme');
    expect(pipThemeSends).toHaveLength(2); // audio-pip + pip, po jednym malowaniu każde
    expect(send.mock.calls.length - sendBaseline).toBe(3); // + jedna locale
  });

  it('pushes the glass blur to the PiP windows with the rest of the theme', async () => {
    const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE, glassBlur: 20 });
    const send = vi.fn();
    window.api.send = send as typeof window.api.send;
    const theme = useTheme(appearance);

    theme.applyTheme();

    const pipVars = send.mock.calls
      .filter((c) => c[0] === 'audio-pip:theme' || c[0] === 'pip:theme')
      .map((c) => c[1] as Record<string, string>);
    expect(pipVars).toHaveLength(2);
    for (const vars of pipVars) expect(vars['--glass-blur']).toBe('20px');
  });
});

describe('useTheme accessibility, previews and system theme', () => {
  afterEach(() => {
    window.api.invoke = originalInvoke;
    window.api.send = originalSend;
    vi.clearAllMocks();
  });

  it('applies the locale, motion preference and preview variables', async () => {
    const appearance = ref<AppearanceSettings>({
      ...DEFAULT_APPEARANCE,
      locale: 'pl',
      animations: false
    });
    const theme = useTheme(appearance);

    theme.applyTheme();
    expect(document.documentElement.lang).toBe('pl');
    expect(document.documentElement.classList.contains('no-animations')).toBe(true);

    appearance.value.locale = 'auto';
    theme.applyTheme();
    expect(document.documentElement.lang).toBe(navigator.language || 'en');

    theme.applyPreviewVars({ '--preview': '1' });
    theme.applyPreviewVars({ '--preview': '2' });
    await flushThemeFrame();

    expect(document.documentElement.style.getPropertyValue('--preview')).toBe('2');
    theme.dispose();
  });

  it('falls back to English when the browser exposes no language', () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
    Object.defineProperty(navigator, 'language', { configurable: true, value: '' });
    try {
      const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE, locale: 'auto' });
      useTheme(appearance).applyTheme();
      expect(document.documentElement.lang).toBe('en');
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'language', descriptor);
    }
  });

  it('defaults glass and radius when the settings omit them', () => {
    const invoke = vi.fn().mockResolvedValue(true);
    window.api.invoke = invoke as typeof window.api.invoke;
    const appearance = ref<AppearanceSettings>({
      ...DEFAULT_APPEARANCE,
      glassAlpha: undefined,
      geometry: {} as never
    });

    useTheme(appearance).applyTheme();

    expect(invoke.mock.calls).toContainEqual(['app:setBackgroundMaterial', 'auto']);
    expect(invoke.mock.calls).toContainEqual(['window:setRoundedCorners', true]);
  });

  it('listens to the OS color scheme only while the system theme is active', async () => {
    const listeners = new Set<() => void>();
    const mediaQuery = {
      addEventListener: vi.fn((_event: string, fn: () => void) => listeners.add(fn)),
      removeEventListener: vi.fn((_event: string, fn: () => void) => listeners.delete(fn))
    };
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => mediaQuery)
    });

    try {
      const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE, theme: 'system' });
      const theme = useTheme(appearance);
      theme.applyTheme();

      expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      const onChange = [...listeners][0]!;
      onChange();
      await flushThemeFrame();

      appearance.value.theme = 'midnight';
      await flushThemeFrame();
      expect(mediaQuery.removeEventListener).toHaveBeenCalled();

      theme.dispose();
      theme.dispose();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia
      });
    }
  });

  it('does not install a listener when matchMedia is unavailable', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
    try {
      const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE, theme: 'system' });
      expect(() => useTheme(appearance).applyTheme()).not.toThrow();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: originalMatchMedia
      });
    }
  });

  it('shares a single theme engine instance', async () => {
    vi.resetModules();
    const mod = await import('../useTheme');
    const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE });

    expect(mod.getThemeEngine(appearance)).toBe(mod.getThemeEngine(appearance));
  });

  it('coalesces rapid repaints into one animation frame', async () => {
    const send = vi.fn();
    window.api.send = send as typeof window.api.send;
    const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE, fontSize: 13 });
    const theme = useTheme(appearance);

    theme.reapplyTheme();
    theme.reapplyTheme();
    await flushThemeFrame();

    expect(send.mock.calls.filter((c) => c[0] === 'audio-pip:theme')).toHaveLength(1);
  });
});
