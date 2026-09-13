<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Radio, X, RefreshCw, AlertCircle } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { useSavedStore } from '@renderer/stores/saved';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import LoaderSpinner from '@renderer/components/LoaderSpinner.vue';
import { detectChannelPrefix, detectPlatform, parseBatchInputAll } from '@shared/platform';
import { buildChannelUrl, countSkippedBatchLines, isScItem } from '@renderer/utils/onlineView';
import OnlineSearchBar from '@renderer/components/online/OnlineSearchBar.vue';
import OnlineViewTabs from '@renderer/components/online/OnlineViewTabs.vue';
import OnlineButton from '@renderer/components/online/OnlineButton.vue';
import OnlineSubscriptionsPanel from '@renderer/components/online/OnlineSubscriptionsPanel.vue';
import OnlineBatchPanel from '@renderer/components/online/OnlineBatchPanel.vue';
import OnlineSearchResultsPanel from '@renderer/components/online/OnlineSearchResultsPanel.vue';
import OnlineResolvedPanel from '@renderer/components/online/OnlineResolvedPanel.vue';
import OnlineConfirmDialog from '@renderer/components/online/OnlineConfirmDialog.vue';
import YTAuthButton from '@renderer/components/online/YTAuthButton.vue';
import type {
  YouTubeVideo,
  YouTubeResolvedItem,
  Subscription,
  CoverSpec,
  MetaOverride
} from '@renderer/types/online';

// Heavy dialogs/views are lazy-loaded so they don't bloat the Online chunk
// (plan 3.5).
const OnlineChannelView = defineAsyncComponent({
  loader: () => import('@renderer/components/online/OnlineChannelView.vue'),
  loadingComponent: LoaderSpinner,
  delay: 120
});
const DownloadConfigDialog = defineAsyncComponent(
  () => import('@renderer/components/online/DownloadConfigDialog.vue')
);
const SubscribeConfigDialog = defineAsyncComponent(
  () => import('@renderer/components/online/SubscribeConfigDialog.vue')
);

const yt = useOnlineStore();
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
let resolveSeq = 0;
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

function openWatchUrl(url: string) {
  // Legacy saved SC entries may resolve to a bare numeric id — no page URL.
  if (!/^https:/i.test(url)) {
    ui.notify('info', input.value || url, t('youtube.openUnavailable'));
    return;
  }
  window.open(url, '_blank', 'width=1100,height=700');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (expandedSearchId.value) expandedSearchId.value = null;
  if (expandedResolvedId.value) expandedResolvedId.value = null;
  // Close the topmost inline dialog, newest-first.
  if (configTarget.value) {
    configTarget.value = null;
    return;
  }
  if (prefsOpen.value) {
    prefsOpen.value = null;
    return;
  }
  if (unfollowTarget.value) {
    unfollowTarget.value = null;
  }
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
  if (configTarget.value.mode === 'single') return configTarget.value.video.channelTitle;
  return yt.resolved?.meta.channelTitle || '';
});

// Platform of the item(s) being configured — SC shows a reduced dialog.
const configDialogPlatform = computed<'youtube' | 'soundcloud'>(() => {
  const t = configTarget.value;
  if (!t) return 'youtube';
  const item = t.mode === 'single' ? t.video : yt.resolved?.items[0];
  if (!item) return 'youtube';
  return isScItem(item, yt.itemUrl(item)) ? 'soundcloud' : 'youtube';
});

function togglePrefs(sub: Subscription) {
  prefsOpen.value = prefsOpen.value?.channelId === sub.channelId ? null : sub;
}

function openDiscover() {
  activeSection.value = 'discover';
}

function openChannelFromSubscription(channelId: string) {
  openDiscover();
  const sub = yt.getSubscription(channelId);
  void yt.openChannel(buildChannelUrl(channelId, sub?.platform));
}

function downloadSubscriptionAll(sub: Subscription) {
  void yt.queueChannelVideos(sub.channelId, sub.downloadPrefs);
}

