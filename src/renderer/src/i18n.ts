import { createI18n } from 'vue-i18n';
import pl from './locales/pl';
import en from './locales/en';

export const i18n = createI18n({
  legacy: false,
  locale: 'pl',
  fallbackLocale: 'en',
  messages: { pl, en }
});
