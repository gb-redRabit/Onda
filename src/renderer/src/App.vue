<script setup lang="ts">
import {
  onMounted,
  onBeforeUnmount,
  watch,
  computed,
  defineAsyncComponent,
  ref,
  nextTick
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { i18n, loadLocaleMessages } from './i18n';
import { useSettingsStore } from './stores/settings';
import { usePlayerStore } from './stores/player';
import { useUIStore } from './stores/ui';
import { useLibraryStore } from './stores/library';
import { matchesShortcut, matchesPluginShortcut, navShortcutBindings } from './utils/shortcuts';
import { registerAppIpc } from './composables/useAppIpcEvents';
import { handlePlayerShortcutKeydown } from './composables/playerShortcutHandler';
import { moduleManager } from './modules/ModuleManager';
import { useAudioPiP } from './composables/useAudioPiP';
import { storeToRefs } from 'pinia';
import { usePluginsStore } from './stores/plugins';
import { getThemeEngine } from './composables/useTheme';
import { useNewVideoNotifications } from './composables/useNewVideoNotifications';
import { useUpdaterNotifications } from './composables/useUpdaterNotifications';
import { useMediaSession } from './composables/useMediaSession';
import { useSessionPersistence } from './composables/useSessionPersistence';
import { audioEngine } from './modules/audioEngine';
import { markRendererReady } from './utils/bootMetrics';
import { guardBootStep } from './utils/bootGuard';
import { logger } from '@shared/logger';
import AppMenu from './components/layout/AppMenu.vue';
import DependencyBanner from './components/layout/DependencyBanner.vue';
import Sidebar from './components/layout/Sidebar.vue';
import PlayerBar from './components/layout/PlayerBar.vue';
import StatusBar from './components/layout/StatusBar.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';

const FirstRunWizard = defineAsyncComponent(() => import('./components/FirstRunWizard.vue'));
const QueuePanel = defineAsyncComponent(() => import('./components/player/QueuePanel.vue'));
const Equalizer = defineAsyncComponent(() => import('./components/player/Equalizer.vue'));
const AppSearch = defineAsyncComponent(() => import('./components/layout/AppSearch.vue'));
const ToastNotification = defineAsyncComponent(() => import('./components/ToastNotification.vue'));
const ContextMenu = defineAsyncComponent(() => import('./components/ContextMenu.vue'));

const settings = useSettingsStore();
const player = usePlayerStore();
const ui = useUIStore();
const library = useLibraryStore();
const pluginsStore = usePluginsStore();
const route = useRoute();
const router = useRouter();
const audioPip = useAudioPiP();
useNewVideoNotifications();
useUpdaterNotifications();
useMediaSession();
const session = useSessionPersistence();
const isWinMaximized = ref(false);
const isNarrowLayout = ref(window.innerWidth < 1200);
const glassOn = computed(() => (settings.appearance.glassAlpha ?? 100) < 100);
let offMaximized: (() => void) | null = null;
let unregisterAppIpc: (() => void) | null = null;

function applyNarrowLayout(width: number): void {
  isNarrowLayout.value = width < 1200;
}

// Okna pomocnicze (eksplorator, podgląd zdjęć) ładują ten sam App.vue, ale nie mogą
// renderować chromu głównego okna (menu, pasek boczny, player) — w przeciwnym razie
// pełnoekranowy lightbox zdjęć otaczał się menu aplikacji.
const isStandaloneWindow = computed(
  () => route.name === 'explorer-window' || route.name === 'image-viewer'
);

const mainRef = ref<HTMLElement | null>(null);
// Po zmianie trasy przenieś fokus do treści — inaczej klawiatura i czytnik ekranu
// zostają w menu bocznym po nawigacji (WCAG 2.4.3).
watch(
  () => route.name,
  () => {
    void nextTick(() => mainRef.value?.focus());
  }
);

// Przebudowywane tylko przy zmianie skrótów, nie przy każdym naciśnięciu klawisza.
const NAV_ACTIONS: Record<string, string> = {
  settings: '/settings',
  explorer: '/explorer',
  library: '/library',
  home: '/'
};
const navBindings = computed(() => navShortcutBindings(settings.shortcuts, NAV_ACTIONS));

const { appearance: appearanceRef } = storeToRefs(settings);
const theme = getThemeEngine(appearanceRef);

onMounted(async () => {
  // Stosowane przy każdym zdarzeniu resize (zapis do refa jest O(1), a Vue deduplikuje
  // niezmieniony boolean), żeby wąski układ nigdy nie zostawał w tyle za oknem.
  window.addEventListener('resize', onAppResize);
  document.addEventListener('keydown', onGlobalKeydown);
  document.addEventListener('mousedown', onGlobalMouseDown);
  window.addEventListener('blur', onWindowBlur);
  offMaximized =
    window.api?.on('window:maximized', (val: unknown) => {
      isWinMaximized.value = !!val;
    }) ?? null;
  // Ustawienia mogą już się ładować (uruchomione w main.ts przed mountem). Każdy
  // krok jest chroniony, żeby pojedyncza awaria nie powstrzymała renderera przed
  // osiągnięciem `app:rendererReady` (main trzyma splash do 30-sekundowego watchdoga).
  const onBootStepError = (e: unknown): void =>
    logger.error('App', 'boot step failed — continuing with defaults', e);
  await guardBootStep(async () => {
    if (!settings.isLoaded) await settings.load();
  }, onBootStepError);
  await guardBootStep(() => theme.applyTheme(), onBootStepError);
  await guardBootStep(() => loadLocaleMessages(settings.appearance.locale), onBootStepError);
  // Biblioteka nie może wstrzymywać splashu: odczyt startuje równolegle z resztą
  // bootstrapu, a wynik jest oczekiwany dopiero po zgłoszeniu gotowości (main zamyka
  // splash wcześniej). Czas startu nie rośnie już liniowo z rozmiarem biblioteki.
  const libraryReady = library.loadFromDisk().catch(onBootStepError);
  // Ustawienia → Odtwarzanie → domyślna głośność to głośność, z którą startuje aplikacja.
  await guardBootStep(() => player.setVolume(settings.playback.defaultVolume), onBootStepError);
  await guardBootStep(() => {
    audioPip.dock.value = settings.appearance.audioPipDock;
    audioPip.setAutoShow(settings.appearance.audioPipAutoShow);
  }, onBootStepError);

  // Zgłoś gotowość, gdy tylko powłoka jest wystrojona, zlokalizowana i namalowana —
  // main zamyka wtedy splash i pokazuje okno. Aktywacja modułów, rozgrzewanie audio,
  // przywracanie sesji i kreator pierwszego uruchomienia nie mogą go wstrzymywać.
  await nextTick();
  markRendererReady();
  // Poczekaj na skomponowaną klatkę: okno jest przezroczyste (+ akryl na
  // Windows), więc pokazanie go przed pierwszym malowaniem błyska rozmytym pulpitem.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
  void window.api?.invoke('app:rendererReady').catch(onBootStepError);
  // Czekamy na bibliotekę dopiero teraz — splash i pierwsze malowanie już nie czekają.
  await libraryReady;

  if (!moduleManager.getActive()) {
    await moduleManager.switchTo('home');
  }

  // Utwórz AudioContext z wyprzedzeniem w czasie bezczynności, żeby pierwszego kliknięcia play nie
  // blokował jednorazowy koszt tworzenia kontekstu.
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => audioEngine.warmUp(), { timeout: 2000 });
  } else {
    setTimeout(() => audioEngine.warmUp(), 1000);
  }

  // Przywróć ostatnio odtwarzany utwór + kolejkę (opcjonalnie przez ustawienia).
  if (settings.general.restoreSession) {
    void session.restore(router);
  }

  // Kreator pierwszego uruchomienia (jednorazowo). Można go powtórzyć z Ustawień / wyszukiwania. Flaga
  // żyje teraz w ustawieniach, więc jest objęta eksportem/importem; zmigruj jednorazowo
  // starą wartość localStorage, żeby istniejące profile nie zobaczyły kreatora ponownie.
  try {
    if (!settings.general.firstRunDone && localStorage.getItem('onda-first-run-done')) {
      settings.updateGeneral({ firstRunDone: true });
    }
  } catch {
    /* pamięć niedostępna */
  }
  if (!settings.general.firstRunDone) ui.openSetupWizard();

  unregisterAppIpc = registerAppIpc({ player, router, route });
});

