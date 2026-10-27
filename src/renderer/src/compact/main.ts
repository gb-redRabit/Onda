import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia, storeToRefs } from 'pinia';
import App from './App.vue';
import '../assets/main.css';
import './style.css';
import { i18n, initI18n, loadLocaleMessages } from '@renderer/i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { useLibraryStore } from '@renderer/stores/library';
import { getThemeEngine } from '@renderer/composables/useTheme';
import { ensureMediaServerUrl } from '@renderer/utils/mediaUrl';
import { setCoreShellMode } from '@renderer/utils/runtimeMode';
import { logger } from '@shared/logger';

// Compact jest shellem: nie ma własnego AudioContext, tylko odbija Core.
setCoreShellMode(true);

const pinia = createPinia();
setActivePinia(pinia);

const app = createApp(App);
app.use(pinia);
app.use(i18n);
app.config.errorHandler = (error, _instance, info) => {
  logger.error('compact', `renderer error: ${String(error)}`, info);
};

async function boot(): Promise<void> {
  const settings = useSettingsStore();
  const { appearance } = storeToRefs(settings);
  const theme = getThemeEngine(appearance);

  try {
    await Promise.all([initI18n(), settings.load(), ensureMediaServerUrl()]);
    await loadLocaleMessages(settings.appearance.locale);
    await theme.applyTheme();
  } catch (error) {
    logger.warn('compact', 'boot with defaults', error);
  }

  app.mount('#app');

  // Splash czeka na pierwsze malowanie (jak pełny shell).
  await nextTick();
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  void window.api?.invoke('app:rendererReady').catch(() => {
    /* splash ma watchdog */
  });

  // Audio-only: compact nie potrzebuje wideo ani obrazów w pamięci.
  const library = useLibraryStore();
  void library.loadFromDisk({ audioOnly: true });
  window.addEventListener('beforeunload', () => theme.dispose(), { once: true });
}

void boot();
