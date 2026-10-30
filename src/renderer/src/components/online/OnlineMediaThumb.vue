<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Play, Download, Check, RefreshCw, Radio, Bookmark, MoreHorizontal } from '@lucide/vue';
import { logger } from '@shared/logger';
import { detectPlatform } from '@shared/platform';
import { useSavedStore } from '@renderer/stores/saved';
import { useUIStore } from '@renderer/stores/ui';
import OnlineIconButton from './OnlineIconButton.vue';
import type { YouTubeVideo, YouTubeResolvedItem } from '@renderer/types/online';

type Media = YouTubeVideo | YouTubeResolvedItem;
type DownloadState = 'queuing' | 'downloading' | 'done' | null;

const props = withDefaults(
  defineProps<{
    video: Media;
    short?: boolean;
    downloaded?: boolean;
    coverStatus?: 'none' | 'fetching' | 'embedded' | 'saved' | 'error' | null;
    state?: DownloadState;
    layout?: 'card' | 'grid' | 'list';
    hideQuickActions?: boolean;
    /** Malutka plakietka narożna YT/SC — używana na scalonych (wieloplatformowych) siatkach wyników. */
    platformTag?: string;
  }>(),
  { layout: 'card', state: null }
);

const emit = defineEmits<{
  play: [video: Media];
  expand: [video: Media];
  queue: [video: Media];
  options: [video: Media];
}>();

const saved = useSavedStore();
const ui = useUIStore();
const { t } = useI18n();

// Elementy SoundCloud nie mają embedu YouTube — zakładka (saved-streams jest
// tylko dla YT) i rozwijanie embedu są dla nich ukryte.
const isSc = computed(
  () => detectPlatform((props.video as YouTubeVideo).url || '')?.platform === 'soundcloud'
);
const isGeneric = computed(() => {
  const url = (props.video as YouTubeVideo).url;
  return !!url && detectPlatform(url) === null;
});
const isPlayable = computed(() => (props.video as YouTubeResolvedItem).isPlayable !== false);
const isSaved = computed(() => saved.isTrackSaved(props.video.id));
void saved.ensureLoaded();

function onToggleSave() {
  void saved.toggleTrack(props.video).then((ok) => {
    if (ok) ui.notify('success', props.video.title, t('saved.trackSaved'));
  });
}

function onQueue(e: MouseEvent) {
  e.stopPropagation();
  emit('queue', props.video);
}

function onOptions(e: MouseEvent) {
  e.stopPropagation();
  emit('options', props.video);
}

function onPlay(e: MouseEvent) {
  e.stopPropagation();
  logger.info('yt', `playStream click video=${props.video.id}`);
  emit('play', props.video);
}

function onExpand(e?: MouseEvent) {
  e?.stopPropagation();
  if (!isPlayable.value || isSc.value || isGeneric.value) return;
  emit('expand', props.video);
}
</script>

