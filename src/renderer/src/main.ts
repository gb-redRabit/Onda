import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import router from './router';
import App from './App.vue';
import './assets/main.css';
import { i18n } from './i18n';
import { useUIStore } from './stores/ui';
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

app.config.errorHandler = (err, _instance, info) => {
  logger.error('Error', `${err}`, info);
  try {
    const ui = useUIStore();
    ui.notify('error', i18n.global.t('app.error'), (err as Error).message || String(err));
  } catch {
    // UI store may not be ready
  }
};

moduleManager.initAll().then(() => {
  app.mount('#app');
  usePluginsHooks();
  void usePluginsStore().load();
});
