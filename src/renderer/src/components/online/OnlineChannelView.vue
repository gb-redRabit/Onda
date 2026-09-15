<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOnlineStore } from '@renderer/stores/online';
import { useSettingsStore } from '@renderer/stores/settings';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import {
  resolveDownloadState,
  type OnlineItemDownloadState
} from '@renderer/utils/onlineItemState';
import type {
  YouTubeVideo,
  SubscriptionDownloadPrefs,
  CoverSpec,
  MetaOverride
} from '@renderer/types/online';
import SubscribeConfigDialog from './SubscribeConfigDialog.vue';
import DownloadConfigDialog from './DownloadConfigDialog.vue';
import OnlineConfirmDialog from './OnlineConfirmDialog.vue';
import OnlineSegmentControl from './OnlineSegmentControl.vue';
import OnlineMediaCard from './OnlineMediaCard.vue';
import OnlineChannelHeader from './OnlineChannelHeader.vue';
import { useChannelInfiniteScroll } from '@renderer/composables/useChannelInfiniteScroll';
import LoaderSpinner from '@renderer/components/LoaderSpinner.vue';

const yt = useOnlineStore();
const settings = useSettingsStore();
const { t } = useI18n();

const followed = computed(() => (yt.channel ? yt.isSubscribed(yt.channel.id) : false));
// SoundCloud profile: no subscriptions, no shorts, different counter labels.
const isScChannel = computed(() => yt.channelIsSc);
const subscribeOpen = ref(false);
const unfollowOpen = ref(false);
const expandedId = ref<string | null>(null);

function watchUrl(v: { id: string; url?: string }): string {
  return v.url || `https://www.youtube.com/watch?v=${v.id}`;
}

function openWatchWindow(v: { id: string; url?: string }) {
  window.open(watchUrl(v), '_blank', 'width=1100,height=700');
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
      channelThumbnail: yt.channel.thumbnail,
      platform: isScChannel.value ? 'soundcloud' : 'youtube'
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

function itemDownloadState(videoId: string): OnlineItemDownloadState {
  return resolveDownloadState(
    videoId,
    yt.queuingId,
    yt.downloadStatusFor(videoId),
    yt.coverStatusFor(videoId)
  );
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

const { setSentinel } = useChannelInfiniteScroll();

onMounted(() => {
  if (!yt.subscriptionsLoaded) void yt.loadSubscriptions();
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="space-y-4 w-full">
    <LoaderSpinner v-if="yt.channelLoading && !yt.channel" />
    <template v-else-if="yt.channel">
      <OnlineChannelHeader @toggle-follow="toggleFollow" />

      <p v-if="yt.channelError" class="text-xs text-error">{{ channelErrorMessage }}</p>

      <SubscribeConfigDialog
        v-if="subscribeOpen && yt.channel"
        :channel="{
          channelId: yt.channel.id,
          channelTitle: yt.channel.title,
          channelThumbnail: yt.channel.thumbnail
        }"
        :platform="isScChannel ? 'soundcloud' : 'youtube'"
        @confirm="confirmSubscribe"
        @cancel="closeSubscribe"
      />

      <OnlineConfirmDialog
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
        <OnlineSegmentControl
          v-if="!isScChannel"
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
            class="fx-noise px-2 py-1 fx-depth rounded-field text-[10px] font-medium transition-colors"
            :class="
              channelSort === opt.key
                ? 'bg-primary text-primary-content'
                : 'text-base-content/50 hover:text-base-content/70'
            "
            @click="channelSort = opt.key"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div v-if="yt.channelLoading && !yt.channelItems.length" class="flex justify-center py-8">
        <div class="w-6 h-6 border border-primary border-t-transparent rounded-full animate-spin" />
      </div>

      <div v-else-if="yt.channelItems.length" class="space-y-4">
        <div
          :class="[
            yt.channelViewMode === 'grid'
              ? 'grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'space-y-2'
          ]"
        >
          <OnlineMediaCard
            v-for="v in yt.channelTab === 'videos' ? sortedVideos : yt.channelShorts"
            :key="v.id"
            :video="v"
            :short="yt.channelTab === 'shorts'"
            :expanded="expandedId === v.id"
            :downloaded="yt.isVideoDownloaded(v.id, yt.channel?.id)"
            :cover-status="yt.coverStatusFor(v.id)"
            :state="itemDownloadState(v.id)"
            :watch-url="watchUrl(v)"
            :layout="yt.channelViewMode"
            show-views
            @expand="expandedId = v.id"
            @collapse="expandedId = null"
            @queue="queueVideo(v)"
            @play="yt.playStream(v)"
            @open-window="openWatchWindow(v)"
          />
        </div>
      </div>

      <p v-else class="text-sm text-base-content/50 py-8 text-center">
        {{ $t('youtube.noVideos') }}
      </p>

      <div v-if="yt.channelHasMore" :ref="setSentinel" class="flex justify-center py-4">
        <div
          v-if="yt.channelLoading"
          class="w-6 h-6 border border-primary border-t-transparent rounded-full animate-spin"
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