function downloadAllPending() {
  for (const sub of yt.subscriptions) {
    void yt.queueChannelVideos(sub.channelId, sub.downloadPrefs);
  }
}

// A pasted input is "resolvable" when it is a direct link of ANY supported
// platform — it then resolves to a track/playlist/profile instead of a search.
const isResolvable = computed(() => detectPlatform(input.value) !== null);

const selectedCount = computed(() => yt.selectedResolved.size);

const batchEntries = computed(() => parseBatchInputAll(batchText.value));

// Lines that were dropped by the parser (channels, prefixes, junk).
const batchSkippedCount = computed(() =>
  countSkippedBatchLines(batchText.value, batchEntries.value.length)
);

// SoundCloud links ignore download profiles — hide the selector for them.
const batchHasSc = computed(() => batchEntries.value.some((e) => e.platform === 'soundcloud'));

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
    batchResult.value =
      t('youtube.batchQueued', { count: queued }) +
      (batchSkippedCount.value > 0
        ? ' · ' + t('youtube.batchSkipped', { count: batchSkippedCount.value })
        : '');
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
  // @name -> YouTube channel, $name -> SoundCloud profile: open directly.
  const prefix = detectChannelPrefix(input.value);
  if (prefix) {
    openDiscover();
    yt.setResolved(null);
    yt.closeChannel();
    await yt.openChannelPrefix(prefix);
    return;
  }
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
    const result = await yt.searchOnline(input.value);
    // Stale response from a superseded search — discard.
    if (seq !== searchSeq) return;
    if (result.success) {
      yt.setResults(
        result.items,
        result.nextPageToken ?? undefined,
        result.prevPageToken ?? undefined
      );
    } else {
      const key = errorCodeKey(result.code as never);
      searchError.value = key ? t(key) : result.error || t('youtube.searchError');
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
  const seq = ++resolveSeq;
  try {
    const res = await yt.resolveOnline(url);
    // Stale response from a superseded resolve — discard.
    if (seq !== resolveSeq) return;
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
    if (seq === resolveSeq) yt.isResolving = false;
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
  const id =
    r.kind === 'channel'
      ? r.sourceUrl
      : (r.sourceUrl.match(/[?&]list=([\w-]+)/)?.[1] ?? r.sourceUrl);
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
    r.kind === 'channel'
      ? r.sourceUrl
      : (r.sourceUrl.match(/[?&]list=([\w-]+)/)?.[1] ?? r.sourceUrl)
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

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  try {
    const text = (await window.api?.invoke('app:readClipboard')) as string | undefined;
    if (typeof text === 'string' && detectPlatform(text) && !input.value) {
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
      class="sticky top-0 z-10 bg-base-100/(--glass-alpha) backdrop-blur border border-b border-base-300 px-4 py-4"
    >
      <div class="flex items-center gap-3 mb-4">
        <Radio :size="24" class="text-primary" />
        <h1 class="text-xl font-bold">{{ $t('nav.online') }}</h1>
        <div class="flex-1" />
        <YTAuthButton />
      </div>

      <OnlineSearchBar
        v-model="input"
        :is-resolving="yt.isResolving"
        :is-searching="yt.isSearching"
        :batch-open="batchOpen"
        :batch-count="batchEntries.length"
        @submit="submit"
        @toggle-batch="batchOpen = !batchOpen"
      />

      <OnlineBatchPanel
        v-model:text="batchText"
        v-model:profile-id="batchProfileId"
        :open="batchOpen"
        :entries="batchEntries"
        :skipped-count="batchSkippedCount"
        :has-sc="batchHasSc"
        :profiles="profiles"
        :busy="batchBusy"
        :result="batchResult"
        @import-file="importBatchFile"
        @submit="submitBatch"
      />

      <OnlineViewTabs
        v-model="activeSection"
        :subscription-count="yt.subscriptions.length"
        class="mt-4"
      >
        <template v-if="activeSection === 'subscriptions'">
          <OnlineButton
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
          </OnlineButton>
          <OnlineButton
            variant="secondary"
            size="sm"
            :disabled="yt.checkingSubscriptions"
            :title="$t('youtube.checkNow')"
            @click="yt.checkSubscriptionsNow"
          >
            <RefreshCw :size="12" :class="yt.checkingSubscriptions ? 'animate-spin' : ''" />
            {{ $t('youtube.checkNow') }}
          </OnlineButton>
        </template>
        <template v-else>
          <OnlineButton
            v-if="yt.resolved || yt.searchResults.length"
            variant="secondary"
            size="sm"
            @click="clearResolved"
          >
            <X :size="12" />
            {{ $t('youtube.clear') }}
          </OnlineButton>
        </template>
      </OnlineViewTabs>

      <p v-if="resolveError" class="text-xs text-error mt-3">{{ resolveError }}</p>
      <p v-if="searchError" class="text-xs text-error mt-3">{{ searchError }}</p>
    </header>

    <div class="flex-1 overflow-auto p-4">
      <OnlineSubscriptionsPanel
        v-if="activeSection === 'subscriptions'"
        :subscriptions="yt.subscriptions"
        :loaded="yt.subscriptionsLoaded"
        :checking-channel-id="yt.checkingChannelId"
        :queueing-channel-id="yt.queueingChannelId"
        @open-channel="openChannelFromSubscription"
        @download-all="downloadSubscriptionAll"
        @check-now="yt.checkChannelNow"
        @toggle-auto-download="yt.setAutoDownload"
        @open-prefs="togglePrefs"
        @unfollow="confirmUnfollow"
      />

      <OnlineChannelView v-else-if="yt.channelLoading || yt.channel" />

      <div
        v-else-if="yt.channelError"
        class="flex flex-col items-center justify-center py-16 text-center"
      >
        <AlertCircle :size="40" class="text-error mb-3" />
        <p class="text-sm text-base-content/70 mb-1">{{ yt.channelError }}</p>
        <button
          class="fx-noise mt-3 px-4 py-1.5 fx-depth rounded-field bg-base-content/10 border border-base-300 text-xs text-base-content hover:bg-base-100 transition-colors"
          @click="submit"
        >
          {{ $t('youtube.search') }}
        </button>
      </div>

      <template v-else>
        <OnlineResolvedPanel
          v-model:expanded-id="expandedResolvedId"
          v-model:range-start="rangeStart"
          v-model:range-end="rangeEnd"
          :resolved-loading="yt.resolvedLoading"
          :resolved-capped="yt.resolvedCapped"
          :selected-count="selectedCount"
          :saved="resolvedSaved"
          :saving="savingPlaylist"
          @toggle-select="toggleSelect"
          @quick-queue="quickQueueResolved"
          @options="queueResolvedItem"
          @open-window="openWatchUrl"
          @download-all="addSelectedToQueue"
          @play-all="yt.playAllStreams(yt.resolved?.items ?? [])"
          @save="saveResolvedPlaylist"
          @clear="clearResolved"
          @select-all="toggleSelectAll"
          @select-range="selectRange"
          @add-selected="addSelectedToQueue"
          @load-more="yt.loadMoreResolved"
        />

        <OnlineSearchResultsPanel
          v-model:expanded-id="expandedSearchId"
          @quick-queue="quickQueueVideo"
          @options="queueChannelVideo"
          @open-window="openWatchUrl"
        />
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
      :platform="prefsOpen.platform === 'soundcloud' ? 'soundcloud' : 'youtube'"
      :initial-prefs="prefsOpen.downloadPrefs"
      @confirm="
        (payload) => {
          void yt.setDownloadPrefs(prefsOpen!.channelId, payload.prefs || {});
          prefsOpen = null;
        }
      "
      @cancel="prefsOpen = null"
    />

    <OnlineConfirmDialog
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
      :platform="configDialogPlatform"
      @confirm="confirmQueueConfig"
      @cancel="closeQueueConfig"
    />
  </div>
</template>
