<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import {
  AlertCircle,
  AppWindow,
  Disc3,
  ListMusic,
  Music2,
  Pause,
  Pin,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  X
} from '@lucide/vue';
import { useCoreSync } from '@renderer/composables/useCoreSync';
import { useMediaSession } from '@renderer/composables/useMediaSession';
import { useSessionPersistence } from '@renderer/composables/useSessionPersistence';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { useAudioPiP } from '@renderer/composables/useAudioPiP';
import { registerMediaIpcEvents } from '@renderer/composables/appIpc/registerMediaIpcEvents';
import { usePlayerStore } from '@renderer/stores/player';
import { useSettingsStore } from '@renderer/stores/settings';
import { loadLocaleMessages } from '@renderer/i18n';
import type { AppearanceSettings } from '@renderer/types/settings';
import MediaCover from '@renderer/components/MediaCover.vue';
import CompactTracks from './CompactTracks.vue';
import CompactQueue from './CompactQueue.vue';
import CompactAlbums from './CompactAlbums.vue';

const { t } = useI18n();
useCoreSync();
const mediaSession = useMediaSession();
useSessionPersistence();
const player = usePlayerStore();
const settings = useSettingsStore();
const { appearance } = storeToRefs(settings);
registerMediaIpcEvents(player);
const audio = useAudioPlayer();
const audioPip = useAudioPiP();
audioPip.dock.value = settings.appearance.audioPipDock;
audioPip.setAutoShow(settings.appearance.audioPipAutoShow);

type Tab = 'tracks' | 'queue' | 'albums';
const tab = ref<Tab>('tracks');
const pinned = ref(false);
const tracksRef = ref<InstanceType<typeof CompactTracks> | null>(null);
let stopCompactHidden: (() => void) | undefined;
let stopCompactShown: (() => void) | undefined;
let stopAppearance: (() => void) | undefined;

function setTab(id: string): void {
  if (id === 'tracks' || id === 'queue' || id === 'albums') tab.value = id;
}

const TAB_ORDER: Tab[] = ['tracks', 'queue', 'albums'];

/** Standardowa nawigacja tablist: strzałki, Home/End, roving tabindex. */
function onTabKeydown(event: KeyboardEvent, index: number): void {
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % TAB_ORDER.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = TAB_ORDER.length - 1;
  else return;
  event.preventDefault();
  tab.value = TAB_ORDER[next];
  void nextTick(() => document.getElementById(`compact-tab-${TAB_ORDER[next]}`)?.focus());
}

const current = computed(() => player.currentTrack);
const title = computed(
  () => current.value?.metadata?.title || current.value?.name || t('compact.nothingPlaying')
);
const artist = computed(
  () => current.value?.metadata?.artist || current.value?.metadata?.album || ''
);
const duration = computed(() => audio.duration.value || current.value?.duration || 0);
const progress = computed(() =>
  duration.value > 0 ? Math.min(1, Math.max(0, audio.currentTime.value / duration.value)) : 0
);

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function seekTo(event: MouseEvent): void {
  if (duration.value <= 0) return;
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  audio.seek(ratio * duration.value);
}

function seekBy(seconds: number): void {
  if (duration.value <= 0) return;
  audio.seek(Math.max(0, Math.min(duration.value, audio.currentTime.value + seconds)));
}

function setVolume(event: Event): void {
  player.setVolume(Number((event.target as HTMLInputElement).value));
}

async function togglePin(): Promise<void> {
  const value = !pinned.value;
  pinned.value = value;
  await window.api?.invoke('app:setCompactPinned', value);
}

function hideToTray(): void {
  void window.api?.invoke('app:hideCompact');
}

function openMainWindow(): void {
  void window.api?.invoke('app:setWindowMode', 'main');
}

