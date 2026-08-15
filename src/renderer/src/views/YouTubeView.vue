<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Search,
  Play,
  Download,
  ExternalLink,
  Tv2,
  Check,
  X,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Bell,
  RefreshCw,
  SlidersHorizontal
} from '@lucide/vue';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { formatNumber } from '@renderer/utils/formatters';
import { errorCodeKey } from '@renderer/utils/errorCodes';
import { detectYtKind, parseBatchInput } from '@shared/youtube';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import YouTubeChannelView from '@renderer/components/youtube/YouTubeChannelView.vue';
import YouTubeEmbedPlayer from '@renderer/components/youtube/YouTubeEmbedPlayer.vue';
import DownloadConfigDialog from '@renderer/components/youtube/DownloadConfigDialog.vue';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';
import type {
  YouTubeVideo,
  YouTubeResolvedItem,
  Subscription,
  SubscriptionDownloadPrefs,
  CoverSpec,
  MetaOverride
} from '@renderer/types/youtube';

const yt = useYouTubeStore();
const settings = useSettingsStore();
const { profiles, ensureLoaded: ensureProfilesLoaded } = useDownloadProfiles();
const { t } = useI18n();

const audioFormats = AUDIO_FORMATS;
const videoQualities = VIDEO_QUALITIES;
const videoContainers = VIDEO_CONTAINERS;

const input = ref('');
const resolveError = ref('');
const searchError = ref('');
const rangeStart = ref(1);
const rangeEnd = ref(100);
const addedFlash = ref(false);
const batchOpen = ref(false);
const batchText = ref('');
const batchBusy = ref(false);
const batchResult = ref('');
const batchProfileId = ref('');
const activeSection = ref<'discover' | 'subscriptions'>('discover');
const prefsOpen = ref<string | null>(null);
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

function togglePrefs(channelId: string) {
  prefsOpen.value = prefsOpen.value === channelId ? null : channelId;
}

function onPrefsChange(sub: Subscription, patch: SubscriptionDownloadPrefs) {
  void yt.setDownloadPrefs(sub.channelId, { ...(sub.downloadPrefs || {}), ...patch });
}

function changeCover(sub: Subscription, key: string) {
  const cover: CoverSpec | undefined =
    key === 'none'
      ? { type: 'none' }
      : key === 'thumbnail'
        ? { type: 'thumbnail' }
        : key === 'frame'
          ? { type: 'frame', frameTime: 30 }
          : key === 'clip'
            ? { type: 'clip', clipStart: 0, clipEnd: 30, clipFormat: 'webm' }
            : undefined;
  onPrefsChange(sub, { cover });
}

function onKindPref(sub: Subscription, e: Event) {
  const v = (e.target as HTMLSelectElement).value as 'audio' | 'video';
  onPrefsChange(sub, { kind: v === settings.download.defaultKind ? undefined : v });
}

function onFormatPref(sub: Subscription, e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  onPrefsChange(sub, { format: v === settings.download.defaultAudioFormat ? undefined : v });
}

function onQualityPref(sub: Subscription, e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  onPrefsChange(sub, { quality: v === settings.download.defaultVideoQuality ? undefined : v });
}

function onAudioQualityPref(sub: Subscription, e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  onPrefsChange(sub, { audioQuality: v === settings.download.defaultAudioQuality ? undefined : v });
}

function onCoverPref(sub: Subscription, e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  changeCover(sub, v === settings.download.defaultCover ? '' : v);
}

function onMetaChange(sub: Subscription, field: keyof MetaOverride, value: string) {
  const prev = sub.downloadPrefs?.metaOverride || {};
  const next: MetaOverride = { ...prev, [field]: value.trim() || undefined };
  const cleaned: MetaOverride = {};
  if (next.artist) cleaned.artist = next.artist;
  if (next.album) cleaned.album = next.album;
  if (next.year) cleaned.year = next.year;
  onPrefsChange(sub, { metaOverride: Object.keys(cleaned).length ? cleaned : undefined });
}

