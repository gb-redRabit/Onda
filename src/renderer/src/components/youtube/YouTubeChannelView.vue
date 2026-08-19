<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, Users, LayoutGrid, Rows3, Bell } from '@lucide/vue';
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
import SubscribeConfigDialog from './SubscribeConfigDialog.vue';
import DownloadConfigDialog from './DownloadConfigDialog.vue';
import YTConfirmDialog from './YTConfirmDialog.vue';
import YTButton from './YTButton.vue';
import YTSegmentControl from './YTSegmentControl.vue';
import YTMediaCard from './YTMediaCard.vue';

const yt = useYouTubeStore();
const settings = useSettingsStore();
const { t } = useI18n();

const followed = computed(() => (yt.channel ? yt.isSubscribed(yt.channel.id) : false));
const subscribeOpen = ref(false);
const unfollowOpen = ref(false);
const expandedId = ref<string | null>(null);

function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function openWatchWindow(id: string) {
  window.open(watchUrl(id), '_blank', 'width=1100,height=700');
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

// Reset on channel/id change so a previously failed avatar can retry
// (also when the same channel is reopened or the thumbnail gets refreshed).
const avatarFailed = ref(false);
watch(
  () => [yt.channel?.id, yt.channel?.thumbnail],
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
    unfollowOpen.value = true;
  } else {
    openSubscribe();
  }
}

async function confirmUnfollow() {
  if (yt.channel) {
    await yt.unfollowChannel(yt.channel.id);
  }
  unfollowOpen.value = false;
}

type ChannelSort = 'default' | 'oldest' | 'popular';
const channelSort = ref<ChannelSort>('default');
const sortedVideos = computed(() => {
  const list = [...yt.channelVideos];
  if (channelSort.value === 'oldest') list.reverse();
  return list;
});

const queueTarget = ref<YouTubeVideo | null>(null);

function itemDownloadState(videoId: string): 'queuing' | 'downloading' | 'done' | null {
  if (yt.queuingId === videoId) return 'queuing';
  const status = yt.downloadStatusFor(videoId);
  if (status === 'downloading' || status === 'pending' || status === 'paused') {
    return 'downloading';
  }
  if (status === 'completed' && yt.coverStatusFor(videoId) === 'fetching') {
    return 'downloading';
  }
  if (status === 'completed') return 'done';
  return null;
}

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
      <div class="relative rounded-2xl overflow-hidden bg-bg-surface border border-border-default">
        <div
          v-if="yt.channel.bannerUrl"
          class="h-32 sm:h-40 w-full bg-cover bg-center relative"
          :style="{ backgroundImage: `url(${yt.channel.bannerUrl})` }"
        >
          <div
            class="absolute inset-0 bg-gradient-to-b from-transparent via-bg-surface/30 to-bg-surface"
          />
        </div>
        <div
          v-else
          class="h-24 sm:h-32 w-full bg-gradient-to-br from-accent-base/20 to-bg-elevated"
        />

        <div class="relative px-4 pb-4 -mt-6 sm:-mt-8">
          <div class="flex items-end gap-4">
            <div
              class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-4 border-bg-surface bg-bg-elevated shrink-0"
            >
              <img
                v-if="yt.channel.thumbnail && !avatarFailed"
                :src="yt.channel.thumbnail"
                :alt="yt.channel.title"
                class="w-full h-full object-cover"
                @error="avatarFailed = true"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-fg-faint">
                <Users :size="32" />
              </div>
            </div>
            <div class="min-w-0 flex-1 pb-1">
              <h2 class="text-lg sm:text-xl font-bold truncate">{{ yt.channel.title }}</h2>
              <p class="text-xs text-fg-muted mt-0.5">
                <span v-if="yt.channel.subscriberCount != null">
                  {{ formatNumber(yt.channel.subscriberCount) }} {{ $t('youtube.subscribers') }}
                </span>
                <span v-if="yt.channel.videoCount != null">
                  · {{ formatNumber(yt.channel.videoCount) }} {{ $t('youtube.videos') }}
                </span>
              </p>
            </div>
          </div>

          <p
            v-if="yt.channel.description"
            class="text-xs text-fg-muted mt-3 line-clamp-3 max-w-2xl"
          >
            {{ yt.channel.description }}
          </p>

          <div class="flex items-center gap-2 mt-4 flex-wrap">
            <YTButton :variant="followed ? 'secondary' : 'primary'" size="sm" @click="toggleFollow">
              <Bell :size="14" />
              {{ followed ? $t('youtube.unsubscribeChannel') : $t('youtube.subscribeChannel') }}
            </YTButton>
            <YTButton variant="secondary" size="sm" @click="yt.closeChannel">
              <ArrowLeft :size="14" />
              {{ $t('common.back') }}
            </YTButton>
            <div class="flex-1" />
            <YTSegmentControl
              v-model="yt.channelViewMode"
              :options="[
                { value: 'grid', label: $t('youtube.viewTiles'), icon: LayoutGrid },
                { value: 'list', label: $t('youtube.viewList'), icon: Rows3 }
              ]"
            />
          </div>
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

      <YTConfirmDialog
        v-if="unfollowOpen"
        :title="$t('youtube.unsubscribeChannel')"
        :message="$t('youtube.unsubscribeChannelConfirm')"
        :confirm-text="$t('common.delete')"
        :cancel-text="$t('common.cancel')"
        variant="danger"
        @confirm="confirmUnfollow"
        @cancel="unfollowOpen = false"
      />

      <div class="flex items-center gap-3">
        <YTSegmentControl
          v-model="yt.channelTab"
          :options="[
            { value: 'videos', label: $t('youtube.videosTab') },
            ...(yt.channelHasShorts ? [{ value: 'shorts', label: $t('youtube.shortsTab') }] : [])
          ]"
        />
        <div class="flex-1" />
        <div v-if="yt.channelTab === 'videos'" class="flex gap-1">
          <button
            v-for="opt in [
              { key: 'default', label: $t('youtube.sortLatest') },
              { key: 'oldest', label: $t('youtube.sortOldest') }
            ] as const"
            :key="opt.key"
            class="px-2 py-1 rounded-lg text-[10px] font-medium transition-colors"
            :class="
              channelSort === opt.key
                ? 'bg-accent-base text-white'
                : 'text-fg-faint hover:text-fg-muted'
            "
            @click="channelSort = opt.key"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div v-if="yt.channelLoading && !yt.channelItems.length" class="flex justify-center py-8">
        <div
          class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
        />
      </div>

      <div v-else-if="yt.channelItems.length" class="space-y-4">
        <div
          :class="[
            yt.channelViewMode === 'grid'
              ? 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'space-y-2'
          ]"
        >
          <YTMediaCard
            v-for="v in yt.channelTab === 'videos' ? sortedVideos : yt.channelShorts"
            :key="v.id"
            :video="v"
            :short="yt.channelTab === 'shorts'"
            :expanded="expandedId === v.id"
            :downloaded="yt.isVideoDownloaded(v.id, yt.channel?.id)"
            :cover-status="yt.coverStatusFor(v.id)"
            :state="itemDownloadState(v.id)"
            :watch-url="watchUrl(v.id)"
            :layout="yt.channelViewMode"
            show-views
            @expand="expandedId = v.id"
            @collapse="expandedId = null"
            @queue="queueVideo(v)"
            @play="yt.playStream(v)"
            @open-window="openWatchWindow(v.id)"
          />
        </div>
      </div>

      <p v-else class="text-sm text-fg-faint py-8 text-center">
        {{ $t('youtube.noVideos') }}
      </p>

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
