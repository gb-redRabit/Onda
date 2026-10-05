<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Play, Download, Check, RefreshCw, ExternalLink, SlidersHorizontal } from '@lucide/vue';
import { logger } from '@shared/logger';
import { detectPlatform } from '@shared/platform';
import { buildYouTubeWatchUrl } from '@shared/provider';
import { formatNumber } from '@renderer/utils/formatters';
import { useOnlineStore } from '@renderer/stores/online';
import { observeIntersection } from '@renderer/utils/sharedIntersection';
import { channelPageUrl } from '@renderer/utils/onlineHelpers';
import YtEmbedPlayer from './YtEmbedPlayer.vue';
import OnlineIconButton from './OnlineIconButton.vue';
import OnlineMediaThumb from './OnlineMediaThumb.vue';
import type { YouTubeVideo, YouTubeResolvedItem } from '@renderer/types/online';

type Media = YouTubeVideo | YouTubeResolvedItem;
type DownloadState = 'queuing' | 'downloading' | 'done' | null;

const props = withDefaults(
  defineProps<{
    video: Media;
    short?: boolean;
    expanded?: boolean;
    watchUrl?: string;
    selectable?: boolean;
    selected?: boolean;
    downloaded?: boolean;
    coverStatus?: 'none' | 'fetching' | 'embedded' | 'saved' | 'error' | null;
    state?: DownloadState;
    layout?: 'card' | 'grid' | 'list';
    showChannel?: boolean;
    showDescription?: boolean;
    showViews?: boolean;
    hideQuickActions?: boolean;
    /** Malutka plakietka narożna YT/SC — używana na scalonych (wieloplatformowych) siatkach wyników. */
    platformTag?: string;
  }>(),
  {
    layout: 'card',
    showChannel: true,
    showDescription: false,
    showViews: false,
    state: null
  }
);

const emit = defineEmits<{
  expand: [video: Media];
  collapse: [];
  queue: [video: Media];
  play: [video: Media];
  options: [video: Media];
  toggleSelect: [id: string];
  openWindow: [url: string];
  openChannel: [url: string];
}>();

function defaultWatchUrl(id: string): string {
  return props.watchUrl || buildYouTubeWatchUrl(id);
}

// Elementy SoundCloud nie mają embedu YouTube — zakładka (saved-streams jest
// tylko dla YT) i rozwijanie embedu są dla nich ukryte.
const isSc = computed(
  () => detectPlatform((props.video as YouTubeVideo).url || '')?.platform === 'soundcloud'
);
const isGeneric = computed(() => {
  const url = (props.video as YouTubeVideo).url;
  return !!url && detectPlatform(url) === null;
});
const channelTarget = computed(() => channelPageUrl(props.video));

function onOpenWindow() {
  emit('openWindow', defaultWatchUrl(props.video.id));
}

function onOpenChannel(): void {
  const target = channelTarget.value;
  if (target) emit('openChannel', target);
}

function onQueue(e: MouseEvent) {
  e.stopPropagation();
  emit('queue', props.video);
}

function onOptions(e: MouseEvent) {
  e.stopPropagation();
  emit('options', props.video);
}

function onToggleSelect(e: MouseEvent) {
  e.stopPropagation();
  emit('toggleSelect', props.video.id);
}

// Główna akcja listy: odtwarzanie strumienia dla SC (bez embedu), rozwijanie embedu dla YT.
function onListPlay(e: MouseEvent) {
  e.stopPropagation();
  if (isSc.value || isGeneric.value) {
    logger.info('yt', `playStream click video=${props.video.id}`);
    emit('play', props.video);
    return;
  }
  if (!isPlayable.value) return;
  emit('expand', props.video);
}

const isPlayable = computed(() => (props.video as YouTubeResolvedItem).isPlayable !== false);

const rootEl = ref<HTMLElement | null>(null);
let stopObserve: (() => void) | null = null;
let hoverTimer: number | undefined;

// Prefetchuj URL strumienia (rozwiązywanie yt-dlp + rozgrzewanie proxy), gdy tylko
// karta ma stać się widoczna. Używa współdzielonego obserwatora aplikacji — playlista
// setek kart w przeciwnym razie tworzyłaby jeden IntersectionObserver na kartę.
onMounted(() => {
  if (!isPlayable.value || !rootEl.value) return;
  stopObserve = observeIntersection(
    rootEl.value,
    (isIntersecting) => {
      if (!isIntersecting) return;
      stopObserve?.();
      stopObserve = null;
      // Niewielkie opóźnienie, aby szybkie przewijanie siatki nie uruchamiało
      // wszystkich rozwiązań naraz (prefetchStream też ogranicza żądania w locie).
      setTimeout(() => useOnlineStore().prefetchStream(props.video), 600);
    },
    '300px'
  );
});

