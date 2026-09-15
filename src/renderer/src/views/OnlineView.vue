<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Radio, X, RefreshCw } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useSavedStore } from '@renderer/stores/saved';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { useOnlineSearch } from '@renderer/composables/useOnlineSearch';
import { useOnlineSavedPlaylist } from '@renderer/composables/useOnlineSavedPlaylist';
import { useOnlineSubscriptions } from '@renderer/composables/useOnlineSubscriptions';
import { useOnlineBatch } from '@renderer/composables/useOnlineBatch';
import { useOnlineDialogs } from '@renderer/composables/useOnlineDialogs';
import { useOnlineQueueing } from '@renderer/composables/useOnlineQueueing';
import { useOnlineViewSetup } from '@renderer/composables/useOnlineViewSetup';
import Loader from '@renderer/components/layout/Loader.vue';
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
import OnlineChannelError from '@renderer/components/online/OnlineChannelError.vue';
import YTAuthButton from '@renderer/components/online/YTAuthButton.vue';

// Heavy dialogs/views are lazy-loaded so they don't bloat the Online chunk
// (plan 3.5).
const OnlineChannelView = defineAsyncComponent({
  loader: () => import('@renderer/components/online/OnlineChannelView.vue'),
  loadingComponent: Loader,
  delay: 120
});
const DownloadConfigDialog = defineAsyncComponent(
  () => import('@renderer/components/online/DownloadConfigDialog.vue')
);
const SubscribeConfigDialog = defineAsyncComponent(
  () => import('@renderer/components/online/SubscribeConfigDialog.vue')
);
const yt = useOnlineStore();
const saved = useSavedStore();
void saved.ensureLoaded();
const { profiles } = useDownloadProfiles();
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
  downloadAllPending,
  confirmUnfollow,
  onUnfollowConfirm
} = useOnlineSubscriptions();
const { searchError, resolveError, submit } = useOnlineSearch(input, t, openDiscover);
const { expandedSearchId, expandedResolvedId, configTarget, openWatchUrl, onKeydown, toastAdded } =
  useOnlineDialogs(input, prefsOpen, unfollowTarget);
const rangeStart = ref(1);
const rangeEnd = ref(100);
const {
  toggleSelect,
  toggleSelectAll,
  selectRange,
  addSelectedToQueue,
  queueResolvedItem,
  queueChannelVideo,
  quickQueueResolved,
  quickQueueVideo,
  closeQueueConfig,
  confirmQueueConfig
} = useOnlineQueueing(configTarget, rangeStart, rangeEnd, toastAdded);
useOnlineViewSetup(input, onKeydown);
const { savingPlaylist, saveResolvedPlaylist, resolvedSaved } = useOnlineSavedPlaylist();
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

function clearResolved() {
  yt.setResolved(null);
  resolveError.value = '';
  input.value = '';
}

function onPrefsConfirm(payload: { prefs?: Parameters<typeof yt.setDownloadPrefs>[1] }) {
  const target = prefsOpen.value;
  if (!target) return;
  void yt.setDownloadPrefs(target.channelId, payload.prefs || {});
  prefsOpen.value = null;
}
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

      <OnlineChannelError v-else-if="yt.channelError" :message="yt.channelError" @retry="submit" />

      <template v-else>
        <OnlineResolvedPanel
          v-model:expanded-id="expandedResolvedId"
          v-model:range-start="rangeStart"
          v-model:range-end="rangeEnd"
          :resolved-loading="yt.resolvedLoading"
          :resolved-capped="yt.resolvedCapped"
          :selected-count="yt.selectedResolved.size"
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
      @confirm="onPrefsConfirm"
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
