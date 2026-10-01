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

function reportError(err: unknown, info: string): void {
  logger.error('Error', `${err}`, info);
  try {
    const ui = useUIStore();
    ui.notify('error', i18n.global.t('app.error'), (err as Error).message || String(err));
  } catch {
    // UI store may not be ready
  }
}

app.config.errorHandler = (err, _instance, info) => {
  reportError(err, info);
};

// IPC invokes now reject (instead of resolving to `undefined`), so any caller
// that did not wrap the await would otherwise fail silently. Surface it — but
// throttle repeats so a periodic fire-and-forget call cannot spam toasts.
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
    // UI store may not be ready
  }
});

// Each view is its own chunk; warm the two most visited ones while the app is
// idle so the first navigation is instant instead of showing the loader.
function prefetchLikelyRoutes(): void {
  const warm = (): void => {
    void import('@renderer/views/LibraryView.vue').catch(() => {});
    void import('@renderer/views/OnlineView.vue').catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm, { timeout: 4000 });
  } else {
    setTimeout(warm, 2500);
  }
}

async function bootstrap(): Promise<void> {
  // Locale + module init run in parallel with the settings IPC round-trip (the
  // store also reads it back from App.vue only if it is not loaded yet), so
  // neither is on the first-paint critical path.
  await Promise.all([initI18n(), moduleManager.initAll(), useSettingsStore().load()]);
  app.mount('#app');
  usePluginsHooks();
  void usePluginsStore().load();
  prefetchLikelyRoutes();
}

void bootstrap();
