<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Folder,
  File as FileIcon,
  Download,
  Check,
  Loader2,
  Play,
  Link2,
  KeyRound,
  LogIn,
  X,
  RefreshCw
} from '@lucide/vue';
import { useProvidersStore } from '@renderer/stores/providers';
import { useProviderSubsStore } from '@renderer/stores/providerSubs';
import { formatFileSize } from '@renderer/utils/formatters';
import { providerLabel } from '@renderer/utils/providerLabels';
import type { RemoteItem } from '@shared/types/providers';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import ProviderIcon from './ProviderIcon.vue';
import OnlineButton from '../OnlineButton.vue';
import OnlineBadge from '../OnlineBadge.vue';
import OnlineConfirmDialog from '../OnlineConfirmDialog.vue';

// Panel „Linki": zawartość providera wklejonego w GLOBALNY pasek Online (auto-detekcja).
// Przeglądanie folderów → pobranie pliku 1:1 (bez wyboru jakości). Zaznacza pobrane pliki.
// Pozwala też zasubskrybować link (z ostrzeżeniem o możliwym wygaśnięciu).

const { t } = useI18n();
const store = useProvidersStore();
const subs = useProviderSubsStore();
const showSubscribe = ref(false);
const showDownloadAll = ref(false);
const pendingFolder = ref<RemoteItem | null>(null);
const bulkMessage = ref('');

// Provider wymagający logowania (cookie) — np. 115/Quark/Baidu/189/Xunlei — lub z opcjonalnym
// logowaniem (Google Drive dla plików prywatnych).
const needsCred = computed(
  () => store.detected?.capabilities.auth === 'cookie' || store.detected?.id === 'gdrive'
);
const credRequired = computed(() => store.detected?.capabilities.auth === 'cookie');
const showCred = ref(false);
const credValue = ref('');
const credHas = ref(false);
const credError = ref('');
watch(
  () => store.detected?.id,
  async (id) => {
    if (!id) {
      credHas.value = false;
      return;
    }
    try {
      const r = (await window.api.invoke('providers:cred:get', id)) as { hasCookie?: boolean };
      credHas.value = !!r?.hasCookie;
    } catch {
      credHas.value = false;
    }
  }
);
async function saveCred(): Promise<void> {
  const id = store.detected?.id;
  if (!id) return;
  credError.value = '';
  const ok = (await window.api.invoke('providers:cred:set', {
    providerId: id,
    cookie: credValue.value.trim()
  })) as boolean;
  if (ok) {
    credHas.value = true;
    showCred.value = false;
    credValue.value = '';
    await store.loadFolder(store.crumbs.length ? store.crumbs[store.crumbs.length - 1].id : null);
  } else {
    credError.value = t('providers.cookieSaveFailed');
  }
}

async function loginCred(): Promise<void> {
  const id = store.detected?.id;
  if (!id) return;
  credError.value = '';
  const res = (await window.api.invoke('providers:cred:login', id)) as {
    success: boolean;
    canceled?: boolean;
    error?: string;
  };
  if (res?.success) {
    credHas.value = true;
    showCred.value = false;
    credValue.value = '';
    await store.loadFolder(store.crumbs.length ? store.crumbs[store.crumbs.length - 1].id : null);
  } else if (res?.error) {
    credError.value = res.error;
  }
}

const sorted = computed<RemoteItem[]>(() => [
  ...[...store.folders].sort((a, b) => a.name.localeCompare(b.name)),
  ...[...store.files].sort((a, b) => (b.size || 0) - (a.size || 0))
]);

// Paginacja: duże foldery renderują się stopniowo (mniej kart naraz).
const PAGE_SIZE = 200;
const visibleCount = ref(PAGE_SIZE);
const visibleItems = computed<RemoteItem[]>(() => sorted.value.slice(0, visibleCount.value));
const hasMore = computed(() => sorted.value.length > visibleCount.value);
watch(
  () => store.items,
  () => {
    visibleCount.value = PAGE_SIZE;
  }
);

function formatSize(bytes?: number): string {
  return bytes && bytes > 0 ? formatFileSize(bytes) : '';
}

function onItem(item: RemoteItem): void {
  if (item.kind === 'folder') void store.openFolder(item);
}

// Folder listings są cache'owane (żeby nie zasypywać serwisu zapytaniami) — odświeżanie
// odbywa się WYŁĄCZNIE ręcznie tym przyciskiem.
function refreshFolder(): void {
  const crumb = store.crumbs[store.crumbs.length - 1];
  void store.loadFolder(crumb ? crumb.id : null, true);
}

async function confirmSubscribe(): Promise<void> {
  const detected = store.detected;
  if (detected) await subs.add(store.url || detected.ref.shareId, detected.label);
  showSubscribe.value = false;
}

async function confirmDownloadAll(): Promise<void> {
  showDownloadAll.value = false;
  const r = await store.downloadFolder();
  bulkMessage.value = r.truncated
    ? t('providers.bulkTruncated', { found: r.found, queued: r.queued })
    : t('providers.bulkQueued', { count: r.queued });
}

