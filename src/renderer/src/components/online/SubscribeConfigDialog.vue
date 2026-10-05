<script setup lang="ts">
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { ref, computed, onMounted } from 'vue';
import { X, Download, Tv2 } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { useI18n } from 'vue-i18n';
import { useSubscribePrefsForm } from '@renderer/composables/useSubscribePrefsForm';
import SubscribePrefsSummary from './SubscribePrefsSummary.vue';
import SubscribeScopeSelector from './SubscribeScopeSelector.vue';
import SubscribeChannelCard from './SubscribeChannelCard.vue';
import SubscribeSubtitlesSection from './SubscribeSubtitlesSection.vue';
import MetadataFieldsSection from './MetadataFieldsSection.vue';
import SubscribeOutputSection from './SubscribeOutputSection.vue';
import SubscribeFormatSection from './SubscribeFormatSection.vue';
import SubscribeProfileSection from './SubscribeProfileSection.vue';
import CoverOptionsFields from './CoverOptionsFields.vue';
import { useRemoteImage } from '@renderer/composables/useRemoteImage';
import type { SubscriptionDownloadPrefs } from '@renderer/types/online';

const props = withDefaults(
  defineProps<{
    channel: { channelId: string; channelTitle: string; channelThumbnail?: string };
    mode?: 'create' | 'edit';
    initialPrefs?: SubscriptionDownloadPrefs;
    /** Subskrypcje SoundCloud używają tylko preferencji folderu/szablonu/biblioteki. */
    platform?: 'youtube' | 'soundcloud';
  }>(),
  {
    mode: 'create'
  }
);

const emit = defineEmits<{
  confirm: [payload: { prefs?: SubscriptionDownloadPrefs; downloadAll: boolean }];
  cancel: [];
}>();

const isEdit = computed(() => props.mode === 'edit');

const { t } = useI18n();

const form = useSubscribePrefsForm({
  getInitialPrefs: () => props.initialPrefs,
  getChannelTitle: () => props.channel.channelTitle,
  getPlatform: () => props.platform
});
const {
  isSc,
  profiles,
  systemDownloads,
  selectedProfileId,
  kind,
  format,
  quality,
  audioQuality,
  audioLanguage,
  coverType,
  customCoverPath,
  coverFrameTime,
  coverClipStart,
  coverClipEnd,
  coverClipFormat,
  filenameTemplate,
  artist,
  album,
  year,
  subsEnabled,
  subsLangs,
  subsFormat,
  subsMode,
  subsFolder,
  folderMode,
  outputDir,
  addToLibrary,
  sponsorBlock,
  trimStart,
  trimEnd,
  downloadAll,
  channelFolder,
  prefsSummary,
  confirmPrefs,
  onProfileSelect
} = form;

onMounted(async () => {
  if (!useSettingsStore().download.defaultPath) {
    try {
      systemDownloads.value =
        ((await window.api.invoke('app:getPath', 'downloads')) as string) || '';
    } catch {
      systemDownloads.value = '';
    }
  }
  void form.ensureLoaded();
});

const avatarFailed = ref(false);
const avatarSrc = useRemoteImage(computed(() => props.channel.channelThumbnail));

const uiSub = useUIStore();
let overlayClicksSub = 0;
let overlayTimerSub: ReturnType<typeof setTimeout> | null = null;
function onOverlayClickSub() {
  overlayClicksSub++;
  uiSub.notify('info', t('common.clickAgainToClose'));
  if (overlayClicksSub >= 2) emit('cancel');
  if (overlayTimerSub) clearTimeout(overlayTimerSub);
  overlayTimerSub = setTimeout(() => (overlayClicksSub = 0), 2000);
}
function close() {
  emit('cancel');
}

function confirm() {
  emit('confirm', { prefs: confirmPrefs(), downloadAll: downloadAll.value });
}
</script>

