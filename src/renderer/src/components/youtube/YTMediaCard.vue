<script setup lang="ts">
import { computed } from 'vue';
import { Play, Download, Check, RefreshCw, ExternalLink, SlidersHorizontal } from '@lucide/vue';
import { formatNumber } from '@renderer/utils/formatters';
import YouTubeEmbedPlayer from './YouTubeEmbedPlayer.vue';
import YTIconButton from './YTIconButton.vue';
import type { YouTubeVideo, YouTubeResolvedItem } from '@renderer/types/youtube';

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
  }>(),
  {
    layout: 'card',
    showChannel: true,
    showDescription: false,
    showViews: false
  }
);

const emit = defineEmits<{
  expand: [video: Media];
  collapse: [];
  queue: [video: Media];
  options: [video: Media];
  toggleSelect: [id: string];
  openWindow: [id: string];
}>();

function defaultWatchUrl(id: string): string {
  return props.watchUrl || `https://www.youtube.com/watch?v=${id}`;
}

function onOpenWindow() {
  emit('openWindow', props.video.id);
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

function onExpand() {
  if ((props.video as YouTubeResolvedItem).isPlayable === false) return;
  emit('expand', props.video);
}

const isPlayable = computed(() => (props.video as YouTubeResolvedItem).isPlayable !== false);
</script>

<template>
  <div
    class="group"
    :class="
      layout === 'list'
        ? 'flex gap-3 items-center p-2 rounded-xl hover:bg-bg-hover transition-colors'
        : 'cursor-pointer rounded-2xl bg-bg-surface border border-border-default p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-border-subtle'
    "
  >
    <YouTubeEmbedPlayer
      v-if="expanded"
      :video-id="video.id"
      :title="video.title"
      :channel-title="video.channelTitle"
      :source-url="defaultWatchUrl(video.id)"
      @close="emit('collapse')"
      @open-window="onOpenWindow"
    />

    <template v-else>
      <!-- Checkbox for multiselect -->
      <button
        v-if="selectable"
        type="button"
        class="shrink-0 flex items-center justify-center w-5 h-5 rounded border transition-colors"
        :class="
          selected
            ? 'bg-accent-base border-accent-base text-white'
            : 'border-border-default hover:border-accent-base'
        "
        @click.stop="onToggleSelect"
      >
        <Check v-if="selected" :size="12" />
      </button>

      <!-- Thumbnail -->
      <div
        class="relative overflow-hidden bg-bg-elevated shrink-0"
        :class="[
          layout === 'list' ? 'rounded-lg w-40' : 'rounded-xl w-full',
          short ? 'aspect-9/16' : 'aspect-video'
        ]"
        @click="onExpand"
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
          class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-base text-white text-[10px] font-medium"
        >
          <Check :size="10" />
        </div>

        <!-- Cover fetching badge -->
        <div
          v-if="coverStatus === 'fetching'"
          class="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-base text-white text-[10px] font-medium"
        >
          <RefreshCw :size="10" class="animate-spin" />
        </div>

        <!-- Duration badge -->
        <div
          v-if="video.duration"
          class="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded"
        >
          {{ video.duration }}
        </div>

        <!-- Play overlay -->
        <div
          class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
          :class="isPlayable ? '' : 'opacity-50'"
        >
          <div v-if="isPlayable" class="opacity-0 group-hover:opacity-100 transition-opacity">
            <Play :size="short ? 28 : 36" class="text-white drop-shadow" fill="white" />
          </div>
        </div>

        <!-- Download action overlay (card only) -->
        <div
          v-if="layout !== 'list'"
          class="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center gap-1"
        >
          <YTIconButton
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
          </YTIconButton>
        </div>
      </div>

      <!-- Info -->
      <div :class="layout === 'list' ? 'flex-1 min-w-0' : 'mt-2'">
        <h3 class="text-sm font-semibold text-fg-base line-clamp-2">{{ video.title }}</h3>
        <div class="text-xs text-fg-muted mt-0.5">
          <button
            v-if="showChannel && (video as YouTubeVideo).channelId"
            class="hover:text-accent-base transition-colors"
            @click.stop="$emit('openWindow', defaultWatchUrl(video.id))"
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
          class="text-xs text-fg-faint mt-1 line-clamp-2"
        >
          {{ (video as YouTubeVideo).description }}
        </p>
      </div>

      <!-- List actions -->
      <div
        v-if="layout === 'list'"
        class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <YTIconButton :title="$t('youtube.play')" @click="onExpand">
          <Play :size="14" />
        </YTIconButton>
        <YTIconButton :disabled="state !== null" :title="$t('youtube.addToQueue')" @click="onQueue">
          <RefreshCw
            v-if="state === 'queuing' || state === 'downloading'"
            :size="14"
            class="animate-spin"
          />
          <Check v-else-if="state === 'done'" :size="14" />
          <Download v-else :size="14" />
        </YTIconButton>
        <YTIconButton :title="$t('youtube.downloadOptions')" @click="onOptions">
          <SlidersHorizontal :size="14" />
        </YTIconButton>
        <YTIconButton :title="$t('youtube.openInWindow')" @click="onOpenWindow">
          <ExternalLink :size="14" />
        </YTIconButton>
      </div>
    </template>
  </div>
</template>