async function confirmDownloadFolder(): Promise<void> {
  const folder = pendingFolder.value;
  pendingFolder.value = null;
  if (!folder) return;
  const r = await store.downloadFolderById(folder.id);
  bulkMessage.value = r.truncated
    ? t('providers.bulkTruncated', { found: r.found, queued: r.queued })
    : t('providers.bulkQueued', { count: r.queued });
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="store.error" class="text-xs text-error" data-testid="providers-error">
      {{ store.error }}
    </p>

    <EmptyState
      v-if="!store.detected"
      variant="plain"
      :icon="Link2"
      :title="t('providers.hint')"
      data-testid="providers-hint"
    />

    <template v-if="store.detected">
      <div class="flex flex-wrap items-center gap-2">
        <span class="flex items-center gap-1.5" data-testid="providers-detected">
          <ProviderIcon :provider-id="store.detected.id" :label="store.detected.label" :size="18" />
          <span class="text-xs font-semibold text-primary-text">{{
            providerLabel(store.detected.id, store.detected.label, t)
          }}</span>
        </span>
        <span v-if="store.detected.capabilities.anonymous" class="text-xs text-base-content/50">
          {{ t('providers.anonymous') }}
        </span>
        <span
          v-if="store.detected.capabilities.expiringLink"
          class="text-xs text-warning"
          data-testid="providers-expiring"
        >
          {{ t('providers.expiring') }}
        </span>
        <template v-if="needsCred">
          <OnlineBadge
            :variant="credHas ? 'green' : credRequired ? 'amber' : 'default'"
            size="sm"
            data-testid="providers-cred-state"
          >
            {{
              credHas
                ? t('providers.cookieSet')
                : credRequired
                  ? t('providers.cookieMissing')
                  : t('providers.credentialsOptional')
            }}
          </OnlineBadge>
          <OnlineButton
            variant="secondary"
            size="sm"
            data-testid="providers-cookie"
            @click="showCred = true"
          >
            {{ t('providers.cookie') }}
          </OnlineButton>
        </template>
        <span
          v-if="subs.isSubscribed(store.detected.id, store.detected.ref.shareId)"
          class="ml-auto text-xs text-success"
          data-testid="providers-subscribed"
        >
          {{ t('providers.subscribed') }}
        </span>
        <OnlineButton
          v-else
          variant="secondary"
          size="sm"
          class="ml-auto"
          data-testid="providers-subscribe"
          @click="showSubscribe = true"
        >
          {{ t('providers.subscribe') }}
        </OnlineButton>
        <OnlineButton
          variant="secondary"
          size="sm"
          :title="t('providers.refresh')"
          data-testid="providers-refresh"
          @click="refreshFolder"
        >
          <RefreshCw :size="13" />
        </OnlineButton>
      </div>

      <nav
        v-if="store.crumbs.length"
        class="flex flex-wrap items-center gap-1 text-sm"
        aria-label="breadcrumb"
      >
        <template v-for="(crumb, i) in store.crumbs" :key="i">
          <span v-if="i > 0" class="text-base-content/50">/</span>
          <button
            type="button"
            class="max-w-[16rem] truncate hover:text-primary-text"
            :class="i === store.crumbs.length - 1 ? 'text-base-content' : 'text-base-content/60'"
            @click="store.goToCrumb(i)"
          >
            {{ crumb.name }}
          </button>
        </template>
      </nav>

      <div v-if="store.items.length" class="flex justify-end">
        <OnlineButton
          variant="secondary"
          size="sm"
          data-testid="providers-download-all"
          @click="showDownloadAll = true"
        >
          <Download :size="13" class="mr-1" /> {{ t('providers.downloadAll') }}
        </OnlineButton>
      </div>

      <p v-if="bulkMessage" class="text-xs text-success" data-testid="providers-bulk-message">
        {{ bulkMessage }}
      </p>

      <div v-if="store.loading" class="flex items-center gap-2 py-6 text-sm text-base-content/50">
        <Loader2 :size="16" class="animate-spin" /> {{ t('providers.loading') }}
      </div>

      <EmptyState
        v-else-if="!store.items.length"
        variant="panel"
        :icon="Folder"
        :title="t('providers.empty')"
      />

      <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <template v-for="item in visibleItems" :key="item.id">
          <div
            v-if="item.kind === 'folder'"
            v-activate
            data-testid="providers-folder"
            class="group relative flex cursor-pointer flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3 text-left transition-colors hover:border-primary hover:shadow-lg"
            @click="onItem(item)"
          >
            <div class="flex h-16 items-center justify-center rounded-lg bg-primary/10">
              <Folder :size="28" class="text-primary-text" />
            </div>
            <span class="line-clamp-2 pr-7 text-sm font-medium" :title="item.name">{{
              item.name
            }}</span>
            <span class="mt-auto text-xs text-base-content/50">{{ t('providers.folder') }}</span>
            <button
              type="button"
              class="absolute bottom-2 right-2 rounded-md border border-base-300 p-1 text-base-content/70 transition-colors hover:border-primary hover:text-primary-text"
              data-testid="providers-download-folder"
              :title="t('providers.downloadFolder')"
              @click.stop="pendingFolder = item"
            >
              <Download :size="14" />
            </button>
          </div>

          <div
            v-else
            data-testid="providers-file"
            class="group flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-3"
          >
            <div
              class="relative flex h-24 items-center justify-center overflow-hidden rounded-lg bg-base-content/5"
            >
              <img
                v-if="item.thumbnail"
                :src="item.thumbnail"
                alt=""
                class="h-full w-full object-cover"
                loading="lazy"
              />
              <FileIcon v-else :size="30" class="text-base-content/50" />
              <button
                type="button"
                data-testid="providers-play"
                class="absolute right-1 top-1 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/75 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                :aria-label="t('providers.play')"
                :title="t('providers.play')"
                @click="store.play(item)"
              >
                <Play :size="16" />
              </button>
            </div>
            <span class="line-clamp-2 text-sm font-medium" :title="item.name">{{ item.name }}</span>
            <div class="mt-auto flex items-center justify-between gap-2">
              <span class="truncate text-xs text-base-content/50">{{
                formatSize(item.size) || t('providers.file')
              }}</span>
              <span
                v-if="store.isDownloaded(item.id)"
                class="flex shrink-0 items-center gap-1 text-xs text-success"
                data-testid="providers-downloaded"
              >
                <Check :size="13" /> {{ t('providers.downloaded') }}
              </span>
              <button
                v-else
                type="button"
                data-testid="providers-download"
                class="flex shrink-0 items-center gap-1 rounded-md border border-base-300 px-2 py-1 text-xs text-base-content/80 transition-colors hover:border-primary hover:text-primary-text"
                :title="t('providers.download')"
                @click="store.download(item)"
              >
                <Download :size="13" /> {{ t('providers.download') }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <div v-if="hasMore" class="flex justify-center">
        <button
          type="button"
          class="rounded-md border border-base-300 px-3 py-1.5 text-xs text-base-content/80 hover:border-primary hover:text-primary-text"
          data-testid="providers-show-more"
          @click="visibleCount += PAGE_SIZE"
        >
          {{ t('providers.showMore') }}
        </button>
      </div>
    </template>

    <OnlineConfirmDialog
      v-if="showSubscribe"
      :title="t('providers.subscribeTitle')"
      :message="t('providers.subscribeWarning')"
      :confirm-text="t('providers.subscribe')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmSubscribe"
      @cancel="showSubscribe = false"
    />

    <OnlineConfirmDialog
      v-if="showDownloadAll"
      :title="t('providers.downloadAllTitle')"
      :message="t('providers.downloadAllMessage')"
      :confirm-text="t('providers.downloadAll')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmDownloadAll"
      @cancel="showDownloadAll = false"
    />

    <OnlineConfirmDialog
      v-if="pendingFolder"
      :title="t('providers.downloadFolderTitle')"
      :message="t('providers.downloadFolderMessage', { name: pendingFolder.name })"
      :confirm-text="t('providers.downloadFolder')"
      :cancel-text="t('common.cancel')"
      @confirm="confirmDownloadFolder"
      @cancel="pendingFolder = null"
    />

    <ModalShell
      v-if="showCred"
      labelled-by="provider-cookie-dialog-title"
      backdrop="dim-blur"
      panel-class="w-full max-w-md overflow-hidden"
      @close="showCred = false"
      @escape="showCred = false"
    >
      <div class="flex items-start gap-3 p-5">
        <div
          class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-primary/10 text-primary-text"
        >
          <KeyRound :size="18" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 id="provider-cookie-dialog-title" class="text-sm font-semibold text-base-content">
            {{ t('providers.cookie') }} —
            {{ store.detected ? providerLabel(store.detected.id, store.detected.label, t) : '' }}
          </h3>
          <p class="text-xs text-base-content/70 mt-1">{{ t('providers.cookieHelp') }}</p>
        </div>
        <button
          type="button"
          class="fx-noise p-1 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
          :aria-label="t('common.close')"
          @click="showCred = false"
        >
          <X :size="16" />
        </button>
      </div>

      <div class="px-5 pb-4 space-y-2">
        <textarea
          v-model="credValue"
          rows="3"
          class="w-full rounded-field border border-base-300 bg-base-200/(--glass-alpha) px-3 py-2 text-xs text-base-content fx-depth outline-hidden transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
          :aria-label="t('providers.cookiePlaceholder')"
          :placeholder="t('providers.cookiePlaceholder')"
          data-testid="providers-cookie-input"
        />
        <p v-if="credError" class="text-xs text-error">{{ credError }}</p>
      </div>

      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-300">
        <OnlineButton
          variant="secondary"
          size="sm"
          class="mr-auto"
          data-testid="providers-cookie-login"
          @click="loginCred"
        >
          <LogIn :size="13" />
          {{ t('providers.login') }}
        </OnlineButton>
        <OnlineButton variant="secondary" size="sm" @click="showCred = false">
          {{ t('common.cancel') }}
        </OnlineButton>
        <OnlineButton variant="primary" size="sm" @click="saveCred">
          {{ t('providers.save') }}
        </OnlineButton>
      </div>
    </ModalShell>
  </div>
</template>
