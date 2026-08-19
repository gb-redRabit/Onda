<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Download,
  Tv2,
  X,
  ChevronLeft,
  ChevronRight,
  Bell,
  RefreshCw,
  AlertCircle
} from '@lucide/vue';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { useSavedStore } from '@renderer/stores/saved';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import { detectYtKind, parseBatchInput } from '@shared/youtube';
import YouTubeChannelView from '@renderer/components/youtube/YouTubeChannelView.vue';
import DownloadConfigDialog from '@renderer/components/youtube/DownloadConfigDialog.vue';
import SubscribeConfigDialog from '@renderer/components/youtube/SubscribeConfigDialog.vue';
import YTSearchBar from '@renderer/components/youtube/YTSearchBar.vue';
import YTViewTabs from '@renderer/components/youtube/YTViewTabs.vue';
import YTButton from '@renderer/components/youtube/YTButton.vue';
import YTBadge from '@renderer/components/youtube/YTBadge.vue';
import YTEmptyState from '@renderer/components/youtube/YTEmptyState.vue';
import YTSubscriptionCard from '@renderer/components/youtube/YTSubscriptionCard.vue';
import YTMediaCard from '@renderer/components/youtube/YTMediaCard.vue';
import YTSourceHeader from '@renderer/components/youtube/YTSourceHeader.vue';
import YTSelectionToolbar from '@renderer/components/youtube/YTSelectionToolbar.vue';
import YTConfirmDialog from '@renderer/components/youtube/YTConfirmDialog.vue';
import YTAuthButton from '@renderer/components/youtube/YTAuthButton.vue';
import type {
  YouTubeVideo,
  YouTubeResolvedItem,
  Subscription,
  CoverSpec,
  MetaOverride
} from '@renderer/types/youtube';

const yt = useYouTubeStore();
const ui = useUIStore();
const saved = useSavedStore();
void saved.ensureLoaded();
const avatarErrors = ref<Record<string, boolean>>({});
watch(
  () => yt.subscriptions.map((s) => s.channelThumbnail).join('|'),
  () => {
    avatarErrors.value = {};
  }
);
const settings = useSettingsStore();
const { profiles, ensureLoaded: ensureProfilesLoaded } = useDownloadProfiles();
const { t } = useI18n();

const input = ref('');
let searchSeq = 0;
const resolveError = ref('');
const savingPlaylist = ref(false);
const searchError = ref('');
const rangeStart = ref(1);
const rangeEnd = ref(100);
const batchOpen = ref(false);
const batchText = ref('');
const batchBusy = ref(false);
const batchResult = ref('');
const batchProfileId = ref('');
const activeSection = ref<'discover' | 'subscriptions'>('discover');
watch(activeSection, (section) => {
  if (section === 'subscriptions' && !yt.subscriptionsLoaded) {
    void yt.loadSubscriptions();
  }
});
const prefsOpen = ref<Subscription | null>(null);
const unfollowTarget = ref<string | null>(null);
const expandedSearchId = ref<string | null>(null);
const expandedResolvedId = ref<string | null>(null);
const configTarget = ref<
  { mode: 'single'; video: YouTubeVideo | YouTubeResolvedItem } | { mode: 'resolved' } | null
>(null);

function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function openWatchWindow(id: string) {
  window.open(watchUrl(id), '_blank', 'width=1100,height=700');
}

function toggleExpandSearch(id: string) {
  expandedSearchId.value = expandedSearchId.value === id ? null : id;
}

function toggleExpandResolved(item: YouTubeResolvedItem) {
  if (item.isPlayable === false) return;
  expandedResolvedId.value = expandedResolvedId.value === item.id ? null : item.id;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (expandedSearchId.value) expandedSearchId.value = null;
  if (expandedResolvedId.value) expandedResolvedId.value = null;
}

const configDialogTitle = computed(() => {
  if (!configTarget.value) return '';
  if (configTarget.value.mode === 'single') return configTarget.value.video.title;
  return t('youtube.itemsCount', { count: yt.selectedResolved.size });
});

const configDialogChannelTitle = computed(() => {
  if (!configTarget.value) return '';
  if (configTarget.value.mode === 'single') return configTarget.value.video.channelTitle;
  return yt.resolved?.meta.channelTitle || '';
});

const configDialogPlaylistTitle = computed(() => {
  if (!configTarget.value) return '';
  if (configTarget.value.mode === 'single') return '';
  return yt.resolved?.kind === 'playlist' ? yt.resolved.title : '';
});

