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

// Static map keeps the imports analyzable for Vite (code-splits each locale).
const localeLoaders: Record<Locale, () => Promise<LocaleModule>> = {
  pl: () => import('./locales/pl'),
  en: () => import('./locales/en')
};

const initialLocale = detectLocale();
const initialMessages = await localeLoaders[initialLocale]();

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: { [initialLocale]: initialMessages.default }
});

export async function loadLocaleMessages(loc: string): Promise<void> {
  const current = i18n.global.getLocaleMessage(loc);
  if (current && Object.keys(current).length) {
    i18n.global.locale.value = loc;
    return;
  }
  const mod = await localeLoaders[loc as Locale]();
  i18n.global.setLocaleMessage(loc, mod.default);
  i18n.global.locale.value = loc;
}