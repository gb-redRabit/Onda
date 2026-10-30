<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { Download, Radio, X, RefreshCw } from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useProvidersStore } from '@renderer/stores/providers';
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
import ProviderPanel from '@renderer/components/online/providers/ProviderPanel.vue';
import ProviderSubscriptionsPanel from '@renderer/components/online/providers/ProviderSubscriptionsPanel.vue';
import OnlineBatchPanel from '@renderer/components/online/OnlineBatchPanel.vue';
import OnlineSearchResultsPanel from '@renderer/components/online/OnlineSearchResultsPanel.vue';
import OnlineResolvedPanel from '@renderer/components/online/OnlineResolvedPanel.vue';
import OnlineConfirmDialog from '@renderer/components/online/OnlineConfirmDialog.vue';
import OnlineChannelError from '@renderer/components/online/OnlineChannelError.vue';
import YTAuthButton from '@renderer/components/online/YTAuthButton.vue';
import PageHeader from '@renderer/components/ui/PageHeader.vue';

// Ciężkie dialogi/widoki są ładowane leniwie, żeby nie rozdymały chunka Online
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
const providerStore = useProvidersStore();
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
const { searchError, resolveError, submit, cancelPending } = useOnlineSearch(
  input,
  t,
  openDiscover,
  handleProviderLink
);

// Auto-detekcja providera w GLOBALNYM pasku: gdy wklejony link należy do providera
// (PikPak/MEGA/Drive…), przełącz na zakładkę „Linki" i wczytaj jego zawartość.
async function handleProviderLink(url: string): Promise<boolean> {
  const ok = await providerStore.detect(url);
  if (!ok) return false;
  cancelPending();
  searchError.value = '';
  resolveError.value = '';
  yt.setResolved(null);
  yt.setResults([]);
  yt.closeChannel();
  activeSection.value = 'links';
  input.value = '';
  return true;
}

// Otwiera link z subskrypcji linków: przełącz na „Linki" i wczytaj zawartość.
function openProviderSub(url: string): void {
  cancelPending();
  searchError.value = '';
  resolveError.value = '';
  activeSection.value = 'links';
  input.value = '';
  void providerStore.detect(url);
}
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

function openChannelInApp(url: string): void {
  cancelPending();
  searchError.value = '';
  resolveError.value = '';
  activeSection.value = 'discover';
  input.value = url;
  void yt.openChannel(url);
}

function openSubscriptionChannel(channelId: string): void {
  cancelPending();
  openChannelFromSubscription(channelId);
}

function onPrefsConfirm(payload: { prefs?: Parameters<typeof yt.setDownloadPrefs>[1] }) {
  const target = prefsOpen.value;
  if (!target) return;
  void yt.setDownloadPrefs(target.channelId, payload.prefs || {});
  prefsOpen.value = null;
}
</script>

<template>
  <div data-testid="online-view" class="flex flex-col h-full">
    <PageHeader :title="$t('nav.online')" :icon="Radio" sticky>
      <template #actions>
        <YTAuthButton />
      </template>

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
            :disabled="yt.queueingChannelIds.size > 0"
            :title="$t('youtube.downloadAllSubsTitle')"
            @click="downloadAllPending"
          >
            <RefreshCw v-if="yt.queueingChannelIds.size > 0" :size="12" class="animate-spin" />
            <Download v-else :size="12" />
            {{
              yt.queueingChannelIds.size > 0
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
        <template v-else-if="activeSection === 'links'">
          <OnlineButton
            v-if="providerStore.detected"
            variant="secondary"
            size="sm"
            @click="providerStore.reset()"
          >
            <X :size="12" />
            {{ $t('youtube.clear') }}
          </OnlineButton>
        </template>
        <template v-else>
          <OnlineButton v-if="yt.resolved" variant="secondary" size="sm" @click="clearResolved">
            <X :size="12" />
            {{ $t('youtube.clear') }}
          </OnlineButton>
        </template>
      </OnlineViewTabs>

      <p v-if="resolveError" class="text-xs text-error mt-3">{{ resolveError }}</p>
      <p v-if="searchError" class="text-xs text-error mt-3">{{ searchError }}</p>
    </PageHeader>

    <div
      :id="'online-panel-' + activeSection"
      class="flex-1 min-h-0"
      role="tabpanel"
      :aria-labelledby="'online-tab-' + activeSection"
    >
      <div v-if="activeSection === 'subscriptions'" class="h-full overflow-auto p-4">
        <OnlineSubscriptionsPanel
          :subscriptions="yt.subscriptions"
          :loaded="yt.subscriptionsLoaded"
          :checking-channel-id="yt.checkingChannelId"
          :is-queuing="yt.isChannelQueuing"
          @open-channel="openSubscriptionChannel"
          @download-all="downloadSubscriptionAll"
          @check-now="yt.checkChannelNow"
          @toggle-auto-download="yt.setAutoDownload"
          @open-prefs="togglePrefs"
          @unfollow="confirmUnfollow"
          @discover="activeSection = 'discover'"
        />
        <ProviderSubscriptionsPanel class="mt-4" @open="openProviderSub" />
      </div>

      <div v-else-if="activeSection === 'links'" class="h-full overflow-auto p-4">
        <ProviderPanel />
      </div>

      <OnlineChannelView v-else-if="yt.channelLoading || yt.channel" class="h-full" />

      <div v-else-if="yt.channelError" class="h-full overflow-auto p-4">
        <OnlineChannelError :message="yt.channelError" @retry="submit" />
      </div>

      <OnlineResolvedPanel
        v-else-if="yt.resolved"
        v-model:expanded-id="expandedResolvedId"
        v-model:range-start="rangeStart"
        v-model:range-end="rangeEnd"
        class="h-full"
        :resolved-loading="yt.resolvedLoading"
        :resolved-capped="yt.resolvedCapped"
        :selected-count="yt.selectedResolved.size"
        :saved="resolvedSaved"
        :saving="savingPlaylist"
        @toggle-select="toggleSelect"
        @quick-queue="quickQueueResolved"
        @options="queueResolvedItem"
        @open-window="openWatchUrl"
        @open-channel="openChannelInApp"
        @download-all="addSelectedToQueue"
        @play-all="yt.playAllStreams(yt.resolved?.items ?? [])"
        @save="saveResolvedPlaylist"
        @clear="clearResolved"
        @select-all="toggleSelectAll"
        @select-range="selectRange"
        @add-selected="addSelectedToQueue"
        @load-more="yt.loadMoreResolved"
      />

      <div v-else class="h-full overflow-auto p-4">
        <OnlineSearchResultsPanel
          v-model:expanded-id="expandedSearchId"
          @quick-queue="quickQueueVideo"
          @options="queueChannelVideo"
          @open-window="openWatchUrl"
          @open-channel="openChannelInApp"
        />
      </div>
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
