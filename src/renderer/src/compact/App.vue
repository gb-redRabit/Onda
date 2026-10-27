<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
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
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import MediaCover from '@renderer/components/MediaCover.vue';
import CompactTracks from './CompactTracks.vue';
import CompactQueue from './CompactQueue.vue';
import CompactAlbums from './CompactAlbums.vue';

const { t } = useI18n();
useCoreSync();
useMediaSession();
const player = usePlayerStore();
const audio = useAudioPlayer();

type Tab = 'tracks' | 'queue' | 'albums';
const tab = ref<Tab>('tracks');
const pinned = ref(false);

function setTab(id: string): void {
  if (id === 'tracks' || id === 'queue' || id === 'albums') tab.value = id;
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
  pinned.value = !pinned.value;
  await window.api?.invoke('window:setAlwaysOnTop', pinned.value);
}

function closeWindow(): void {
  void window.api?.invoke('window:close');
}

const repeatLabel = computed(() =>
  player.repeat === 'one'
    ? t('compact.repeatOne')
    : player.repeat === 'all'
      ? t('compact.repeatAll')
      : t('compact.repeat')
);
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
      <span class="text-[10px] text-base-content/40 truncate">{{ $t('compact.focusMode') }}</span>
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
        class="grid place-items-center w-6 h-6 rounded-field text-base-content/60 hover:text-error hover:bg-error/10"
        :title="$t('compact.close')"
        :aria-label="$t('compact.close')"
        data-testid="compact-close"
        @click="closeWindow"
      >
        <X :size="14" />
      </button>
    </header>

    <section class="px-3 pt-3 pb-2 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-16 h-16 rounded-lg overflow-hidden bg-base-300 shrink-0">
          <MediaCover :path="current?.path" :size="64" />
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-sm font-semibold truncate" data-testid="compact-title">{{ title }}</h1>
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
        v-for="item in [
          { id: 'tracks', label: $t('compact.tracks'), icon: Music2 },
          { id: 'queue', label: $t('compact.queue'), icon: ListMusic },
          { id: 'albums', label: $t('compact.albums'), icon: Disc3 }
        ]"
        :key="item.id"
        class="compact-tab flex items-center gap-1.5 px-2.5 h-8 rounded-field text-[12px] transition-colors"
        :class="
          tab === item.id
            ? 'bg-primary/15 text-primary-text font-medium'
            : 'text-base-content/60 hover:text-base-content hover:bg-base-content/5'
        "
        role="tab"
        :aria-selected="tab === item.id"
        :data-testid="`compact-tab-${item.id}`"
        @click="setTab(item.id)"
      >
        <component :is="item.icon" :size="13" />
        {{ item.label }}
      </button>
    </nav>

    <main class="flex-1 min-h-0">
      <CompactTracks v-if="tab === 'tracks'" />
      <CompactQueue v-else-if="tab === 'queue'" />
      <CompactAlbums v-else />
    </main>
  </div>
</template>