function togglePrefs(sub: Subscription) {
  prefsOpen.value = prefsOpen.value?.channelId === sub.channelId ? null : sub;
}

function openDiscover() {
  activeSection.value = 'discover';
}

function openChannelFromSubscription(channelId: string) {
  openDiscover();
  void yt.openChannel(`https://www.youtube.com/channel/${channelId}`);
}

function downloadSubscriptionAll(sub: Subscription) {
  void yt.queueChannelVideos(sub.channelId, sub.downloadPrefs);
}

function downloadAllPending() {
  for (const sub of yt.subscriptions) {
    void yt.queueChannelVideos(sub.channelId, sub.downloadPrefs);
  }
}

const isResolvable = computed(() => detectYtKind(input.value) !== null);

const selectedCount = computed(() => yt.selectedResolved.size);

const pageTotal = computed(() => Math.ceil(yt.searchResults.length / 20));

const batchEntries = computed(() => parseBatchInput(batchText.value));

async function submitBatch() {
  const entries = batchEntries.value;
  if (!entries.length) return;
  batchBusy.value = true;
  batchResult.value = '';
  try {
    const profile = profiles.value.find((p) => p.id === batchProfileId.value);
    const queued = await yt.queueBatch(
      entries.map((e) => e.url),
      profile?.config
    );
    batchResult.value = t('youtube.batchQueued', { count: queued });
    if (queued > 0) batchText.value = '';
  } catch {
    batchResult.value = t('youtube.batchError');
  } finally {
    batchBusy.value = false;
  }
}

async function importBatchFile() {
  const res = (await window.api.invoke('dialog:openFile', {
    filters: [
      { name: t('youtube.textFiles'), extensions: ['txt', 'csv', 'tsv'] },
      { name: t('youtube.allFiles'), extensions: ['*'] }
    ]
  })) as { canceled?: boolean; filePaths?: string[] } | undefined;
  const path = res && !res.canceled ? res.filePaths?.[0] : undefined;
  if (!path) return;
  const content = (await window.api.invoke('fs:readTextFile', path)) as string | null;
  if (content) batchText.value = content;
}

function confirmUnfollow(channelId: string) {
  unfollowTarget.value = channelId;
}

function onUnfollowConfirm() {
  if (unfollowTarget.value) {
    yt.unfollowChannel(unfollowTarget.value);
  }
  unfollowTarget.value = null;
}

async function submit() {
  if (!input.value.trim()) return;
  if (isResolvable.value) {
    await resolveLink();
  } else {
    await search();
  }
}

async function search() {
  if (!input.value.trim()) return;
  openDiscover();
  yt.setResolved(null);
  yt.closeChannel();
  yt.isSearching = true;
  yt.searchQuery = input.value;
  searchError.value = '';
  const seq = ++searchSeq;
  try {
    const result = (await window.api.invoke('yt:search', input.value)) as {
      success?: boolean;
      error?: string;
      code?:
        | 'auth-required'
        | 'bot-block'
        | 'private'
        | 'not-found'
        | 'network'
        | 'proxy'
        | 'dependency'
        | 'unknown';
      items?: YouTubeVideo[];
      nextPageToken?: string | null;
      prevPageToken?: string | null;
    } | null;
    // Stale response from a superseded search — discard.
    if (seq !== searchSeq) return;
    if (result?.success) {
      yt.setResults(
        result.items || [],
        result.nextPageToken ?? undefined,
        result.prevPageToken ?? undefined
      );
    } else {
      const key = errorCodeKey(result?.code);
      searchError.value = key ? t(key) : result?.error || t('youtube.searchError');
      yt.setResults([]);
    }
  } catch {
    searchError.value = t('youtube.searchError');
    yt.setResults([]);
  }
  if (seq === searchSeq) yt.isSearching = false;
}

async function resolveLink() {
  const url = input.value.trim();
  if (!url) return;
  openDiscover();
  yt.isResolving = true;
  resolveError.value = '';
  try {
    const res = await window.api.invoke('yt:resolve', url);
    if (res.success && res.result) {
      if (res.result.kind === 'channel') {
        yt.setResolved(null);
        await yt.openChannel(res.result.sourceUrl);
      } else {
        yt.setResults([]);
        yt.setResolved(res.result);
      }
    } else {
      const key = errorCodeKey(res.code);
      resolveError.value = key ? t(key) : res.error || t('youtube.resolveError');
    }
  } catch {
    resolveError.value = t('youtube.resolveError');
  } finally {
    yt.isResolving = false;
  }
}

