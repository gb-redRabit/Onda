import { createI18n } from 'vue-i18n';

type Locale = 'pl' | 'en';
type LocaleModule = typeof import('./locales/en');

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem('onda-locale');
    if (saved === 'pl' || saved === 'en') return saved;
  } catch {
    /* noop */
  }
  const sysLang = navigator.language || '';
  if (sysLang.startsWith('pl')) return 'pl';
  return 'en';
}

// Resolves a UI locale ('auto' → system language).
export function resolveLocale(loc: string): Locale {
  if (loc === 'pl' || loc === 'en') return loc;
  const sysLang = navigator.language || '';
  return sysLang.startsWith('pl') ? 'pl' : 'en';
}

// Static map keeps the imports analyzable for Vite (code-splits each locale).
const localeLoaders: Record<Locale, () => Promise<LocaleModule>> = {
  pl: () => import('./locales/pl'),
  en: () => import('./locales/en')
};

const initialLocale = detectLocale();

// Created synchronously with empty messages so the renderer module graph never
// blocks on a top-level `await`. The initial locale is loaded by `initI18n()`
// before `app.mount()` (see `main.ts`), which keeps the first paint free of
// missing-key flashes while letting Vue/components evaluate in parallel.
export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {}
});

export async function initI18n(): Promise<void> {
  await loadLocaleMessages(initialLocale);
}

export async function loadLocaleMessages(loc: string): Promise<void> {
  const resolved = resolveLocale(loc);
  const current = i18n.global.getLocaleMessage(resolved);
  if (current && Object.keys(current).length) {
    i18n.global.locale.value = resolved;
    return;
  }
  const mod = await localeLoaders[resolved]();
  i18n.global.setLocaleMessage(resolved, mod.default);
  i18n.global.locale.value = resolved;
}