function onProfilePref(sub: Subscription, e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  const profile = id ? profiles.value.find((p) => p.id === id) : undefined;
  const prefs: SubscriptionDownloadPrefs = { ...(sub.downloadPrefs || {}) };
  if (!profile) {
    delete prefs.profileId;
  } else {
    const c = profile.config;
    const next: SubscriptionDownloadPrefs = { profileId: id };
    if (c.kind) next.kind = c.kind;
    if (c.format) next.format = c.format;
    if (c.quality) next.quality = c.quality;
    if (c.audioQuality) next.audioQuality = c.audioQuality;
    if (c.audioLanguage !== undefined) next.audioLanguage = c.audioLanguage;
    if (c.cover && c.cover.type !== 'custom') next.cover = c.cover;
    if (c.filenameTemplate) next.filenameTemplate = c.filenameTemplate;
    if (c.metaOverride) next.metaOverride = c.metaOverride;
    if (c.outputDir) next.outputDir = c.outputDir;
    if (c.subsLangs) {
      next.subsLangs = c.subsLangs;
      next.subsFormat = c.subsFormat || 'srt';
      next.subsMode = c.subsMode || 'best';
      next.subsFolder = !!c.subsFolder;
    }
    if (c.addToLibrary !== undefined) next.addToLibrary = c.addToLibrary;
    Object.assign(prefs, next);
  }
  void yt.setDownloadPrefs(sub.channelId, prefs);
}

function onAddToLibraryPref(sub: Subscription, value: boolean) {
  const def = settings.download.autoAddDownloadFolder;
  onPrefsChange(sub, { addToLibrary: value === def ? undefined : value });
}

function openSubscriptions() {
  activeSection.value = 'subscriptions';
  if (!yt.subscriptionsLoaded) void yt.loadSubscriptions();
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

const lastCheckedLabel = (sub: { lastChecked?: number }) =>
  sub.lastChecked ? new Date(sub.lastChecked).toLocaleString() : '';

const isResolvable = computed(() => detectYtKind(input.value) !== null);

const kindKey = computed(() => {
  switch (yt.resolved?.kind) {
    case 'playlist':
      return 'youtube.kindPlaylist';
    case 'channel':
      return 'youtube.kindChannel';
    default:
      return 'youtube.kindVideo';
  }
});

const kindBadgeClass = computed(() => {
  switch (yt.resolved?.kind) {
    case 'playlist':
      return 'bg-amber-base/15 text-amber-base';
    case 'channel':
      return 'bg-green-base/15 text-green-base';
    default:
      return 'bg-accent-ghost text-accent-base';
  }
});

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
      { name: 'Tekst', extensions: ['txt', 'csv', 'tsv'] },
      { name: 'Wszystkie pliki', extensions: ['*'] }
    ]
  })) as { canceled?: boolean; filePaths?: string[] } | undefined;
  const path = res && !res.canceled ? res.filePaths?.[0] : undefined;
  if (!path) return;
  const content = (await window.api.invoke('fs:readTextFile', path)) as string | null;
  if (content) batchText.value = content;
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
  yt.isSearching = false;
}

async function resolveLink() {
  const url = input.value.trim();
  if (!url) return;
  openDiscover();
  yt.isResolving = true;
  resolveError.value = '';
  addedFlash.value = false;
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
    flashAdded();
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
    flashAdded();
  } else {
    configTarget.value = { mode: 'single', video: item };
  }
}