/**
 * Skróty klawiszowe compactu. Pola formularzy, przyciski i slidery zachowują
 * swoje natywne zachowanie (spacja/strzałki), żeby nie dublować akcji.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true;
  return el.closest('[role="slider"], [role="tab"], a') !== null;
}

async function focusSearch(): Promise<void> {
  if (tab.value !== 'tracks') {
    tab.value = 'tracks';
    await nextTick();
  }
  tracksRef.value?.focusSearch();
}

function onKeydown(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    void focusSearch();
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    hideToTray();
    return;
  }
  if (isInteractiveTarget(event.target)) return;
  if (mod && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    if (event.key === 'ArrowLeft') player.prevTrack();
    else player.nextTrack();
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    player.togglePlay();
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    seekBy(-5);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    seekBy(5);
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  const saved = await window.api?.invoke('app:getCompactPinned');
  if (saved === true) pinned.value = true;
  stopCompactHidden = window.api?.on('compact:hidden', (...args: unknown[]) => {
    const payload = args[0] as { autoPip?: boolean } | undefined;
    if (payload?.autoPip === false) return;
    if (settings.appearance.audioPipAutoShow && audio.isPlaying.value) void audioPip.show();
  });
  stopCompactShown = window.api?.on('compact:shown', () => {
    void audioPip.hide();
  });
  // Motyw zmieniony w pełnym oknie ma natychmiast trafić do compactu — także
  // wtedy, gdy to okno jest ukryte i wróci później (bez restartu/reloadu).
  stopAppearance = window.api?.on('settings:appearance', (...args: unknown[]) => {
    const next = args[0] as AppearanceSettings | undefined;
    if (!next || typeof next !== 'object') return;
    appearance.value = next;
    void loadLocaleMessages(next.locale);
    audioPip.dock.value = next.audioPipDock;
    audioPip.setAutoShow(next.audioPipAutoShow);
  });
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  mediaSession.dispose();
  stopCompactHidden?.();
  stopCompactShown?.();
  stopAppearance?.();
});

const repeatLabel = computed(() =>
  player.repeat === 'one'
    ? t('compact.repeatOne')
    : player.repeat === 'all'
      ? t('compact.repeatAll')
      : t('compact.repeat')
);

const dismissedError = ref<string | null>(null);
const playbackError = computed(() => {
  const error = audio.error.value;
  if (!error || dismissedError.value === error) return null;
  if (error === 'track-failed') return t('compact.trackError');
  if (error === 'stream-failed') return t('compact.streamError');
  return t('compact.playbackError');
});

watch(
  () => audio.error.value,
  (error) => {
    if (!error) dismissedError.value = null;
  }
);

function dismissError(): void {
  dismissedError.value = audio.error.value;
}
</script>

<template>
  <div class="compact-root" data-testid="compact-root">
    <header
      class="compact-titlebar flex items-center gap-2 px-3 h-9 shrink-0 border-b border-base-300/60"
    >
      <span
        class="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-base-content/80"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-primary" />
        {{ $t('compact.appName') }}
      </span>
      <span class="text-[10px] text-base-content/40 truncate hidden min-[400px]:inline">{{
        $t('compact.focusMode')
      }}</span>
      <span class="flex-1" />
      <button
        class="grid place-items-center w-6 h-6 rounded-field text-base-content/60 hover:text-base-content hover:bg-base-content/10"
        :class="pinned ? 'text-primary-text' : ''"
        :title="pinned ? $t('compact.unpin') : $t('compact.pin')"
        :aria-label="pinned ? $t('compact.unpin') : $t('compact.pin')"
        data-testid="compact-pin"
        @click="togglePin"
      >
        <Pin :size="13" />
      </button>
      <button
        class="grid place-items-center w-6 h-6 rounded-field text-base-content/60 hover:text-base-content hover:bg-base-content/10"
        :title="$t('compact.fullWindow')"
        :aria-label="$t('compact.fullWindow')"
        data-testid="compact-expand"
        @click="openMainWindow"
      >
        <AppWindow :size="13" />
      </button>
      <button
        class="grid place-items-center w-6 h-6 rounded-field text-base-content/60 hover:text-error hover:bg-error/10"
        :title="$t('compact.hideToTray')"
        :aria-label="$t('compact.hideToTray')"
        data-testid="compact-close"
        @click="hideToTray"
      >
        <X :size="14" />
      </button>
    </header>

    <div
      v-if="playbackError"
      class="mx-3 mt-2 flex items-center gap-2 px-2.5 py-2 rounded-field border border-error/40 bg-error/10 text-[11px] text-error"
      role="alert"
      data-testid="compact-playback-error"
    >
      <AlertCircle :size="14" class="shrink-0" />
      <span class="min-w-0 flex-1">{{ playbackError }}</span>
      <button
        class="grid place-items-center w-5 h-5 rounded-field hover:bg-error/10 shrink-0"
        :title="$t('compact.dismiss')"
        :aria-label="$t('compact.dismiss')"
        @click="dismissError"
      >
        <X :size="12" />
      </button>
    </div>

    <section class="px-3 pt-3 pb-2 shrink-0">
      <div class="flex items-center gap-3">
        <div
          class="w-16 h-16 rounded-lg overflow-hidden bg-base-300 shrink-0"
          data-testid="compact-cover"
        >
          <MediaCover :path="current?.path" :size="64" autoplay />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-sm font-semibold truncate" data-testid="compact-title" aria-live="polite">
            {{ title }}
          </h1>
          <p class="text-[11px] text-base-content/55 truncate mt-0.5">{{ artist || '—' }}</p>
          <div class="flex items-center gap-1.5 mt-1.5 text-[10px] text-base-content/45">
            <span>{{ formatTime(audio.currentTime.value) }}</span>
            <span>·</span>
            <span>{{ formatTime(duration) }}</span>
            <span v-if="player.repeat !== 'none'" class="ml-1 text-primary-text">
              {{ repeatLabel }}
            </span>
            <span v-if="player.shuffle" class="text-primary-text">{{
              $t('compact.shuffleOn')
            }}</span>
          </div>
        </div>
      </div>

      <div
        class="group relative h-1.5 mt-3 rounded-full bg-base-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        role="slider"
        tabindex="0"
        :aria-label="$t('compact.seek')"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(duration)"
        :aria-valuenow="Math.round(audio.currentTime.value)"
        data-testid="compact-progress"
        @click="seekTo"
        @keydown.left.prevent="seekBy(-5)"
        @keydown.right.prevent="seekBy(5)"
      >
        <div class="h-full rounded-full bg-primary" :style="{ width: `${progress * 100}%` }" />
      </div>

      <div class="flex items-center gap-1.5 mt-3">
        <button
          class="grid place-items-center w-8 h-8 rounded-field text-base-content/65 hover:text-base-content hover:bg-base-content/10"
          :class="player.shuffle ? 'text-primary-text' : ''"
          :title="$t('compact.shuffle')"
          :aria-label="$t('compact.shuffle')"
          :aria-pressed="player.shuffle"
          data-testid="compact-shuffle"
          @click="player.toggleShuffle()"
        >
          <Shuffle :size="14" />
        </button>
        <button
          class="grid place-items-center w-8 h-8 rounded-field text-base-content/70 hover:text-base-content hover:bg-base-content/10"
          :title="$t('compact.previous')"
          :aria-label="$t('compact.previous')"
          data-testid="compact-prev"
          @click="player.prevTrack()"
        >
          <SkipBack :size="15" />
        </button>
        <button
          class="grid place-items-center w-10 h-10 rounded-full bg-primary text-primary-content hover:brightness-110 transition"
          :title="player.isPlaying ? $t('compact.pause') : $t('compact.play')"
          :aria-label="player.isPlaying ? $t('compact.pause') : $t('compact.play')"
          :data-playing="player.isPlaying ? 'true' : 'false'"
          data-testid="compact-play"
          @click="player.togglePlay()"
        >
          <Pause v-if="player.isPlaying" :size="17" />
          <Play v-else :size="17" class="translate-x-[1px]" />
        </button>
        <button
          class="grid place-items-center w-8 h-8 rounded-field text-base-content/70 hover:text-base-content hover:bg-base-content/10"
          :title="$t('compact.next')"
          :aria-label="$t('compact.next')"
          data-testid="compact-next"
          @click="player.nextTrack()"
        >
          <SkipForward :size="15" />
        </button>
        <button
          class="grid place-items-center w-8 h-8 rounded-field text-base-content/65 hover:text-base-content hover:bg-base-content/10"
          :class="player.repeat !== 'none' ? 'text-primary-text' : ''"
          :title="repeatLabel"
          :aria-label="repeatLabel"
          :aria-pressed="player.repeat !== 'none'"
          data-testid="compact-repeat"
          @click="player.cycleRepeat()"
        >
          <Repeat1 v-if="player.repeat === 'one'" :size="14" />
          <Repeat v-else :size="14" />
        </button>
        <span class="flex-1" />
        <Volume2 :size="14" class="text-base-content/45 shrink-0" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="player.volume"
          :aria-label="$t('compact.volume')"
          class="w-20 accent-primary"
          data-testid="compact-volume"
          @input="setVolume"
        />
      </div>
    </section>

    <nav
      class="flex items-center gap-1 px-2 pb-1 shrink-0 border-b border-base-300/60"
      role="tablist"
      :aria-label="$t('compact.tabs')"
    >
      <button
        v-for="(item, index) in [
          { id: 'tracks', label: $t('compact.tracks'), icon: Music2 },
          { id: 'queue', label: $t('compact.queue'), icon: ListMusic },
          { id: 'albums', label: $t('compact.albums'), icon: Disc3 }
        ]"
        :id="`compact-tab-${item.id}`"
        :key="item.id"
        class="compact-tab flex items-center gap-1.5 px-2.5 h-8 rounded-field text-[12px] transition-colors"
        :class="
          tab === item.id
            ? 'bg-primary/15 text-primary-text font-medium'
            : 'text-base-content/60 hover:text-base-content hover:bg-base-content/5'
        "
        role="tab"
        :aria-selected="tab === item.id"
        aria-controls="compact-panel"
        :tabindex="tab === item.id ? 0 : -1"
        :data-testid="`compact-tab-${item.id}`"
        @click="setTab(item.id)"
        @keydown="onTabKeydown($event, index)"
      >
        <component :is="item.icon" :size="13" />
        {{ item.label }}
      </button>
    </nav>

    <main
      id="compact-panel"
      class="flex-1 min-h-0"
      role="tabpanel"
      :aria-labelledby="`compact-tab-${tab}`"
      tabindex="0"
    >
      <CompactTracks v-if="tab === 'tracks'" ref="tracksRef" />
      <CompactQueue v-else-if="tab === 'queue'" />
      <CompactAlbums v-else />
    </main>
  </div>
</template>
