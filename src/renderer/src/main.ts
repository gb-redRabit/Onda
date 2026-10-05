import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import router from './router';
import App from './App.vue';
import './assets/main.css';
import { i18n, initI18n } from './i18n';
import { useUIStore } from './stores/ui';
import { useSettingsStore } from './stores/settings';
import { usePluginsStore } from './stores/plugins';
import { usePluginsHooks } from './composables/usePluginsHooks';
import { ensureMediaServerUrl } from './utils/imageLoader';
import { vActivate } from './utils/activateDirective';
import { logger } from '@shared/logger';

import { moduleManager } from './modules/ModuleManager';
import { PlayerModule } from './modules/PlayerModule';
import { ExplorerModule } from './modules/ExplorerModule';
import { LibraryModule } from './modules/LibraryModule';
import { OnlineModule } from './modules/OnlineModule';
import { HomeModule } from './modules/HomeModule';
import { SettingsModule } from './modules/SettingsModule';
import { SourcesModule } from './modules/SourcesModule';

moduleManager.register(new PlayerModule());
moduleManager.register(new ExplorerModule());
moduleManager.register(new LibraryModule());
moduleManager.register(new OnlineModule());
moduleManager.register(new HomeModule());
moduleManager.register(new SettingsModule());
moduleManager.register(new SourcesModule());

const app = createApp(App);
const pinia = createPinia();
setActivePinia(pinia);

app.use(pinia);
app.use(router);
app.use(i18n);
app.directive('activate', vActivate);

function reportError(err: unknown, info: string): void {
  logger.error('Error', `${err}`, info);
  try {
    const ui = useUIStore();
    ui.notify('error', i18n.global.t('app.error'), (err as Error).message || String(err));
  } catch {
    // Store UI może nie być gotowy
  }
}

app.config.errorHandler = (err, _instance, info) => {
  reportError(err, info);
};

// Wywołania IPC teraz odrzucają (zamiast rozwiązywać się do `undefined`), więc każdy wywołujący,
// który nie opakował await, w przeciwnym razie zawiódłby po cichu. Ujawnij to — ale
// dław powtórzenia, żeby okresowe fire-and-forget nie spamowało toastami.
const reportedRejections = new Map<string, number>();
const REJECTION_TOAST_THROTTLE_MS = 10_000;
window.addEventListener('unhandledrejection', (event) => {
  const message = (event.reason as Error)?.message || String(event.reason);
  logger.error('Error', `unhandledrejection: ${message}`);
  const now = Date.now();
  if (now - (reportedRejections.get(message) ?? 0) < REJECTION_TOAST_THROTTLE_MS) return;
  reportedRejections.set(message, now);
  try {
    useUIStore().notify('error', i18n.global.t('app.error'), message);
  } catch {
    // Store UI może nie być gotowy
  }
});

// Każdy widok to własny chunk; rozgrzej dwa najczęściej odwiedzane, gdy aplikacja jest
// bezczynna, żeby pierwsza nawigacja była natychmiastowa zamiast pokazywać loader.
function prefetchLikelyRoutes(): void {
  const warm = (): void => {
    // Prefetch nie jest krytyczny, ale cicha porażka wczytywania chunka była
    // niewidoczna — logujemy, gdy się nie powiedzie.
    void import('@renderer/views/LibraryView.vue').catch((e) =>
      logger.warn('app', 'LibraryView prefetch failed', e)
    );
    void import('@renderer/views/OnlineView.vue').catch((e) =>
      logger.warn('app', 'OnlineView prefetch failed', e)
    );
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 4000 });
  } else {
    setTimeout(warm, 2500);
  }
}

let mounted = false;

async function bootstrap(): Promise<void> {
  // Inicjalizacja locale + modułów biegnie równolegle z rundą IPC ustawień (store
  // też odczytuje je z App.vue tylko jeśli jeszcze nie jest wczytany), więc
  // żadne z nich nie jest na ścieżce krytycznej pierwszego malowania.
  // Bazowy URL serwera mediów (z tokenem) musi być znany, zanim zamontujemy UI —
  // odtwarzacz/okładki budują z niego URL-e synchronicznie.
  await Promise.all([
    initI18n(),
    moduleManager.initAll(),
    useSettingsStore().load(),
    ensureMediaServerUrl()
  ]);
  app.mount('#app');
  mounted = true;
  usePluginsHooks();
  void usePluginsStore().load();
  prefetchLikelyRoutes();
}

// Odrzucenie przed `app.mount` (np. dynamiczny import locale albo init modułu)
// zostawiało biały renderer aż do 30-sekundowego watchdoga main. W takim wypadku
// montujemy aplikację z domyślnymi ustawieniami, zamiast nic nie robić.
void bootstrap().catch((e) => {
  reportError(e, 'bootstrap failed; mounting with defaults');
  if (!mounted) {
    try {
      app.mount('#app');
      mounted = true;
    } catch {
      /* best-effort */
    }
  }
});