function quickQueueVideo(v: YouTubeVideo) {
  if (settings.download.smartMode) {
    void yt.queueVideo(v);
    flashAdded();
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
  flashAdded();
}

function closeQueueConfig() {
  configTarget.value = null;
}

function flashAdded() {
  addedFlash.value = true;
  window.setTimeout(() => {
    addedFlash.value = false;
  }, 1500);
}

function openChannelFromVideo(v: YouTubeVideo) {
  if (!v.channelId) return;
  yt.openChannel(`https://www.youtube.com/channel/${v.channelId}`);
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

function onDrop(e: DragEvent) {
  const text = e.dataTransfer?.getData('text/plain')?.trim();
  if (!text) return;
  input.value = text;
  void submit();
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
    <div class="p-4 border-b border-border-default">
      <div class="flex items-center gap-3 mb-3">
        <Tv2 :size="24" class="text-red-base" />
        <h1 class="text-xl font-bold">{{ $t('youtube.title') }}</h1>
      </div>

      <div class="flex gap-2 mb-2">
        <div class="relative flex-1">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            v-model="input"
            :placeholder="$t('youtube.pasteOrSearch')"
            class="w-full pl-9 pr-3 py-2.5 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
            @keydown.enter="submit"
            @dragover.prevent
            @drop.prevent="onDrop"
          />
        </div>
        <button
          class="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          :class="
            isResolvable
              ? 'bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover'
              : 'bg-accent-base text-white hover:bg-accent-hover'
          "
          :disabled="yt.isResolving || yt.isSearching"
          @click="submit"
        >
          {{
            yt.isResolving
              ? $t('youtube.resolving')
              : $t(isResolvable ? 'youtube.resolve' : 'youtube.search')
          }}
        </button>
        <button
          class="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border"
          :class="
            batchOpen
              ? 'border-accent-base text-accent-base'
              : 'border-border-default text-fg-muted hover:bg-bg-hover'
          "
          @click="batchOpen = !batchOpen"
        >
          {{ $t('youtube.batch') }}
        </button>
      </div>

      <div v-if="batchOpen" class="mb-2">
        <textarea
          v-model="batchText"
          :placeholder="$t('youtube.batchPlaceholder')"
          rows="4"
          class="w-full px-3 py-2.5 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint resize-y"
        />
        <div class="flex items-center gap-2 mt-2">
          <span class="text-xs text-fg-faint">
            {{ $t('youtube.batchDetected', { count: batchEntries.length }) }}
          </span>
          <select
            v-if="profiles.length"
            v-model="batchProfileId"
            class="px-2 py-1 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
          >
            <option value="">{{ $t('youtube.profileNone') }}</option>
            <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <div class="flex-1" />
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
            @click="importBatchFile"
          >
            {{ $t('youtube.batchImport') }}
          </button>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            :disabled="!batchEntries.length || batchBusy"
            @click="submitBatch"
          >
            <Download :size="12" />
            {{ $t('youtube.batchAdd') }}
          </button>
        </div>
        <p v-if="batchResult" class="text-xs text-green-base mt-1">{{ batchResult }}</p>
        <ul v-if="batchEntries.length" class="mt-2 max-h-40 overflow-auto space-y-1">
          <li
            v-for="e in batchEntries"
            :key="e.url"
            class="flex items-center gap-2 text-xs text-fg-muted"
          >
            <span
              class="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
              :class="
                e.kind === 'video'
                  ? 'bg-accent-ghost text-accent-base'
                  : e.kind === 'playlist'
                    ? 'bg-amber-base/15 text-amber-base'
                    : 'bg-green-base/15 text-green-base'
              "
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
            </span>
            <span class="truncate">{{ e.url }}</span>
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-xs text-fg-faint">{{ $t('youtube.quickDownload') }}</span>
        <div class="flex gap-1 bg-bg-elevated rounded-xl p-1">
          <button
            v-for="k in ['audio', 'video'] as const"
            :key="k"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            :class="
              settings.download.defaultKind === k
                ? 'bg-accent-base text-white'
                : 'text-fg-muted hover:text-fg-base'
            "
            @click="settings.updateDownload({ defaultKind: k })"
          >
            {{ k === 'audio' ? $t('youtube.prefAudio') : $t('youtube.prefVideo') }}
          </button>
        </div>
        <select
          v-if="settings.download.defaultKind === 'audio'"
          class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
          :value="settings.download.defaultAudioFormat"
          @change="
            settings.updateDownload({
              defaultAudioFormat: ($event.target as HTMLSelectElement).value as any
            })
          "
        >
          <option v-for="f in audioFormats" :key="f" :value="f">
            {{ f === 'best' ? $t('settings.audioNative') : f }}
          </option>
        </select>
        <select
          v-else
          class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
          :value="settings.download.defaultVideoQuality"
          @change="
            settings.updateDownload({
              defaultVideoQuality: ($event.target as HTMLSelectElement).value as any
            })
          "
        >
          <option v-for="q in videoQualities" :key="q" :value="q">{{ q }}</option>
        </select>
        <select
          v-if="settings.download.defaultKind === 'video'"
          class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
          :value="settings.download.defaultVideoContainer"
          @change="
            settings.updateDownload({
              defaultVideoContainer: ($event.target as HTMLSelectElement).value as any
            })
          "
        >
          <option v-for="c in videoContainers" :key="c" :value="c">{{ c }}</option>
        </select>
        <select
          v-if="settings.download.defaultKind === 'audio'"
          class="px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
          :value="settings.download.defaultAudioQuality"
          @change="
            settings.updateDownload({
              defaultAudioQuality: ($event.target as HTMLSelectElement).value as any
            })
          "
        >
          <option v-for="q in ['best', 'high', 'medium', 'low'] as const" :key="q" :value="q">
            {{ $t('settings.audioQuality.' + q) }}
          </option>
        </select>
      </div>

      <div class="flex gap-4 border-b border-border-default">
        <button
          class="py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            activeSection === 'discover'
              ? 'border-accent-base text-fg-base'
              : 'border-transparent text-fg-faint hover:text-fg-muted'
          "
          @click="openDiscover"
        >
          {{ $t('youtube.discoverTab') }}
        </button>
        <button
          class="py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5"
          :class="
            activeSection === 'subscriptions'
              ? 'border-accent-base text-fg-base'
              : 'border-transparent text-fg-faint hover:text-fg-muted'
          "
          @click="openSubscriptions"
        >
          <Bell :size="14" />
          {{ $t('youtube.subscriptionsTab') }}
          <span v-if="yt.subscriptions.length" class="text-xs text-fg-faint">
            {{ yt.subscriptions.length }}
          </span>
        </button>
      </div>

      <p v-if="resolveError" class="text-xs text-red-400 mb-2">{{ resolveError }}</p>
      <p v-if="searchError" class="text-xs text-red-400 mb-2">{{ searchError }}</p>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <div v-if="activeSection === 'subscriptions'" class="space-y-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-medium">{{ $t('youtube.subscriptionsHeading') }}</h2>
            <span
              v-if="yt.subscriptions.length"
              class="text-xs text-fg-faint bg-bg-elevated border border-border-default px-2 py-0.5 rounded-full"
            >
              {{ yt.subscriptions.length }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-70"
              :title="$t('youtube.downloadAllSubsTitle')"
              :disabled="yt.queueingChannelId !== null"
              @click="downloadAllPending"
            >
              <RefreshCw v-if="yt.queueingChannelId !== null" :size="12" class="animate-spin" />
              <Download v-else :size="12" />
              {{
                yt.queueingChannelId !== null
                  ? $t('youtube.downloading')
                  : $t('youtube.downloadAllSubs')
              }}
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
              :disabled="yt.checkingSubscriptions"
              @click="yt.checkSubscriptionsNow"
            >
              <RefreshCw :size="12" :class="yt.checkingSubscriptions ? 'animate-spin' : ''" />
              {{ $t('youtube.checkNow') }}
            </button>
          </div>
        </div>

        <div v-if="!yt.subscriptionsLoaded" class="flex justify-center py-16">
          <div
            class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
          />
        </div>

        <div
          v-else-if="yt.subscriptions.length === 0"
          class="flex flex-col items-center justify-center py-16 text-fg-faint"
        >
          <Bell :size="48" class="mb-3 opacity-20" />
          <p class="text-sm">{{ $t('youtube.noSubscriptions') }}</p>
        </div>

        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div
            v-for="sub in yt.subscriptions"
            :key="sub.channelId"
            class="rounded-2xl border border-border-default bg-bg-elevated overflow-hidden flex flex-col"
          >
            <div class="flex items-center gap-3 p-3">
              <button
                class="shrink-0 w-11 h-11 rounded-full overflow-hidden bg-bg-base"
                :title="sub.channelTitle"
                @click="openChannelFromSubscription(sub.channelId)"
              >
                <img
                  v-if="sub.channelThumbnail"
                  :src="sub.channelThumbnail"
                  :alt="sub.channelTitle"
                  class="w-full h-full object-cover"
                />
                <Tv2 v-else :size="20" class="w-full h-full p-2 text-fg-faint" />
              </button>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <button
                    class="text-sm font-medium truncate hover:text-accent-base transition-colors"
                    @click="openChannelFromSubscription(sub.channelId)"
                  >
                    {{ sub.channelTitle }}
                  </button>
                  <span
                    v-if="sub.pendingCount != null && sub.pendingCount > 0"
                    class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-green-base/15 text-green-base font-medium"
                    :title="$t('youtube.remainingCountTitle')"
                  >
                    {{ $t('youtube.remainingCount', { count: sub.pendingCount }) }}
                  </span>
                  <span
                    v-if="sub.newArrivals != null && sub.newArrivals > 0"
                    class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-base/15 text-amber-base font-medium"
                    :title="$t('youtube.newArrivalsTitle')"
                  >
                    {{ $t('youtube.newCount', { count: sub.newArrivals }) }}
                  </span>
                </div>
                <p class="text-[11px] text-fg-faint mt-0.5">
                  <template v-if="sub.lastChecked">
                    {{ $t('youtube.lastChecked') }} {{ lastCheckedLabel(sub) }}
                  </template>
                  <template v-else>{{ $t('youtube.notCheckedYet') }}</template>
                </p>
              </div>
              <button
                class="p-2 rounded-lg text-fg-faint hover:text-red-base hover:bg-bg-hover transition-colors shrink-0"
                :title="$t('youtube.unsubscribeChannel')"
                @click="yt.unfollowChannel(sub.channelId)"
              >
                <X :size="14" />
              </button>
            </div>

            <div class="mt-auto px-3 pb-3 flex items-center gap-2 flex-wrap">
              <label
                class="flex items-center gap-1.5 text-xs text-fg-faint shrink-0 cursor-pointer select-none"
                :title="$t('youtube.autoDownloadTitle')"
              >
                <input
                  type="checkbox"
                  class="accent-accent-base"
                  :checked="sub.autoDownload"
                  @change="
                    yt.setAutoDownload(sub.channelId, ($event.target as HTMLInputElement).checked)
                  "
                />
                <span>{{ $t('youtube.autoDownload') }}</span>
              </label>
              <div class="flex-1" />
              <button
                class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors shrink-0 disabled:opacity-70"
                :title="$t('youtube.downloadAllTitle')"
                :disabled="yt.queueingChannelId === sub.channelId"
                @click="downloadSubscriptionAll(sub)"
              >
                <RefreshCw
                  v-if="yt.queueingChannelId === sub.channelId"
                  :size="12"
                  class="animate-spin"
                />
                <Download v-else :size="12" />
                {{
                  yt.queueingChannelId === sub.channelId
                    ? $t('youtube.downloading')
                    : $t('youtube.downloadAll')
                }}
              </button>
              <button
                class="p-2 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors shrink-0 disabled:opacity-50"
                :title="$t('youtube.checkChannelNow')"
                :disabled="yt.checkingChannelId === sub.channelId"
                @click="yt.checkChannelNow(sub.channelId)"
              >
                <RefreshCw
                  :size="14"
                  :class="yt.checkingChannelId === sub.channelId ? 'animate-spin' : ''"
                />
              </button>
              <button
                class="p-2 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors shrink-0"
                :title="$t('youtube.downloadPrefs')"
                @click="togglePrefs(sub.channelId)"
              >
                <ChevronDown
                  :size="14"
                  :class="prefsOpen === sub.channelId ? 'rotate-180' : ''"
                  class="transition-transform"
                />
              </button>
            </div>

            <div v-if="prefsOpen === sub.channelId" class="px-3 pb-3 pt-0">
              <div class="border-t border-border-default pt-3">
                <p class="text-[11px] text-fg-faint mb-2">{{ $t('youtube.downloadPrefsHint') }}</p>
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-[11px] text-fg-faint">{{ $t('youtube.profilesSection') }}</span>
                  <select
                    class="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :value="sub.downloadPrefs?.profileId || ''"
                    @change="onProfilePref(sub, $event)"
                  >
                    <option value="">{{ $t('youtube.profileNone') }}</option>
                    <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.prefKind') }}
                    <select
                      class="mt-1 w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :value="sub.downloadPrefs?.kind || settings.download.defaultKind"
                      @change="onKindPref(sub, $event)"
                    >
                      <option value="audio">{{ $t('youtube.prefAudio') }}</option>
                      <option value="video">{{ $t('youtube.prefVideo') }}</option>
                    </select>
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.prefFormat') }}
                    <select
                      class="mt-1 w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :value="sub.downloadPrefs?.format || settings.download.defaultAudioFormat"
                      @change="onFormatPref(sub, $event)"
                    >
                      <option v-for="f in audioFormats" :key="f" :value="f">
                        {{ f === 'best' ? $t('settings.audioNative') : f }}
                      </option>
                    </select>
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.prefQuality') }}
                    <select
                      class="mt-1 w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :value="sub.downloadPrefs?.quality || settings.download.defaultVideoQuality"
                      @change="onQualityPref(sub, $event)"
                    >
                      <option v-for="q in videoQualities" :key="q" :value="q">{{ q }}</option>
                    </select>
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('settings.defaultAudioQuality') }}
                    <select
                      class="mt-1 w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :value="
                        sub.downloadPrefs?.audioQuality || settings.download.defaultAudioQuality
                      "
                      @change="onAudioQualityPref(sub, $event)"
                    >
                      <option
                        v-for="q in ['best', 'high', 'medium', 'low'] as const"
                        :key="q"
                        :value="q"
                      >
                        {{ $t('settings.audioQuality.' + q) }}
                      </option>
                    </select>
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('settings.defaultCover') }}
                    <select
                      class="mt-1 w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :value="sub.downloadPrefs?.cover?.type || settings.download.defaultCover"
                      @change="onCoverPref(sub, $event)"
                    >
                      <option value="thumbnail">{{ $t('settings.cover.thumbnail') }}</option>
                      <option value="none">{{ $t('settings.cover.none') }}</option>
                      <option value="frame">{{ $t('settings.cover.frame') }}</option>
                      <option value="clip">{{ $t('settings.cover.clip') }}</option>
                    </select>
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.prefTemplate') }}
                    <input
                      class="mt-1 w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :value="sub.downloadPrefs?.filenameTemplate || ''"
                      :placeholder="
                        settings.download.filenameTemplate || $t('youtube.prefTemplatePlaceholder')
                      "
                      @change="
                        onPrefsChange(sub, {
                          filenameTemplate: ($event.target as HTMLInputElement).value || undefined
                        })
                      "
                    />
                    <div class="mt-1.5">
                      <FilenameTemplatePresets
                        @preset="onPrefsChange(sub, { filenameTemplate: $event || undefined })"
                      />
                    </div>
                  </label>
                  <label
                    class="flex items-center gap-2 text-xs text-fg-faint sm:col-span-2 cursor-pointer select-none"
                    :title="$t('youtube.addToLibraryPrefDesc')"
                  >
                    <input
                      type="checkbox"
                      class="accent-accent-base"
                      :checked="
                        sub.downloadPrefs?.addToLibrary ?? settings.download.autoAddDownloadFolder
                      "
                      @change="onAddToLibraryPref(sub, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>{{ $t('youtube.addToLibraryPref') }}</span>
                  </label>
                  <label class="block text-xs text-fg-faint sm:col-span-4">
                    {{ $t('youtube.prefSubs') }}
                    <input
                      class="mt-1 w-full px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :value="sub.downloadPrefs?.subsLangs || ''"
                      :placeholder="
                        (settings.download.defaultSubs && settings.download.defaultSubsLangs) ||
                        $t('youtube.subsLangsPlaceholder')
                      "
                      @change="
                        onPrefsChange(sub, {
                          subsLangs: ($event.target as HTMLInputElement).value || undefined
                        })
                      "
                    />
                  </label>
                  <label class="block text-xs text-fg-faint sm:col-span-4">
                    {{ $t('youtube.metaSection') }}
                    <div class="mt-1 grid grid-cols-3 gap-3">
                      <input
                        class="px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                        :value="sub.downloadPrefs?.metaOverride?.artist || ''"
                        :placeholder="$t('youtube.metaArtist')"
                        @change="
                          onMetaChange(sub, 'artist', ($event.target as HTMLInputElement).value)
                        "
                      />
                      <input
                        class="px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                        :value="sub.downloadPrefs?.metaOverride?.album || ''"
                        :placeholder="$t('youtube.metaAlbum')"
                        @change="
                          onMetaChange(sub, 'album', ($event.target as HTMLInputElement).value)
                        "
                      />
                      <input
                        class="px-2 py-1.5 rounded-lg bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                        :value="sub.downloadPrefs?.metaOverride?.year || ''"
                        :placeholder="$t('youtube.metaYear')"
                        @change="
                          onMetaChange(sub, 'year', ($event.target as HTMLInputElement).value)
                        "
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <YouTubeChannelView v-else-if="yt.channelLoading || yt.channel" />

      <template v-else>
        <div v-if="yt.resolved" class="mb-8">
          <div class="flex items-center gap-3 mb-3">
            <span
              class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
              :class="kindBadgeClass"
            >
              {{ $t(kindKey) }}
            </span>
            <h2 class="text-sm font-medium truncate flex-1">{{ yt.resolved.title }}</h2>
            <div
              v-if="yt.resolvedLoading"
              class="flex items-center gap-2 shrink-0"
              :title="$t('youtube.resolving')"
            >
              <div
                class="w-3.5 h-3.5 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
              />
              <span v-if="yt.resolved.meta.totalItems != null" class="text-xs text-fg-faint">
                {{ yt.resolved.items.length }} / {{ yt.resolved.meta.totalItems }}
              </span>
              <span v-else class="text-xs text-fg-faint">
                {{ yt.resolved.items.length }}
              </span>
            </div>
            <span v-if="yt.resolved.meta.totalItems != null" class="text-xs text-fg-faint shrink-0">
              {{ $t('youtube.itemsCount', { count: yt.resolved.meta.totalItems }) }}
            </span>
            <button
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors shrink-0"
              @click="clearResolved"
            >
              <X :size="12" />
              {{ $t('youtube.clear') }}
            </button>
          </div>

          <div v-if="yt.resolved.items.length === 0" class="text-sm text-fg-faint py-8 text-center">
            {{ $t('youtube.itemsCount', { count: 0 }) }}
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="item in yt.resolved.items"
              :key="item.id"
              class="flex gap-3 p-2 rounded-xl hover:bg-bg-hover transition-colors group items-center"
              :class="expandedResolvedId === item.id ? 'flex-col items-stretch' : ''"
              @click="toggleExpandResolved(item)"
            >
              <div v-if="expandedResolvedId === item.id" class="w-full">
                <YouTubeEmbedPlayer
                  :video-id="item.id"
                  :title="item.title"
                  :channel-title="item.channelTitle"
                  :source-url="watchUrl(item.id)"
                  @open-window="openWatchWindow(item.id)"
                  @close="expandedResolvedId = null"
                />
              </div>
              <button
                v-if="yt.resolved.kind !== 'video'"
                class="shrink-0 flex items-center justify-center w-5 h-5 rounded border transition-colors"
                :class="
                  yt.selectedResolved.has(item.id)
                    ? 'bg-accent-base border-accent-base text-white'
                    : 'border-border-default hover:border-accent-base'
                "
                @click.stop="toggleSelect(item.id)"
              >
                <Check v-if="yt.selectedResolved.has(item.id)" :size="12" />
              </button>
              <button
                class="w-32 aspect-video rounded-lg bg-bg-elevated overflow-hidden shrink-0 relative"
                :title="$t('youtube.play')"
                :disabled="item.isPlayable === false"
                @click.stop="toggleExpandResolved(item)"
              >
                <img
                  v-if="item.thumbnail"
                  :src="item.thumbnail"
                  :alt="item.title"
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
                <div
                  v-if="item.duration"
                  class="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded"
                >
                  {{ item.duration }}
                </div>
                <div
                  v-if="yt.coverStatusFor(item.id) === 'fetching'"
                  class="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-base text-white text-[10px] font-medium"
                  :title="$t('downloads.coverStatusFetching')"
                >
                  <RefreshCw :size="10" class="animate-spin" />
                </div>
                <div
                  class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
                >
                  <div
                    v-if="item.isPlayable !== false"
                    class="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Play :size="28" class="text-white drop-shadow" fill="white" />
                  </div>
                </div>
              </button>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium line-clamp-1 mb-0.5">{{ item.title }}</h3>
                <button
                  v-if="item.channelId"
                  class="text-xs text-fg-faint hover:text-accent-base transition-colors"
                  @click.stop="yt.openChannel(`https://www.youtube.com/channel/${item.channelId}`)"
                >
                  {{ item.channelTitle }}
                </button>
                <p v-else class="text-xs text-fg-faint">{{ item.channelTitle }}</p>
              </div>
              <button
                v-if="item.isPlayable !== false"
                class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover hover:text-accent-base transition-colors shrink-0"
                :title="expandedResolvedId === item.id ? $t('nav.collapse') : $t('youtube.play')"
                @click.stop="toggleExpandResolved(item)"
              >
                <X v-if="expandedResolvedId === item.id" :size="12" />
                <Play v-else :size="12" />
              </button>
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors shrink-0 disabled:opacity-70"
                :disabled="itemDownloadState(item.id) !== null"
                @click.stop="quickQueueResolved(item)"
              >
                <RefreshCw
                  v-if="
                    itemDownloadState(item.id) === 'queuing' ||
                    itemDownloadState(item.id) === 'downloading'
                  "
                  :size="12"
                  class="animate-spin"
                />
                <Check v-else-if="itemDownloadState(item.id) === 'done'" :size="12" />
                <Download v-else :size="12" />
                {{
                  itemDownloadState(item.id) === 'downloading'
                    ? $t('youtube.downloading')
                    : itemDownloadState(item.id) === 'queuing'
                      ? $t('youtube.queuing')
                      : itemDownloadState(item.id) === 'done'
                        ? $t('youtube.downloaded')
                        : $t('youtube.addToQueue')
                }}
              </button>
              <button
                class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover hover:text-fg-base transition-colors shrink-0"
                :title="$t('youtube.downloadOptions')"
                :aria-label="$t('youtube.downloadOptions')"
                @click.stop="queueResolvedItem(item)"
              >
                <SlidersHorizontal :size="12" />
              </button>
            </div>
          </div>

          <div
            v-if="yt.resolved.kind !== 'video' && yt.resolved.items.length"
            class="flex gap-2 mt-3"
          >
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
              @click="toggleSelectAll"
            >
              <CheckSquare :size="12" />
              {{ $t('common.selectAll') }}
            </button>
            <div class="flex items-center gap-1 text-xs text-fg-faint">
              <span>{{ $t('youtube.range') }}</span>
              <input
                v-model.number="rangeStart"
                type="number"
                min="1"
                class="w-14 px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
              />
              <span>-</span>
              <input
                v-model.number="rangeEnd"
                type="number"
                min="1"
                class="w-14 px-2 py-1.5 rounded-lg bg-bg-elevated border border-border-default text-xs focus:border-accent-base focus:outline-none"
              />
              <button
                class="px-2 py-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors"
                @click="selectRange"
              >
                {{ $t('youtube.rangeSelect') }}
              </button>
            </div>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
              :disabled="selectedCount === 0"
              @click="addSelectedToQueue"
            >
              <Download :size="12" />
              {{ $t('youtube.addSelected', { count: selectedCount }) }}
            </button>
          </div>

          <div v-if="yt.resolvedCapped" class="flex justify-center mt-3">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
              :disabled="yt.resolvedLoading"
              @click="yt.loadMoreResolved"
            >
              <RefreshCw v-if="yt.resolvedLoading" :size="12" class="animate-spin" />
              {{ $t('youtube.loadMore') }}
            </button>
          </div>

          <div v-if="addedFlash" class="mt-3 flex items-center gap-1.5 text-xs text-green-base">
            <Check :size="12" />
            {{ $t('youtube.added') }}
          </div>
        </div>

        <div v-if="yt.isSearching" class="flex justify-center py-16">
          <div
            class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
          />
        </div>
        <div
          v-else-if="yt.searchResults.length === 0"
          class="flex flex-col items-center justify-center py-16 text-fg-faint"
        >
          <Tv2 :size="64" class="mb-4 opacity-20" />
          <p class="text-lg font-medium mb-1">{{ $t('youtube.searchHeading') }}</p>
          <p class="text-sm">{{ $t('youtube.discover') }}</p>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="v in yt.pagedResults"
            :key="v.id"
            class="flex gap-3 p-3 rounded-xl hover:bg-bg-hover transition-colors group cursor-pointer"
            :class="expandedSearchId === v.id ? 'flex-col items-stretch' : ''"
            @click="toggleExpandSearch(v.id)"
          >
            <div v-if="expandedSearchId === v.id" class="w-full">
              <YouTubeEmbedPlayer
                :video-id="v.id"
                :title="v.title"
                :channel-title="v.channelTitle"
                :source-url="watchUrl(v.id)"
                @open-window="openWatchWindow(v.id)"
                @close="expandedSearchId = null"
              />
            </div>
            <button
              class="w-40 aspect-video rounded-lg bg-bg-elevated overflow-hidden shrink-0 relative"
              :title="$t('youtube.play')"
              @click.stop="toggleExpandSearch(v.id)"
            >
              <img
                v-if="v.thumbnail"
                :src="v.thumbnail"
                :alt="v.title"
                loading="lazy"
                class="w-full h-full object-cover"
              />
              <div
                class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
              >
                <Play :size="32" class="text-white" fill="white" />
              </div>
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
            </button>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium line-clamp-2 mb-1">{{ v.title }}</h3>
              <div class="text-xs text-fg-faint">
                <button
                  v-if="v.channelId"
                  class="hover:text-accent-base transition-colors"
                  @click.stop="openChannelFromVideo(v)"
                >
                  {{ v.channelTitle }}
                </button>
                <span v-else>{{ v.channelTitle }}</span>
                <span v-if="v.viewCount">
                  · {{ formatNumber(v.viewCount) }} {{ $t('youtube.views') }}</span
                >
              </div>
              <p class="text-xs text-fg-faint mt-1 line-clamp-2">{{ v.description }}</p>
            </div>
            <div
              class="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <button
                class="p-2 rounded-lg bg-accent-base text-white hover:bg-accent-hover transition-colors"
                :title="expandedSearchId === v.id ? $t('nav.collapse') : $t('youtube.play')"
                @click.stop="toggleExpandSearch(v.id)"
              >
                <X v-if="expandedSearchId === v.id" :size="14" />
                <Play v-else :size="14" />
              </button>
              <button
                class="p-2 rounded-lg bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-70"
                :title="$t('youtube.addToQueue')"
                :disabled="itemDownloadState(v.id) !== null"
                @click.stop="quickQueueVideo(v)"
              >
                <RefreshCw
                  v-if="
                    itemDownloadState(v.id) === 'queuing' ||
                    itemDownloadState(v.id) === 'downloading'
                  "
                  :size="14"
                  class="animate-spin"
                />
                <Check v-else-if="itemDownloadState(v.id) === 'done'" :size="14" />
                <Download v-else :size="14" />
              </button>
              <button
                class="p-2 rounded-lg bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover transition-colors"
                :title="$t('youtube.downloadOptions')"
                @click.stop="queueChannelVideo(v)"
              >
                <SlidersHorizontal :size="14" />
              </button>
              <button
                class="p-2 rounded-lg bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover hover:text-accent-base transition-colors"
                :title="$t('youtube.openInWindow')"
                @click.stop="openWatchWindow(v.id)"
              >
                <ExternalLink :size="14" />
              </button>
            </div>
          </div>

          <div v-if="pageTotal > 1" class="flex items-center justify-center gap-3 pt-2">
            <button
              class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-40"
              :disabled="!yt.hasPrevPage"
              @click="yt.prevSearchPage"
            >
              <ChevronLeft :size="16" />
            </button>
            <span class="text-xs text-fg-faint">
              {{ $t('youtube.pageOf', { current: yt.searchPage + 1, total: pageTotal }) }}
            </span>
            <button
              class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-40"
              :disabled="!yt.hasNextPage"
              @click="yt.nextSearchPage"
            >
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </template>
    </div>

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
