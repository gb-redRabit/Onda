<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Users, Download, LayoutGrid, Rows3, Bell, BellOff, Play, X, RefreshCw } from '@lucide/vue';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { useSettingsStore } from '@renderer/stores/settings';
import { formatNumber } from '@renderer/utils/formatters';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import type {
  YouTubeVideo,
  SubscriptionDownloadPrefs,
  CoverSpec,
  MetaOverride
} from '@renderer/types/youtube';
import YouTubeVideoCard from './YouTubeVideoCard.vue';
import YouTubeEmbedPlayer from './YouTubeEmbedPlayer.vue';
import SubscribeConfigDialog from './SubscribeConfigDialog.vue';
import DownloadConfigDialog from './DownloadConfigDialog.vue';

const yt = useYouTubeStore();
const settings = useSettingsStore();
const { t } = useI18n();

const followed = computed(() => (yt.channel ? yt.isSubscribed(yt.channel.id) : false));
const subscribeOpen = ref(false);
const expandedId = ref<string | null>(null);

function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function openWatchWindow(id: string) {
  window.open(watchUrl(id), '_blank', 'width=1100,height=700');
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && expandedId.value) expandedId.value = null;
}

const channelErrorMessage = computed(() => {
  const key = errorCodeKey(yt.channelErrorCode);
  return key ? t(key) : yt.channelError;
});

function openSubscribe() {
  subscribeOpen.value = true;
}

function closeSubscribe() {
  subscribeOpen.value = false;
}

// Reset on channel change so a previously failed avatar can retry.
const avatarFailed = ref(false);
watch(
  () => yt.channel?.id,
  () => {
    avatarFailed.value = false;
  }
);

async function confirmSubscribe(payload: {
  prefs?: SubscriptionDownloadPrefs;
  downloadAll: boolean;
}) {
  subscribeOpen.value = false;
  if (!yt.channel) return;
  await yt.followChannelWithSetup(
    {
      channelId: yt.channel.id,
      channelTitle: yt.channel.title,
      channelThumbnail: yt.channel.thumbnail
    },
    payload
  );
}

async function toggleFollow() {
  if (!yt.channel) return;
  if (followed.value) {
    await yt.unfollowChannel(yt.channel.id);
  } else {
    openSubscribe();
  }
}

const featured = computed(() =>
  yt.channelVideos.slice(0, Math.min(6, Math.max(3, yt.channelVideos.length)))
);
const rest = computed(() => yt.channelVideos.slice(featured.value.length));

const queueTarget = ref<YouTubeVideo | null>(null);

// Audio downloads open the cover/metadata config dialog first (Faza 5), unless
// Smart Mode is on — then download immediately with defaults.
function queueVideo(v: YouTubeVideo) {
  if (settings.download.smartMode) {
    void yt.queueVideo(v);
  } else {
    queueTarget.value = v;
  }
}

function confirmQueue(payload: {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  filenameTemplate?: string;
  cover?: CoverSpec;
  metaOverride?: MetaOverride;
  outputDir?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioLanguage?: string;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
}) {
  if (queueTarget.value) {
    void yt.queueVideo(queueTarget.value, undefined, {
      ...(payload.kind ? { kind: payload.kind } : {}),
      ...(payload.format ? { format: payload.format } : {}),
      ...(payload.quality ? { quality: payload.quality } : {}),
      ...(payload.audioQuality ? { audioQuality: payload.audioQuality } : {}),
      ...(payload.videoContainer ? { videoContainer: payload.videoContainer } : {}),
      ...(payload.filenameTemplate ? { filenameTemplate: payload.filenameTemplate } : {}),
      ...(payload.cover ? { cover: payload.cover } : {}),
      ...(payload.metaOverride ? { metaOverride: payload.metaOverride } : {}),
      ...(payload.outputDir ? { outputDir: payload.outputDir } : {}),
      ...(payload.subsLangs ? { subsLangs: payload.subsLangs } : {}),
      ...(payload.subsFormat ? { subsFormat: payload.subsFormat } : {}),
      ...(payload.subsMode ? { subsMode: payload.subsMode } : {}),
      ...(payload.subsFolder ? { subsFolder: payload.subsFolder } : {}),
      ...(payload.audioLanguage ? { audioLanguage: payload.audioLanguage } : {}),
      ...(payload.sponsorBlock && payload.sponsorBlock !== 'off'
        ? { sponsorBlock: payload.sponsorBlock }
        : {}),
      ...(payload.trimStart != null && payload.trimEnd != null
        ? { trimStart: payload.trimStart, trimEnd: payload.trimEnd }
        : {})
    });
  }
  queueTarget.value = null;
}

const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function maybeLoadMore() {
  if (!yt.channelHasMore || yt.channelLoading) return;
  const el = sentinelRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.top <= window.innerHeight + 200) {
    void yt.loadMoreChannel();
  }
}