function clearResolved() {
  yt.setResolved(null);
  resolveError.value = '';
  input.value = '';
}

function saveResolvedPlaylist() {
  const r = yt.resolved;
  if (!r || r.kind === 'video' || savingPlaylist.value) return;
  const id = r.kind === 'channel' ? r.sourceUrl : (r.sourceUrl.match(/[?&]list=([\w-]+)/)?.[1] ?? r.sourceUrl);
  if (saved.isPlaylistSaved(id)) {
    void saved.removePlaylist(id);
    return;
  }
  savingPlaylist.value = true;
  void savePlaylistAsync(r).finally(() => {
    savingPlaylist.value = false;
  });
}

// The saved entry keeps the FULL item list (all pages), so the Saved view and
// playback start instantly without re-resolving the playlist on every visit.
async function savePlaylistAsync(r: NonNullable<typeof yt.resolved>) {
  const { items, totalItems } = await yt.loadAllResolvedItems(r.sourceUrl);
  void saved
    .savePlaylist({
      kind: r.kind,
      url: r.sourceUrl,
      title: r.title,
      thumbnail: r.items[0]?.thumbnail,
      channelTitle: r.meta.channelTitle,
      totalItems: totalItems ?? r.meta.totalItems ?? undefined,
      items: items.length > 0 ? items : r.items
    })
    .then((ok) => {
      if (ok) ui.notify('success', r.title, t('saved.playlistSaved'));
    });
}

const resolvedSaved = computed(() => {
  const r = yt.resolved;
  if (!r || r.kind === 'video') return false;
  return saved.isPlaylistSaved(
    r.kind === 'channel' ? r.sourceUrl : (r.sourceUrl.match(/[?&]list=([\w-]+)/)?.[1] ?? r.sourceUrl)
  );
});

function toggleSelect(id: string) {
  const next = new Set(yt.selectedResolved);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  yt.selectedResolved = next;
}

function toggleSelectAll() {
  if (!yt.resolved) return;
  const all = yt.resolved.items.map((i) => i.id);
  const allSelected = all.length > 0 && all.every((id) => yt.selectedResolved.has(id));
  yt.selectedResolved = allSelected ? new Set() : new Set(all);
}

// Selects a 1-based inclusive range of resolved items (e.g. 1-100, 101-200).
function selectRange() {
  if (!yt.resolved) return;
  const total = yt.resolved.items.length;
  const start = Math.max(1, Math.min(total, Math.floor(Number(rangeStart.value) || 1)));
  const end = Math.max(start, Math.min(total, Math.floor(Number(rangeEnd.value) || total)));
  yt.selectedResolved = new Set(
    yt.resolved.items
      .slice(start - 1, end)
      .filter((i) => i.isPlayable !== false)
      .map((i) => i.id)
  );
}

function addSelectedToQueue() {
  if (!yt.resolved || yt.selectedResolved.size === 0) return;
  // Smart Mode: download immediately with defaults; otherwise open the dialog.
  if (settings.download.smartMode) {
    void yt.queueFromResolved([...yt.selectedResolved]);
    toastAdded();
  } else {
    configTarget.value = { mode: 'resolved' };
  }
}

function queueResolvedItem(item: YouTubeResolvedItem) {
  configTarget.value = { mode: 'single', video: item };
}

function queueChannelVideo(v: YouTubeVideo) {
  configTarget.value = { mode: 'single', video: v };
}

// Quick download (Smart Mode): queue with defaults without the dialog.
function quickQueueResolved(item: YouTubeResolvedItem) {
  if (settings.download.smartMode) {
    void yt.queueVideo(item);
    toastAdded();
  } else {
    configTarget.value = { mode: 'single', video: item };
  }
}

function quickQueueVideo(v: YouTubeVideo) {
  if (settings.download.smartMode) {
    void yt.queueVideo(v);
    toastAdded();
  } else {
    configTarget.value = { mode: 'single', video: v };
  }
}