onBeforeUnmount(() => {
  moduleManager.deactivateAll();
  theme.dispose();
  document.removeEventListener('keydown', onGlobalKeydown);
  document.removeEventListener('mousedown', onGlobalMouseDown);
  window.removeEventListener('blur', onWindowBlur);
  window.removeEventListener('resize', onAppResize);
  offMaximized?.();
  unregisterAppIpc?.();
});

// Układ wąski zależy od szerokości okna, więc każdy resize przelicza próg.
function onAppResize(): void {
  applyNarrowLayout(window.innerWidth);
}

watch(
  () => settings.appearance.locale,
  async (loc) => {
    await loadLocaleMessages(loc);
    window.api?.send('pip:locale', loc);
    try {
      localStorage.setItem('onda-locale', loc);
    } catch {
      /* noop */
    }
  }
);

watch(
  () => settings.playback.defaultVolume,
  (volume) => player.setVolume(volume)
);

watch(
  () => player.currentTrack,
  (track) => {
    if (track?.type === 'video' && route.name !== 'player') {
      router.push('/player');
    }
  }
);

function onGlobalKeydown(e: KeyboardEvent) {
  const searchShortcut = settings.shortcuts['search'];
  const viewSearchShortcut = settings.shortcuts['view-search'];
  if (searchShortcut && matchesShortcut(searchShortcut, e)) {
    e.preventDefault();
    if (!document.querySelector('input:focus, textarea:focus')) {
      ui.toggleGlobalSearch();
    }
    return;
  }
  if (viewSearchShortcut && matchesShortcut(viewSearchShortcut, e)) {
    const activeEl = document.activeElement as HTMLElement | null;
    const inInput = !!document.querySelector('input:focus, textarea:focus');
    if (!inInput) {
      e.preventDefault();
      if (['library', 'explorer', 'downloads'].includes(route.name as string)) {
        ui.toggleViewSearch();
      } else {
        // Strona główna / ustawienia nie mają wyszukiwania widoku — powiedz o tym zamiast to połykać.
        ui.notify('info', i18n.global.t('menu.viewSearchUnavailable'));
      }
    } else if (activeEl?.tagName === 'INPUT' && activeEl.closest('[data-app-search]')) {
      e.preventDefault();
      ui.openSearch('view');
    }
    return;
  }
  // Skróty nawigacji (ustawienia / eksplorator / biblioteka / strona główna) — powiązane z
  // ich edytowalnymi wpisami w Ustawienia → Skróty.
  if (!document.body.dataset.shortcutRecording) {
    for (const { shortcut, path } of navBindings.value) {
      if (matchesShortcut(shortcut, e)) {
        if (!document.querySelector('input:focus, textarea:focus')) {
          e.preventDefault();
          router.push(path);
        }
        return;
      }
    }
  }

  if (e.key === 'Escape') {
    ui.hideContextMenu();
    ui.closeSearch();
  }

  // Skróty komend pluginów (registerCommand({ shortcut })).
  if (!document.querySelector('input:focus, textarea:focus')) {
    const normalized = matchesPluginShortcut(e);
    if (normalized && pluginsStore.dispatchShortcut(normalized)) {
      e.preventDefault();
      return;
    }
  }

  // Skróty odtwarzania (widok /player). Nasłuch żyje tutaj — na poziomie aplikacji,
  // zarejestrowany raz — więc klawisze działają niezależnie od montowania/odmontowywania widoków;
  // PlayerView tylko użycza swojego kontekstu akcji przez setPlayerShortcutCtx().
  handlePlayerShortcutKeydown(e);
}