function setSentinel(el: Element | ComponentPublicInstance | null) {
  sentinelRef.value = el instanceof Element ? (el as HTMLElement) : null;
  if (!observer) return;
  observer.disconnect();
  if (el instanceof Element) observer.observe(el);
}

onMounted(() => {
  if (!yt.subscriptionsLoaded) void yt.loadSubscriptions();
  window.addEventListener('keydown', onKeydown);
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) maybeLoadMore();
    },
    { root: null, rootMargin: '200px 0px' }
  );
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  observer?.disconnect();
  observer = null;
});

// After a page finishes loading the sentinel may still be in view (short list),
// so keep pulling pages until it scrolls out of the viewport.
watch(
  () => [yt.channelLoading, yt.channelHasMore],
  () => maybeLoadMore(),
  { flush: 'post' }
);
</script>

<template>
  <div class="space-y-4 w-full">
    <div v-if="yt.channelLoading && !yt.channel" class="flex justify-center py-16">
      <div
        class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
      />
    </div>
    <template v-else-if="yt.channel">
      <div class="flex items-center gap-4">
        <button
          class="p-2 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors shrink-0"
          @click="yt.closeChannel"
        >
          <ArrowLeft :size="16" />
        </button>
        <div
          v-if="yt.channel.thumbnail && !avatarFailed"
          class="w-14 h-14 rounded-full overflow-hidden shrink-0 bg-bg-elevated"
        >
          <img
            :src="yt.channel.thumbnail"
            :alt="yt.channel.title"
            class="w-full h-full object-cover"
            @error="avatarFailed = true"
          />
        </div>
        <div
          v-else
          class="w-14 h-14 rounded-full bg-bg-elevated border border-border-default flex items-center justify-center shrink-0 text-fg-faint"
        >
          <Users :size="22" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold truncate">{{ yt.channel.title }}</h2>
          <p v-if="yt.channel.subscriberCount != null" class="text-xs text-fg-faint">
            {{ formatNumber(yt.channel.subscriberCount) }} {{ $t('youtube.subscribers') }}
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            :class="
              followed
                ? 'bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover'
                : 'bg-accent-base text-white hover:bg-accent-hover'
            "
            :title="$t('youtube.subscribeChannel')"
            @click="toggleFollow"
          >
            <Bell v-if="followed" :size="14" />
            <BellOff v-else :size="14" />
            {{ followed ? $t('youtube.unsubscribeChannel') : $t('youtube.subscribeChannel') }}
          </button>
          <button
            class="p-2 rounded-lg transition-colors"
            :class="
              yt.channelViewMode === 'grid'
                ? 'bg-accent-base text-white'
                : 'border border-border-default text-fg-muted hover:bg-bg-hover'
            "
            :title="$t('youtube.viewTiles')"
            @click="yt.setChannelViewMode('grid')"
          >
            <LayoutGrid :size="14" />
          </button>
          <button
            class="p-2 rounded-lg transition-colors"
            :class="
              yt.channelViewMode === 'list'
                ? 'bg-accent-base text-white'
                : 'border border-border-default text-fg-muted hover:bg-bg-hover'
            "
            :title="$t('youtube.viewList')"
            @click="yt.setChannelViewMode('list')"
          >
            <Rows3 :size="14" />
          </button>
        </div>
      </div>

      <p v-if="yt.channelError" class="text-xs text-red-400">{{ channelErrorMessage }}</p>

      <SubscribeConfigDialog
        v-if="subscribeOpen && yt.channel"
        :channel="{
          channelId: yt.channel.id,
          channelTitle: yt.channel.title,
          channelThumbnail: yt.channel.thumbnail
        }"
        @confirm="confirmSubscribe"
        @cancel="closeSubscribe"
      />

      <div v-if="featured.length">
        <h3 class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-3">
          {{ $t('youtube.latest') }}
        </h3>
        <div class="grid gap-4 w-full grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          <YouTubeVideoCard
            v-for="v in featured"
            :key="v.id"
            :video="v"
            :downloaded="yt.isVideoDownloaded(v.id, yt.channel?.id)"
            :cover-status="yt.coverStatusFor(v.id)"
            :expanded="expandedId === v.id"
            :watch-url="watchUrl(v.id)"
            :class="expandedId === v.id ? 'col-span-full' : ''"
            @queue="queueVideo"
            @expand="expandedId = v.id"
            @collapse="expandedId = null"
          />
        </div>
      </div>

      <div class="flex gap-4 border-b border-border-default">
        <button
          class="py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            yt.channelTab === 'videos'
              ? 'border-accent-base text-fg-base'
              : 'border-transparent text-fg-faint hover:text-fg-muted'
          "
          @click="yt.switchChannelTab('videos')"
        >
          {{ $t('youtube.videosTab') }}
        </button>
        <button
          v-if="yt.channelHasShorts"
          class="py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            yt.channelTab === 'shorts'
              ? 'border-accent-base text-fg-base'
              : 'border-transparent text-fg-faint hover:text-fg-muted'
          "
          @click="yt.switchChannelTab('shorts')"
        >
          {{ $t('youtube.shortsTab') }}
        </button>
      </div>

      <div
        v-if="yt.channelLoading && yt.channelTab === 'videos' && !yt.channelVideos.length"
        class="flex justify-center py-8"
      >
        <div
          class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
        />
      </div>

      <template v-if="yt.channelTab === 'videos'">
        <div v-if="rest.length">
          <h3 class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-3">
            {{ $t('youtube.allVideos') }}
          </h3>
          <div
            v-if="yt.channelViewMode === 'grid'"
            class="grid gap-4 w-full grid-cols-[repeat(auto-fill,minmax(170px,1fr))]"
          >
            <YouTubeVideoCard
              v-for="v in rest"
              :key="v.id"
              :video="v"
              :downloaded="yt.isVideoDownloaded(v.id, yt.channel?.id)"
              :cover-status="yt.coverStatusFor(v.id)"
              :expanded="expandedId === v.id"
              :watch-url="watchUrl(v.id)"
              :class="expandedId === v.id ? 'col-span-full' : ''"
              @queue="queueVideo"
              @expand="expandedId = v.id"
              @collapse="expandedId = null"
            />
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="v in rest"
              :key="v.id"
              class="flex gap-3 p-2 rounded-xl hover:bg-bg-hover transition-colors group items-center"
              :class="expandedId === v.id ? 'flex-col items-stretch' : ''"
            >
              <div v-if="expandedId === v.id" class="w-full">
                <YouTubeEmbedPlayer :video-id="v.id" @open-window="openWatchWindow(v.id)" />
              </div>
              <button
                class="w-32 aspect-video rounded-lg bg-bg-elevated overflow-hidden shrink-0 relative"
                :title="$t('youtube.play')"
                @click="toggleExpand(v.id)"
              >
                <img
                  v-if="v.thumbnail"
                  :src="v.thumbnail"
                  :alt="v.title"
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
                <div
                  v-if="v.duration"
                  class="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded"
                >
                  {{ v.duration }}
                </div>
                <div
                  v-if="yt.coverStatusFor(v.id) === 'fetching'"
                  class="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-base text-white text-[10px] font-medium"
                  :title="$t('downloads.coverStatusFetching')"
                >
                  <RefreshCw :size="10" class="animate-spin" />
                </div>
                <div
                  class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
                >
                  <div class="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play :size="28" class="text-white drop-shadow" fill="white" />
                  </div>
                </div>
              </button>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium line-clamp-1 mb-0.5">{{ v.title }}</h3>
                <p class="text-xs text-fg-faint truncate">
                  <template v-if="v.viewCount">
                    {{ formatNumber(v.viewCount) }} {{ $t('youtube.views') }} ·
                  </template>
                  <template v-if="v.publishedAt">{{ v.publishedAt }}</template>
                </p>
              </div>
              <button
                class="p-2 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors shrink-0"
                :title="expandedId === v.id ? $t('nav.collapse') : $t('youtube.play')"
                @click="toggleExpand(v.id)"
              >
                <X v-if="expandedId === v.id" :size="14" />
                <Play v-else :size="14" />
              </button>
              <button
                class="p-2 rounded-lg bg-accent-base text-white hover:bg-accent-hover transition-colors shrink-0"
                @click="queueVideo(v)"
              >
                <Download :size="14" />
              </button>
            </div>
          </div>
        </div>

        <p v-if="!featured.length && !rest.length" class="text-sm text-fg-faint py-8 text-center">
          {{ $t('youtube.noVideos') }}
        </p>
      </template>

      <template v-else>
        <div v-if="yt.channelLoading && !yt.channelShorts.length" class="flex justify-center py-8">
          <div
            class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
          />
        </div>
        <div
          v-else-if="yt.channelShorts.length"
          class="grid gap-4 w-full grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
        >
          <YouTubeVideoCard
            v-for="v in yt.channelShorts"
            :key="v.id"
            :video="v"
            short
            :downloaded="yt.isVideoDownloaded(v.id, yt.channel?.id)"
            :cover-status="yt.coverStatusFor(v.id)"
            :expanded="expandedId === v.id"
            :watch-url="watchUrl(v.id)"
            :class="expandedId === v.id ? 'col-span-full' : ''"
            @queue="queueVideo"
            @expand="expandedId = v.id"
            @collapse="expandedId = null"
          />
        </div>
        <p v-else class="text-sm text-fg-faint py-8 text-center">
          {{ $t('youtube.noVideos') }}
        </p>
      </template>

      <div v-if="yt.channelHasMore" :ref="setSentinel" class="flex justify-center py-4">
        <div
          v-if="yt.channelLoading"
          class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
        />
      </div>
    </template>

    <DownloadConfigDialog
      v-if="queueTarget && yt.channel"
      :title="queueTarget.title"
      :thumbnail="queueTarget.thumbnail"
      :channel-title="yt.channel.title"
      @confirm="confirmQueue"
      @cancel="queueTarget = null"
    />
  </div>
</template>