function confirmQueueConfig(payload: {
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
  const extra = {
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
  };
  if (configTarget.value?.mode === 'resolved') {
    void yt.queueFromResolved([...yt.selectedResolved], undefined, extra);
  } else if (configTarget.value?.mode === 'single') {
    void yt.queueVideo(configTarget.value.video, undefined, extra);
  }
  configTarget.value = null;
  toastAdded();
}

function closeQueueConfig() {
  configTarget.value = null;
}

function toastAdded() {
  ui.notify('success', t('youtube.added'), undefined, 2000);
}

function itemDownloadState(videoId: string): 'queuing' | 'downloading' | 'done' | null {
  if (yt.queuingId === videoId) return 'queuing';
  const status = yt.downloadStatusFor(videoId);
  if (status === 'downloading' || status === 'pending' || status === 'paused') {
    return 'downloading';
  }
  // The audio is done but the animated cover is still being prepared — keep
  // the row busy until the cover finishes.
  if (status === 'completed' && yt.coverStatusFor(videoId) === 'fetching') {
    return 'downloading';
  }
  if (status === 'completed') return 'done';
  return null;
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  try {
    const text = (await window.api?.invoke('app:readClipboard')) as string | undefined;
    if (typeof text === 'string' && detectYtKind(text) && !input.value) {
      input.value = text.trim();
    }
  } catch {
    /* clipboard unavailable */
  }
  void ensureProfilesLoaded();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="flex flex-col h-full">
    <header
      class="sticky top-0 z-10 bg-bg-surface/95 backdrop-blur border-b border-border-default px-4 py-4"
    >
      <div class="flex items-center gap-3 mb-4">
        <Tv2 :size="24" class="text-red-base" />
        <h1 class="text-xl font-bold">{{ $t('youtube.title') }}</h1>
        <div class="flex-1" />
        <YTAuthButton />
      </div>

      <YTSearchBar
        v-model="input"
        :is-resolving="yt.isResolving"
        :is-searching="yt.isSearching"
        :batch-open="batchOpen"
        :batch-count="batchEntries.length"
        @submit="submit"
        @toggle-batch="batchOpen = !batchOpen"
      />

      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="batchOpen"
          class="mt-3 p-3 rounded-2xl bg-bg-surface border border-border-default"
        >
          <textarea
            v-model="batchText"
            :placeholder="$t('youtube.batchPlaceholder')"
            rows="4"
            class="w-full px-3 py-2.5 rounded-xl bg-bg-elevated border border-border-default text-sm text-fg-base placeholder:text-fg-faint focus:border-accent-base focus:outline-none focus:ring-1 focus:ring-accent-base/30 resize-y"
          />
          <div class="flex items-center gap-2 mt-3 flex-wrap">
            <span class="text-xs text-fg-faint">
              {{ $t('youtube.batchDetected', { count: batchEntries.length }) }}
            </span>
            <select
              v-if="profiles.length"
              v-model="batchProfileId"
              class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs text-fg-base focus:border-accent-base focus:outline-none"
            >
              <option value="">{{ $t('youtube.profileNone') }}</option>
              <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <div class="flex-1" />
            <YTButton variant="secondary" size="sm" @click="importBatchFile">
              {{ $t('youtube.batchImport') }}
            </YTButton>
            <YTButton
              variant="primary"
              size="sm"
              :disabled="!batchEntries.length || batchBusy"
              @click="submitBatch"
            >
              <Download :size="12" />
              {{ $t('youtube.batchAdd') }}
            </YTButton>
          </div>
          <p v-if="batchResult" class="text-xs text-green-base mt-2">{{ batchResult }}</p>
          <ul v-if="batchEntries.length" class="mt-2 max-h-40 overflow-auto space-y-1">
            <li
              v-for="e in batchEntries"
              :key="e.url"
              class="flex items-center gap-2 text-xs text-fg-muted"
            >
              <YTBadge
                :variant="e.kind === 'video' ? 'accent' : e.kind === 'playlist' ? 'amber' : 'green'"
              >
                {{
                  $t(
                    e.kind === 'video'
                      ? 'youtube.kindVideo'
                      : e.kind === 'playlist'
                        ? 'youtube.kindPlaylist'
                        : 'youtube.kindChannel'
                  )
                }}
              </YTBadge>
              <span class="truncate">{{ e.url }}</span>
            </li>
          </ul>
        </div>
      </Transition>

      <YTViewTabs
        v-model="activeSection"
        :subscription-count="yt.subscriptions.length"
        class="mt-4"
      >
        <template v-if="activeSection === 'subscriptions'">
          <YTButton
            variant="primary"
            size="sm"
            :disabled="yt.queueingChannelId !== null"
            :title="$t('youtube.downloadAllSubsTitle')"
            @click="downloadAllPending"
          >
            <RefreshCw v-if="yt.queueingChannelId !== null" :size="12" class="animate-spin" />
            <Download v-else :size="12" />
            {{
              yt.queueingChannelId !== null
                ? $t('youtube.downloading')
                : $t('youtube.downloadAllSubs')
            }}
          </YTButton>
          <YTButton
            variant="secondary"
            size="sm"
            :disabled="yt.checkingSubscriptions"
            :title="$t('youtube.checkNow')"
            @click="yt.checkSubscriptionsNow"
          >
            <RefreshCw :size="12" :class="yt.checkingSubscriptions ? 'animate-spin' : ''" />
            {{ $t('youtube.checkNow') }}
          </YTButton>
        </template>
        <template v-else>
          <YTButton
            v-if="yt.resolved || yt.searchResults.length"
            variant="secondary"
            size="sm"
            @click="clearResolved"
          >
            <X :size="12" />
            {{ $t('youtube.clear') }}
          </YTButton>
        </template>
      </YTViewTabs>

      <p v-if="resolveError" class="text-xs text-red-400 mt-3">{{ resolveError }}</p>
      <p v-if="searchError" class="text-xs text-red-400 mt-3">{{ searchError }}</p>
    </header>

    <div class="flex-1 overflow-auto p-4">
      <div v-if="activeSection === 'subscriptions'" class="space-y-4">
        <div v-if="!yt.subscriptionsLoaded" class="flex justify-center py-16">
          <div
            class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
          />
        </div>

        <YTEmptyState
          v-else-if="yt.subscriptions.length === 0"
          :icon="Bell"
          :title="$t('youtube.noSubscriptions')"
        />

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <YTSubscriptionCard
            v-for="sub in yt.subscriptions"
            :key="sub.channelId"
            :sub="sub"
            :loading-channel-id="yt.checkingChannelId"
            :queueing-channel-id="yt.queueingChannelId"
            @open-channel="openChannelFromSubscription"
            @download-all="downloadSubscriptionAll"
            @check-now="yt.checkChannelNow"
            @toggle-auto-download="yt.setAutoDownload"
            @open-prefs="togglePrefs"
            @unfollow="confirmUnfollow"
          />
        </div>
      </div>

      <YouTubeChannelView v-else-if="yt.channelLoading || yt.channel" />

      <div
        v-else-if="yt.channelError"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <AlertCircle :size="40" class="text-red-base mb-3" />
        <p class="text-sm text-fg-muted mb-1">{{ yt.channelError }}</p>
        <button
          class="mt-3 px-4 py-1.5 rounded-lg bg-bg-hover border border-border-default text-xs text-fg-base hover:bg-bg-elevated transition-colors"
          @click="submit"
        >
          {{ $t('youtube.search') }}
        </button>
      </div>

      <template v-else>
        <div v-if="yt.resolved" class="mb-8 space-y-4">
          <YTSourceHeader
            :kind="yt.resolved.kind"
            :title="yt.resolved.title"
            :channel-title="yt.resolved.meta.channelTitle"
            :total-items="yt.resolved.meta.totalItems"
            :loaded-count="yt.resolved.items.length"
            :loading="yt.resolvedLoading"
            :can-download-all="yt.resolved.kind !== 'video'"
            :can-play-all="yt.resolved.kind !== 'video'"
            :can-save="yt.resolved.kind !== 'video'"
            :saved="resolvedSaved"
            :saving="savingPlaylist"
            @download-all="addSelectedToQueue"
            @play-all="yt.playAllStreams(yt.resolved.items)"
            @save="saveResolvedPlaylist"
            @clear="clearResolved"
          />

          <div v-if="yt.resolved.items.length === 0" class="text-sm text-fg-faint py-8 text-center">
            {{ $t('youtube.itemsCount', { count: 0 }) }}
          </div>

          <div v-else class="space-y-4">
            <div
              class="grid gap-4"
              :class="[
                yt.resolved.kind === 'video'
                  ? 'grid-cols-1'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              ]"
            >
              <YTMediaCard
                v-for="item in yt.resolved.items"
                :key="item.id"
                :video="item"
                :expanded="expandedResolvedId === item.id"
                :selectable="yt.resolved.kind !== 'video'"
                :selected="yt.selectedResolved.has(item.id)"
                :state="itemDownloadState(item.id)"
                :cover-status="yt.coverStatusFor(item.id)"
                :watch-url="watchUrl(item.id)"
                @expand="toggleExpandResolved(item)"
                @collapse="expandedResolvedId = null"
                @toggle-select="toggleSelect"
                @queue="quickQueueResolved"
                @play="yt.playStream(item)"
                @options="queueResolvedItem"
                @open-window="openWatchWindow"
              />
            </div>

            <YTSelectionToolbar
              v-if="yt.resolved.kind !== 'video'"
              :selected-count="selectedCount"
              :total-count="yt.resolved.items.length"
              :range-start="rangeStart"
              :range-end="rangeEnd"
              @update:range-start="rangeStart = $event"
              @update:range-end="rangeEnd = $event"
              @select-all="toggleSelectAll"
              @select-range="selectRange"
              @add-selected="addSelectedToQueue"
            />

            <div v-if="yt.resolvedCapped" class="flex justify-center">
              <YTButton
                variant="secondary"
                size="sm"
                :disabled="yt.resolvedLoading"
                @click="yt.loadMoreResolved"
              >
                <RefreshCw v-if="yt.resolvedLoading" :size="12" class="animate-spin" />
                {{ $t('youtube.loadMore') }}
              </YTButton>
            </div>
          </div>
        </div>

        <div v-if="yt.isSearching" class="flex justify-center py-16">
          <div
            class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
          />
        </div>

        <YTEmptyState
          v-else-if="yt.searchResults.length === 0 && !yt.resolved"
          :icon="Tv2"
          :title="$t('youtube.searchHeading')"
          :description="$t('youtube.discover')"
        />

        <div v-else-if="yt.searchResults.length" class="space-y-4">
          <p class="text-xs text-fg-faint px-1">
            {{ $t('youtube.resultsCount', { count: yt.searchResults.length }) }}
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <YTMediaCard
              v-for="v in yt.pagedResults"
              :key="v.id"
              :video="v"
              :expanded="expandedSearchId === v.id"
              :state="itemDownloadState(v.id)"
              :cover-status="yt.coverStatusFor(v.id)"
              :watch-url="watchUrl(v.id)"
              show-channel
              show-views
              show-description
              @expand="toggleExpandSearch(v.id)"
              @collapse="expandedSearchId = null"
              @queue="quickQueueVideo(v)"
              @play="yt.playStream(v)"
              @options="queueChannelVideo(v)"
              @open-window="openWatchWindow(v.id)"
            />
          </div>

          <div v-if="pageTotal > 1" class="flex items-center justify-center gap-3 pt-2">
            <YTButton
              variant="secondary"
              size="sm"
              :disabled="!yt.hasPrevPage"
              @click="yt.prevSearchPage"
            >
              <ChevronLeft :size="16" />
            </YTButton>
            <span class="text-xs text-fg-faint">
              {{ $t('youtube.pageOf', { current: yt.searchPage + 1, total: pageTotal }) }}
            </span>
            <YTButton
              variant="secondary"
              size="sm"
              :disabled="!yt.hasNextPage"
              @click="yt.nextSearchPage"
            >
              <ChevronRight :size="16" />
            </YTButton>
          </div>
        </div>
      </template>
    </div>

    <SubscribeConfigDialog
      v-if="prefsOpen"
      mode="edit"
      :channel="{
        channelId: prefsOpen.channelId,
        channelTitle: prefsOpen.channelTitle,
        channelThumbnail: prefsOpen.channelThumbnail
      }"
      :initial-prefs="prefsOpen.downloadPrefs"
      @confirm="
        (payload) => {
          void yt.setDownloadPrefs(prefsOpen!.channelId, payload.prefs || {});
          prefsOpen = null;
        }
      "
      @cancel="prefsOpen = null"
    />

    <YTConfirmDialog
      v-if="unfollowTarget"
      :title="$t('youtube.unsubscribeChannel')"
      :message="$t('youtube.unsubscribeChannelConfirm')"
      :confirm-text="$t('common.delete')"
      :cancel-text="$t('common.cancel')"
      variant="danger"
      @confirm="onUnfollowConfirm"
      @cancel="unfollowTarget = null"
    />

    <DownloadConfigDialog
      v-if="configTarget"
      :title="configDialogTitle"
      :thumbnail="configTarget.mode === 'single' ? configTarget.video.thumbnail : undefined"
      :channel-title="configDialogChannelTitle || undefined"
      :playlist-title="configDialogPlaylistTitle || undefined"
      @confirm="confirmQueueConfig"
      @cancel="closeQueueConfig"
    />
  </div>
</template>