// Hover = intencja: prefetch z krótkim debounce, aby szybkie przesunięcie myszą
// nie uruchamiało rozwiązania. prefetchStream deduplikuje per wideo i ogranicza
// żądania w locie, więc powtarzane najechania nic nie kosztują.
function onMouseEnter() {
  if (!isPlayable.value) return;
  window.clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => useOnlineStore().prefetchStream(props.video), 200);
}

onBeforeUnmount(() => {
  window.clearTimeout(hoverTimer);
  stopObserve?.();
});
</script>

<template>
  <div
    ref="rootEl"
    data-testid="online-media-card"
    class="group"
    :class="[
      layout === 'list'
        ? 'flex gap-3 items-center p-2 rounded-box hover:bg-base-content/10 transition-colors'
        : 'rounded-box bg-base-100 border border-base-300 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-base-300',
      { 'cv-card': !expanded }
    ]"
    @mouseenter="onMouseEnter"
  >
    <YtEmbedPlayer
      v-if="expanded && !isSc && !isGeneric"
      :video-id="video.id"
      :title="video.title"
      :channel-title="video.channelTitle"
      :source-url="defaultWatchUrl(video.id)"
      @close="emit('collapse')"
      @open-window="onOpenWindow"
    />

    <template v-else>
      <!-- Checkbox do wielokrotnego wyboru -->
      <button
        v-if="selectable"
        type="button"
        class="fx-noise shrink-0 flex items-center justify-center w-5 h-5 fx-depth rounded-field border transition-colors"
        :aria-label="$t('common.select')"
        :aria-pressed="selected"
        :class="
          selected
            ? 'bg-primary  border border-primary text-primary-content'
            : 'border-base-300 hover:border-primary'
        "
        @click.stop="onToggleSelect"
      >
        <Check v-if="selected" :size="12" />
      </button>

      <!-- Miniatura -->
      <OnlineMediaThumb
        :video="video"
        :layout="layout"
        :short="short"
        :downloaded="downloaded"
        :cover-status="coverStatus"
        :platform-tag="platformTag"
        :hide-quick-actions="hideQuickActions"
        :state="state"
        @play="emit('play', $event)"
        @expand="emit('expand', $event)"
        @queue="emit('queue', $event)"
        @options="emit('options', $event)"
      />

      <!-- Informacje -->
      <div :class="layout === 'list' ? 'flex-1 min-w-0' : 'mt-2'">
        <h3 class="text-sm font-semibold text-base-content line-clamp-2">{{ video.title }}</h3>
        <div class="text-xs text-base-content/70 mt-0.5">
          <button
            v-if="showChannel && channelTarget"
            class="hover:text-primary transition-colors"
            @click.stop="onOpenChannel"
          >
            {{ video.channelTitle }}
          </button>
          <span v-else-if="showChannel">{{ video.channelTitle }}</span>
          <span v-if="showViews && (video as YouTubeVideo).viewCount">
            {{ (video as YouTubeVideo).viewCount ? ' · ' : '' }}
            {{ formatNumber((video as YouTubeVideo).viewCount!) }} {{ $t('youtube.views') }}
          </span>
        </div>
        <p
          v-if="showDescription && (video as YouTubeVideo).description"
          class="text-xs text-base-content/50 mt-1 line-clamp-2"
        >
          {{ (video as YouTubeVideo).description }}
        </p>
      </div>

      <!-- Akcje listy -->
      <div
        v-if="layout === 'list'"
        class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <OnlineIconButton :title="$t('youtube.play')" @click="onListPlay">
          <Play :size="14" />
        </OnlineIconButton>
        <OnlineIconButton
          :disabled="state !== null"
          :title="$t('youtube.addToQueue')"
          @click="onQueue"
        >
          <RefreshCw
            v-if="state === 'queuing' || state === 'downloading'"
            :size="14"
            class="animate-spin"
          />
          <Check v-else-if="state === 'done'" :size="14" />
          <Download v-else :size="14" />
        </OnlineIconButton>
        <OnlineIconButton :title="$t('youtube.downloadOptions')" @click="onOptions">
          <SlidersHorizontal :size="14" />
        </OnlineIconButton>
        <OnlineIconButton :title="$t('youtube.openInWindow')" @click="onOpenWindow">
          <ExternalLink :size="14" />
        </OnlineIconButton>
      </div>
    </template>
  </div>
</template>