<template>
  <div
    class="relative overflow-hidden bg-base-100 shrink-0"
    :class="[
      layout === 'list' ? 'rounded-field w-40' : 'rounded-box w-full',
      short ? 'aspect-9/16' : 'aspect-video'
    ]"
  >
    <img
      v-if="video.thumbnail"
      :src="video.thumbnail"
      :alt="video.title"
      loading="lazy"
      class="absolute inset-0 w-full h-full object-cover"
    />

    <!-- Plakietka pobranego -->
    <div
      v-if="downloaded && coverStatus !== 'fetching'"
      class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-field bg-success text-success-content text-2xs font-medium"
    >
      <Check :size="10" />
    </div>

    <!-- Tag platformy (scalone wieloplatformowe siatki) -->
    <span
      v-if="platformTag"
      class="absolute top-1.5 right-1.5 px-1 py-0.5 rounded-field bg-neutral/70 text-3xs font-bold pointer-events-none"
      :class="platformTag === 'SC' ? 'text-warning' : 'text-error'"
    >
      {{ platformTag }}
    </span>

    <!-- Plakietka pobierania okładki -->
    <div
      v-if="coverStatus === 'fetching'"
      class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-field bg-warning text-warning-content text-2xs font-medium"
    >
      <RefreshCw :size="10" class="animate-spin" />
    </div>

    <!-- Akcje środkowe: strumień i embed na YouTube obok siebie -->
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/30 transition-colors select-none pointer-events-none"
      :class="isPlayable ? '' : 'opacity-50'"
    >
      <div
        v-if="isPlayable"
        class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 flex items-center gap-3 pointer-events-none group-hover:pointer-events-auto"
      >
        <button
          type="button"
          :title="$t('youtube.playStream')"
          class="flex items-center justify-center text-base-content hover:scale-115 active:scale-95 shadow-black/30 transition-all duration-150 cursor-pointer"
          @click.stop="onPlay"
        >
          <Radio :size="30" />
        </button>
        <div v-if="!isSc && !isGeneric" class="w-px h-16 bg-neutral-content py-5"></div>
        <button
          v-if="!isSc && !isGeneric"
          type="button"
          :title="$t('youtube.playOnYoutube')"
          class="flex items-center justify-center text-base-content hover:scale-115 active:scale-95 shadow-black/30 transition-all duration-150 cursor-pointer"
          @click.stop="onExpand"
        >
          <Play :size="30" fill="currentColor" />
        </button>
      </div>
    </div>

    <!-- Nakładka akcji pobierania (tylko karta; ukryta w kontekstach takich jak
         playlista Webcast, gdzie zapis/pobieranie są zbędne) -->
    <div
      v-if="layout !== 'list' && !hideQuickActions"
      class="online-card-actions absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center gap-1 pointer-events-none group-hover:pointer-events-auto"
    >
      <OnlineIconButton
        :title="isSaved ? $t('saved.removeTrack') : $t('saved.saveTrack')"
        variant="default"
        size="sm"
        @click.stop="onToggleSave"
      >
        <Bookmark :size="11" :fill="isSaved ? 'currentColor' : 'none'" />
      </OnlineIconButton>
    </div>

    <!-- Prawy dolny róg: czas trwania, zawsze widoczne „Pobierz” (szybkie dodanie
         do kolejki) i `⋯` z pełną konfiguracją pojawiające się przy najechaniu. -->
    <div class="online-card-actions absolute bottom-1.5 right-1.5 z-20 flex items-center gap-1">
      <div
        v-if="video.duration"
        class="bg-neutral/80 text-neutral-content text-2xs px-1.5 py-0.5 rounded-field"
      >
        {{ video.duration }}
      </div>
      <button
        v-if="layout !== 'list' && !hideQuickActions"
        type="button"
        data-testid="online-quick-queue"
        class="fx-noise inline-flex items-center justify-center rounded-field bg-neutral/80 p-1 text-neutral-content transition-colors hover:bg-primary hover:text-primary-content disabled:opacity-60"
        :disabled="state !== null"
        :title="$t('youtube.addToQueue')"
        :aria-label="$t('youtube.addToQueue')"
        @click.stop="onQueue"
      >
        <RefreshCw
          v-if="state === 'queuing' || state === 'downloading'"
          :size="12"
          class="animate-spin"
        />
        <Check v-else-if="state === 'done'" :size="12" />
        <Download v-else :size="12" />
      </button>
      <button
        v-if="layout !== 'list' && !hideQuickActions"
        type="button"
        class="fx-noise inline-flex items-center justify-center rounded-field bg-neutral/80 p-1 text-neutral-content opacity-0 transition-[opacity,background-color,color] hover:bg-neutral hover:text-base-content group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
        :title="$t('youtube.downloadOptions')"
        :aria-label="$t('youtube.downloadOptions')"
        @click.stop="onOptions"
      >
        <MoreHorizontal :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Przyciski akcji skalują się z oknem, zamiast pozostać stałe w pikselach, więc
   zachowują proporcje na dużych ekranach i nie dominują małych kart. */
.online-card-actions {
  font-size: clamp(11px, 0.6vw + 7px, 16px);
}

.online-card-actions :deep(button) {
  padding: 0.4em;
}

.online-card-actions :deep(svg) {
  width: 1.1em;
  height: 1.1em;
}
</style>