function onGlobalMouseDown(e: MouseEvent) {
  const el = document.getElementById('context-menu');
  if (el && !el.contains(e.target as Node)) {
    ui.hideContextMenu();
  }
}

function onWindowBlur() {
  if (settings.playback.autoPauseOnFocusLoss && player.isPlaying) {
    player.pause();
  }
}
</script>

<template>
  <div
    data-testid="app-root"
    class="app-root relative flex flex-col h-full w-full overflow-hidden border border-base-300 bg-base-200/(--glass-alpha)"
    :class="{ 'is-maximized': isWinMaximized, 'app-root-glass': glassOn }"
  >
    <AppMenu v-if="!isStandaloneWindow" />
    <!-- Ostrzegaj przy każdym uruchomieniu o zależnościach, bez których Onda nie działa.
         Ukryte, gdy kreator jest otwarty (oferuje te same instalacje). -->
    <DependencyBanner v-if="!isStandaloneWindow && !ui.setupWizardVisible" />
    <a
      v-if="!isStandaloneWindow"
      href="#main-content"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-field focus:bg-primary focus:text-primary-content"
      >{{ $t('common.skipToContent') }}</a
    >
    <div class="relative flex flex-1 min-h-0">
      <Sidebar v-if="!isStandaloneWindow && settings.appearance.sidebarPosition === 'left'" />
      <main
        id="main-content"
        ref="mainRef"
        tabindex="-1"
        :data-route="route.name"
        class="flex-1 min-w-0 relative overflow-auto flex flex-col outline-none"
      >
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <ErrorBoundary>
              <component :is="Component" />
            </ErrorBoundary>
          </transition>
        </router-view>
      </main>
      <!-- Jedna instancja między układami: przełączanie między szerokim a wąskim nie może
           jej odmontować, bo pozycja przewinięcia kolejki zostanie utracona. -->
      <QueuePanel
        v-if="!isStandaloneWindow && player.queueVisible"
        :class="
          isNarrowLayout
            ? 'absolute inset-y-0 right-0 z-30 w-80 max-w-[90vw] fx-depth'
            : 'w-75 shrink-0'
        "
      />
      <Sidebar v-if="!isStandaloneWindow && settings.appearance.sidebarPosition === 'right'" />
      <div
        v-if="!isStandaloneWindow && player.equalizerVisible"
        class="fixed bottom-24 right-6 z-40"
      >
        <Equalizer />
      </div>
      <div
        v-if="!isStandaloneWindow && player.queueVisible && isNarrowLayout"
        class="absolute inset-0 z-20 bg-neutral/35"
        @click="player.toggleQueue"
      />
    </div>
    <PlayerBar
      v-if="
        !isStandaloneWindow &&
        (player.currentTrack?.type === 'audio' ||
          player.currentTrack?.type === 'stream' ||
          player.streamPending?.type === 'stream') &&
        route.name !== 'player' &&
        route.name !== 'audio'
      "
    />
    <!-- Widoczność należy do settings.statusBar.visible, które StatusBar odczytuje
         sam. To była druga brama, której nic nigdy nie zmieniało. -->
    <StatusBar v-if="!isStandaloneWindow" />

    <AppSearch />
    <ContextMenu />
    <ToastNotification />
    <FirstRunWizard v-if="ui.setupWizardVisible" @close="ui.closeSetupWizard()" />
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.12s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
