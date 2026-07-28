import { createI18n } from 'vue-i18n';
import pl from './locales/pl';
import en from './locales/en';

function detectLocale(): string {
  const sysLang = navigator.language || '';
  if (sysLang.startsWith('pl')) return 'pl';
  return 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { pl, en }
});
