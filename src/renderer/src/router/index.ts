import { createRouter, createWebHashHistory } from 'vue-router';
import { moduleManager } from '@renderer/modules/ModuleManager';
import { usePlayerStore } from '@renderer/stores/player';

const ROUTE_MODULE_MAP: Record<string, string> = {
  home: 'home',
  player: 'player',
  audio: 'player',
  explorer: 'explorer',
  library: 'library',
  youtube: 'youtube',
  downloads: 'youtube',
  settings: 'settings',
  search: 'home'
};

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@renderer/views/HomeView.vue'),
      meta: { title: 'Home', icon: 'home' }
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('@renderer/views/LibraryView.vue'),
      meta: { title: 'Library', icon: 'library' }
    },
    {
      path: '/explorer',
      name: 'explorer',
      component: () => import('@renderer/views/ExplorerView.vue'),
      meta: { title: 'Explorer', icon: 'folder-open' }
    },
    {
      path: '/youtube',
      name: 'youtube',
      component: () => import('@renderer/views/YouTubeView.vue'),
      meta: { title: 'YouTube', icon: 'youtube' }
    },
    {
      path: '/downloads',
      name: 'downloads',
      component: () => import('@renderer/views/DownloadsView.vue'),
      meta: { title: 'Downloads', icon: 'download' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@renderer/views/SettingsView.vue'),
      meta: { title: 'Settings', icon: 'settings' }
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@renderer/views/SearchView.vue'),
      meta: { title: 'Search', icon: 'search' }
    },
    {
      path: '/player',
      name: 'player',
      component: () => import('@renderer/views/PlayerView.vue'),
      meta: { title: 'Player', icon: 'play' }
    },
    {
      path: '/audio',
      name: 'audio',
      component: () => import('@renderer/views/AudioView.vue'),
      meta: { title: 'Audio', icon: 'music' }
    }
  ]
});

router.afterEach((to) => {
  const routeName = to.name as string;
  const moduleId = ROUTE_MODULE_MAP[routeName];
  if (!moduleId) return;

  const currentActive = moduleManager.getActiveId();

  if (currentActive === 'player' && moduleId !== 'player') {
    const player = usePlayerStore();
    if (player.currentTrack?.type === 'audio') {
      const target = moduleManager.get(moduleId);
      if (!target.isActive()) {
        target.activate();
      }
      return;
    }
  }

  moduleManager.switchTo(moduleId);
});

export default router;