<template>
  <ModalShell
    labelled-by="subscribe-config-dialog-title"
    backdrop="dim-blur"
    panel-class="w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
    @close="onOverlayClickSub"
    @escape="emit('cancel')"
  >
    <!-- Nagłówek -->
    <div class="flex items-center gap-3 px-5 py-4 border-b border-base-300 shrink-0">
      <div
        v-if="avatarSrc && !avatarFailed"
        class="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-base-100"
      >
        <img
          :src="avatarSrc"
          :alt="props.channel.channelTitle"
          class="w-full h-full object-cover"
          @error="avatarFailed = true"
        />
      </div>
      <div
        v-else
        class="w-10 h-10 rounded-full bg-base-100 border border-base-300 flex items-center justify-center shrink-0 text-base-content/50"
      >
        <Tv2 :size="18" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 id="subscribe-config-dialog-title" class="text-sm font-semibold text-base-content">
          {{ isEdit ? $t('youtube.downloadPrefs') : $t('youtube.subscribeConfigTitle') }}
        </h3>
        <p class="text-xs text-base-content/50 truncate">{{ props.channel.channelTitle }}</p>
      </div>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        :aria-label="$t('common.close')"
        @click="close"
      >
        <X :size="16" />
      </button>
    </div>
    <!-- Treść -->
    <div class="flex-1 overflow-auto px-5 py-5 space-y-5">
      <!-- Karta kanału -->
      <SubscribeChannelCard :channel="props.channel" :is-sc="isSc" :is-edit="isEdit" />

      <!-- Zakres (tylko tworzenie) -->
      <SubscribeScopeSelector v-model="downloadAll" :is-edit="isEdit" />

      <!-- Siatka preferencji -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Lewa kolumna -->
        <div class="space-y-5">
          <!-- Profil -->
          <SubscribeProfileSection
            :is-sc="isSc"
            :profiles="profiles"
            :selected-id="selectedProfileId"
            @select="onProfileSelect"
          />

          <!-- Format -->
          <SubscribeFormatSection
            v-model:kind="kind"
            v-model:format="format"
            v-model:quality="quality"
            v-model:audio-quality="audioQuality"
            v-model:audio-language="audioLanguage"
            v-model:trim-start="trimStart"
            v-model:trim-end="trimEnd"
            v-model:sponsor-block="sponsorBlock"
            :is-sc="isSc"
          />

          <!-- Okładka (tylko audio) -->
          <CoverOptionsFields
            v-model:cover-type="coverType"
            v-model:custom-path="customCoverPath"
            v-model:frame-time="coverFrameTime"
            v-model:clip-start="coverClipStart"
            v-model:clip-end="coverClipEnd"
            v-model:clip-format="coverClipFormat"
            :is-sc="isSc"
            :kind="kind"
          />
        </div>

        <!-- Prawa kolumna -->
        <div class="space-y-5">
          <!-- Metadane -->
          <MetadataFieldsSection
            v-if="!isSc"
            v-model:artist="artist"
            v-model:album="album"
            v-model:year="year"
            grid-class="grid-cols-3 gap-2"
          />

          <!-- Napisy -->
          <SubscribeSubtitlesSection
            v-model:subs-enabled="subsEnabled"
            v-model:subs-langs="subsLangs"
            v-model:subs-mode="subsMode"
            v-model:subs-format="subsFormat"
            v-model:subs-folder="subsFolder"
            :is-sc="isSc"
          />

          <!-- Folder wyjściowy -->
          <SubscribeOutputSection
            v-model:folder-mode="folderMode"
            v-model:output-dir="outputDir"
            v-model:filename-template="filenameTemplate"
            v-model:add-to-library="addToLibrary"
            :channel-folder="channelFolder"
          />
        </div>
      </div>

      <!-- Podsumowanie -->
      <SubscribePrefsSummary :items="prefsSummary" />
    </div>

    <!-- Stopka -->
    <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-300 shrink-0">
      <button
        class="fx-noise px-4 py-2 fx-depth rounded-field border border-base-300 text-sm text-base-content/70 hover:bg-base-content/10 transition-colors"
        @click="close"
      >
        {{ $t('youtube.cancel') }}
      </button>
      <button
        class="fx-noise flex items-center gap-1.5 px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors"
        @click="confirm"
      >
        <Download v-if="!isEdit" :size="14" />
        {{ isEdit ? $t('common.save') : $t('youtube.subscribeAndSave') }}
      </button>
    </div>
  </ModalShell>
</template>
