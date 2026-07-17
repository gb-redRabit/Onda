import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'
import App from './App.vue'
import './assets/main.css'

import { moduleManager } from './modules/ModuleManager'
import { PlayerModule } from './modules/PlayerModule'
import { ExplorerModule } from './modules/ExplorerModule'
import { LibraryModule } from './modules/LibraryModule'
import { YouTubeModule } from './modules/YouTubeModule'
import { HomeModule } from './modules/HomeModule'
import { SettingsModule } from './modules/SettingsModule'

moduleManager.register(new PlayerModule())
moduleManager.register(new ExplorerModule())
moduleManager.register(new LibraryModule())
moduleManager.register(new YouTubeModule())
moduleManager.register(new HomeModule())
moduleManager.register(new SettingsModule())

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)

moduleManager.initAll().then(() => {
  app.mount('#app')
})
