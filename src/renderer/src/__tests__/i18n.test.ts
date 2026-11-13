import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Renderer i18n bootstrap: locale detection, lazy message loading and system fallback.

const originalLanguage = navigator.language;

function setLanguage(value: string): void {
  Object.defineProperty(navigator, 'language', { configurable: true, value });
}

async function load() {
  vi.resetModules();
  return import('../i18n');
}

beforeEach(() => {
  localStorage.clear();
  setLanguage('en-US');
});

afterEach(() => {
  setLanguage(originalLanguage);
  vi.restoreAllMocks();
});

describe('detectLocale', () => {
  it('prefers a saved locale', async () => {
    localStorage.setItem('onda-locale', 'pl');
    const { i18n } = await load();

    expect(i18n.global.locale.value).toBe('pl');
  });

  it('ignores invalid saved values and follows the system language', async () => {
    localStorage.setItem('onda-locale', 'de');
    setLanguage('pl-PL');
    const { i18n } = await load();

    expect(i18n.global.locale.value).toBe('pl');
  });

  it('falls back to English for other systems', async () => {
    setLanguage('fr-FR');
    const { i18n } = await load();

    expect(i18n.global.locale.value).toBe('en');
  });

  it('falls back to English when the system exposes no language', async () => {
    setLanguage('');
    const { i18n, resolveLocale } = await load();

    expect(i18n.global.locale.value).toBe('en');
    expect(resolveLocale('auto')).toBe('en');
  });

  it('survives a localStorage failure', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    setLanguage('pl');
    const { i18n } = await load();

    expect(i18n.global.locale.value).toBe('pl');
  });
});

describe('resolveLocale', () => {
  it('returns explicit locales unchanged', async () => {
    const { resolveLocale } = await load();

    expect(resolveLocale('pl')).toBe('pl');
    expect(resolveLocale('en')).toBe('en');
  });

  it('resolves auto and unknown values from the system language', async () => {
    const { resolveLocale } = await load();

    expect(resolveLocale('auto')).toBe('en');
    setLanguage('pl-PL');
    expect(resolveLocale('auto')).toBe('pl');
  });
});

describe('loadLocaleMessages', () => {
  it('loads messages for a locale and switches to it', async () => {
    const { i18n, loadLocaleMessages } = await load();

    await loadLocaleMessages('pl');

    expect(i18n.global.locale.value).toBe('pl');
    expect(Object.keys(i18n.global.getLocaleMessage('pl')).length).toBeGreaterThan(0);
  });

  it('reuses already loaded messages', async () => {
    const { i18n, loadLocaleMessages } = await load();
    await loadLocaleMessages('en');
    const messages = i18n.global.getLocaleMessage('en');

    await loadLocaleMessages('en');

    expect(i18n.global.getLocaleMessage('en')).toBe(messages);
  });

  it('initialises the detected locale', async () => {
    localStorage.setItem('onda-locale', 'pl');
    const { i18n, initI18n } = await load();

    await initI18n();

    expect(i18n.global.locale.value).toBe('pl');
  });
});
