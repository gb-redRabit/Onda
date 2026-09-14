<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Radio, X, RefreshCw, AlertCircle } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useSettingsStore } from '@renderer/stores/settings';
import { useUIStore } from '@renderer/stores/ui';
import { useSavedStore } from '@renderer/stores/saved';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { useOnlineSearch } from '@renderer/composables/useOnlineSearch';
import { useOnlineSavedPlaylist } from '@renderer/composables/useOnlineSavedPlaylist';
import { useOnlineSubscriptions } from '@renderer/composables/useOnlineSubscriptions';
import { useOnlineBatch } from '@renderer/composables/useOnlineBatch';
import { useOnlineDialogs } from '@renderer/composables/useOnlineDialogs';
import { buildQueueExtra, type QueueConfigPayload } from '@renderer/utils/onlineQueueExtra';
import LoaderSpinner from '@renderer/components/LoaderSpinner.vue';
import { detectPlatform } from '@shared/platform';
import {
  configDialogTitle as resolveConfigDialogTitle,
  configDialogChannelTitle as resolveConfigDialogChannelTitle,
  configDialogPlaylistTitle as resolveConfigDialogPlaylistTitle,
  configDialogPlatform as resolveConfigDialogPlatform
} from '@renderer/utils/onlineConfigDialog';
import OnlineSearchBar from '@renderer/components/online/OnlineSearchBar.vue';
import OnlineViewTabs from '@renderer/components/online/OnlineViewTabs.vue';
import OnlineButton from '@renderer/components/online/OnlineButton.vue';
import OnlineSubscriptionsPanel from '@renderer/components/online/OnlineSubscriptionsPanel.vue';
import OnlineBatchPanel from '@renderer/components/online/OnlineBatchPanel.vue';
import OnlineSearchResultsPanel from '@renderer/components/online/OnlineSearchResultsPanel.vue';
import OnlineResolvedPanel from '@renderer/components/online/OnlineResolvedPanel.vue';
import OnlineConfirmDialog from '@renderer/components/online/OnlineConfirmDialog.vue';
import YTAuthButton from '@renderer/components/online/YTAuthButton.vue';
import type { YouTubeVideo, YouTubeResolvedItem } from '@renderer/types/online';

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
const {
  activeSection,
  prefsOpen,
  unfollowTarget,
  openDiscover,
  togglePrefs,
  openChannelFromSubscription,
  downloadSubscriptionAll,
  downloadAllPending
} = useOnlineSubscriptions();
const { searchError, resolveError, submit } = useOnlineSearch(input, t, openDiscover);
const { expandedSearchId, expandedResolvedId, configTarget, openWatchUrl, onKeydown } =
  useOnlineDialogs(input, prefsOpen, unfollowTarget);
const { savingPlaylist, saveResolvedPlaylist, resolvedSaved } = useOnlineSavedPlaylist();
const rangeStart = ref(1);
const rangeEnd = ref(100);
const {
  batchOpen,
  batchText,
  batchBusy,
  batchResult,
  batchProfileId,
  batchEntries,
  batchSkippedCount,
  batchHasSc,
  submitBatch,
  importBatchFile
} = useOnlineBatch();

const configDialogTitle = computed(() =>
  resolveConfigDialogTitle(configTarget.value, yt.selectedResolved.size, t)
);

const configDialogChannelTitle = computed(() =>
  resolveConfigDialogChannelTitle(configTarget.value, yt.resolved)
);

const configDialogPlaylistTitle = computed(() =>
  resolveConfigDialogPlaylistTitle(configTarget.value, yt.resolved)
);

const configDialogPlatform = computed(() =>
  resolveConfigDialogPlatform(configTarget.value, yt.resolved, yt.itemUrl)
);

const selectedCount = computed(() => yt.selectedResolved.size);

function confirmUnfollow(channelId: string) {
  unfollowTarget.value = channelId;
}

function onUnfollowConfirm() {
  if (unfollowTarget.value) {
    yt.unfollowChannel(unfollowTarget.value);
  }
  unfollowTarget.value = null;
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

function confirmQueueConfig(payload: QueueConfigPayload) {
  const extra = buildQueueExtra(payload);
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
