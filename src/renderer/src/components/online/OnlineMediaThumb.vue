<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Play, Download, Check, RefreshCw, Radio, Bookmark } from '@lucide/vue';
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
    /** Tiny YT/SC corner tag — used on merged (multi-platform) result grids. */
    platformTag?: string;
  }>(),
  { layout: 'card', state: null }
);

const emit = defineEmits<{
  play: [video: Media];
  expand: [video: Media];
  queue: [video: Media];
}>();

const saved = useSavedStore();
const ui = useUIStore();
const { t } = useI18n();

// SoundCloud items have no YouTube embed — the bookmark (saved-streams is
// YT-only) and the embed-expansion are hidden for them.
const isSc = computed(
  () => detectPlatform((props.video as YouTubeVideo).url || '')?.platform === 'soundcloud'
);
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

function onPlay(e: MouseEvent) {
  e.stopPropagation();
  logger.info('yt', `playStream click video=${props.video.id}`);
  emit('play', props.video);
}

function onExpand(e?: MouseEvent) {
  e?.stopPropagation();
  if (!isPlayable.value || isSc.value) return;
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

    <!-- Downloaded badge -->
    <div
      v-if="downloaded && coverStatus !== 'fetching'"
      class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-field bg-success text-success-content text-[10px] font-medium"
    >
      <Check :size="10" />
    </div>

    <!-- Platform tag (merged multi-platform grids) -->
    <span
      v-if="platformTag"
      class="absolute top-1.5 right-1.5 px-1 py-0.5 rounded-field bg-neutral/70 text-[9px] font-bold pointer-events-none"
      :class="platformTag === 'SC' ? 'text-warning' : 'text-error'"
    >
      {{ platformTag }}
    </span>

    <!-- Cover fetching badge -->
    <div
      v-if="coverStatus === 'fetching'"
      class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-field bg-warning text-warning-content text-[10px] font-medium"
    >
      <RefreshCw :size="10" class="animate-spin" />
    </div>

    <!-- Duration badge -->
    <div
      v-if="video.duration"
      class="absolute bottom-1.5 right-1.5 bg-neutral/80 text-neutral-content text-[10px] px-1.5 py-0.5 rounded-field"
    >
      {{ video.duration }}
    </div>

    <!-- Center actions: stream and embed-on-YouTube side by side -->
    <div
      class="absolute inset-0 z-10 flex items-center justify-center bg-neutral/0 group-hover:bg-neutral/30 transition-colors select-none pointer-events-none"
      :class="isPlayable ? '' : 'opacity-50'"
    >
      <div
        v-if="isPlayable"
        class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-3 pointer-events-none group-hover:pointer-events-auto"
      >
        <button
          type="button"
          :title="$t('youtube.playStream')"
          class="flex items-center justify-center text-base-content hover:scale-115 active:scale-95 shadow-black/30 transition-all duration-150 cursor-pointer"
          @click.stop="onPlay"
        >
          <Radio :size="30" />
        </button>
        <div v-if="!isSc" class="w-px h-16 bg-neutral-content py-5"></div>
        <button
          v-if="!isSc"
          type="button"
          :title="$t('youtube.playOnYoutube')"
          class="flex items-center justify-center text-base-content hover:scale-115 active:scale-95 shadow-black/30 transition-all duration-150 cursor-pointer"
          @click.stop="onExpand"
        >
          <Play :size="30" fill="currentColor" />
        </button>
      </div>
    </div>

    <!-- Download action overlay (card only; hidden for contexts like the
         Webcast playlist where save/download are redundant) -->
    <div
      v-if="layout !== 'list' && !hideQuickActions"
      class="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center gap-1 pointer-events-none group-hover:pointer-events-auto"
    >
      <OnlineIconButton
        :title="isSaved ? $t('saved.removeTrack') : $t('saved.saveTrack')"
        variant="default"
        size="sm"
        @click.stop="onToggleSave"
      >
        <Bookmark :size="11" :fill="isSaved ? 'currentColor' : 'none'" />
      </OnlineIconButton>
      <OnlineIconButton
        :disabled="state !== null"
        :title="$t('youtube.addToQueue')"
        variant="primary"
        size="sm"
        @click="onQueue"
      >
        <RefreshCw
          v-if="state === 'queuing' || state === 'downloading'"
          :size="11"
          class="animate-spin"
        />
        <Check v-else-if="state === 'done'" :size="11" />
        <Download v-else :size="11" />
      </OnlineIconButton>
    </div>
  </div>
</template>
