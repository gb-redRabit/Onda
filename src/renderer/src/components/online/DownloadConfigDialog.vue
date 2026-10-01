<script setup lang="ts">
import ModalShell from '@renderer/components/ui/ModalShell.vue';
import { ref, onMounted } from 'vue';
import { X, Download } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadConfigForm } from '@renderer/composables/useDownloadConfigForm';
import type { IpcDownloadConfig } from '@shared/types/ipc';
import DownloadPreviewCard from './DownloadPreviewCard.vue';
import MetadataFieldsSection from './MetadataFieldsSection.vue';
import DownloadFormatSection from './DownloadFormatSection.vue';
import CoverOptionsFields from './CoverOptionsFields.vue';
import DownloadProfilesSection from './DownloadProfilesSection.vue';
import DownloadOutputSection from './DownloadOutputSection.vue';
import SubscribeSubtitlesSection from './SubscribeSubtitlesSection.vue';

const props = defineProps<{
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  playlistTitle?: string;
  /** Pobrania SoundCloud to stałe MP3 — większość sekcji nie ma zastosowania. */
  platform?: 'youtube' | 'soundcloud' | 'generic';
}>();

const emit = defineEmits<{
  confirm: [payload: IpcDownloadConfig];
  cancel: [];
}>();

const { t } = useI18n();
const ui = useUIStore();

const form = useDownloadConfigForm({
  getChannelTitle: () => props.channelTitle,
  getPlaylistTitle: () => props.playlistTitle,
  getPlatform: () => props.platform
});
const {
  isSc,
  isGeneric,
  profiles,
  systemDownloads,
  kind,
  format,
  quality,
  audioQuality,
  videoContainer,
  audioLanguage,
  sponsorBlock,
  trimStart,
  trimEnd,
  filenameTemplate,
  coverType,
  customPath,
  frameTime,
  clipStart,
  clipEnd,
  clipFormat,
  artist,
  album,
  year,
  folderMode,
  outputDir,
  subsEnabled,
  subsLangs,
  subsFormat,
  subsMode,
  subsFolder,
  channelFolder,
  playlistFolder,
  confirmConfig
} = form;

const selectedProfileId = ref('');
const profileName = ref('');

function onProfileSelect(id: string) {
  selectedProfileId.value = id;
  if (id) form.applyProfile(id);
}
async function saveProfile() {
  const name = profileName.value.trim();
  if (!name) return;
  await form.save(name, form.buildConfig());
  profileName.value = '';
}
async function deleteProfile() {
  if (!selectedProfileId.value) return;
  await form.remove(selectedProfileId.value);
  selectedProfileId.value = '';
}

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

let overlayClicks = 0;
let overlayTimer: ReturnType<typeof setTimeout> | null = null;
function onOverlayClick() {
  overlayClicks++;
  ui.notify('info', t('common.clickAgainToClose'));
  if (overlayClicks >= 2) emit('cancel');
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => (overlayClicks = 0), 2000);
}
function close() {
  emit('cancel');
}

function confirm() {
  emit('confirm', confirmConfig());
}
</script>

<template>
  <ModalShell
    labelled-by="download-config-dialog-title"
    backdrop="dim-blur"
    panel-class="w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
    @close="onOverlayClick"
    @escape="emit('cancel')"
  >
    <!-- Nagłówek -->
    <div class="flex items-center gap-3 px-5 py-4 border-b border-base-300 shrink-0">
      <div
        v-if="props.thumbnail"
        class="w-12 h-8 rounded-field overflow-hidden shrink-0 bg-base-100"
      >
        <img :src="props.thumbnail" :alt="props.title" class="w-full h-full object-cover" />
      </div>
      <div class="min-w-0 flex-1">
        <h3
          id="download-config-dialog-title"
          class="text-sm font-semibold text-base-content truncate"
        >
          {{ props.title }}
        </h3>
        <p class="text-xs text-base-content/50 truncate">
          <span v-if="props.channelTitle">{{ props.channelTitle }}</span>
          <span v-if="props.channelTitle && props.playlistTitle"> · </span>
          <span v-if="props.playlistTitle">{{ props.playlistTitle }}</span>
        </p>
        <p v-if="isGeneric" class="mt-1 text-[11px] text-info">
          {{ $t('youtube.genericExtractorHint') }}
        </p>
      </div>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
        @click="close"
      >
        <X :size="16" />
      </button>
    </div>

    <!-- Treść -->
    <div class="flex-1 overflow-auto px-5 py-5">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <!-- Lewa: podgląd -->
        <DownloadPreviewCard :thumbnail="props.thumbnail" :title="props.title" />

        <!-- Prawa: ustawienia -->
        <div class="space-y-5">
          <!-- Profile -->
          <DownloadProfilesSection
            v-model:profile-name="profileName"
            :is-sc="isSc"
            :profiles="profiles"
            :selected-id="selectedProfileId"
            @select="onProfileSelect"
            @save="saveProfile"
            @delete="deleteProfile"
          />

          <!-- Format -->
          <DownloadFormatSection
            v-model:kind="kind"
            v-model:format="format"
            v-model:audio-quality="audioQuality"
            v-model:quality="quality"
            v-model:video-container="videoContainer"
            v-model:audio-language="audioLanguage"
            v-model:trim-start="trimStart"
            v-model:trim-end="trimEnd"
            v-model:filename-template="filenameTemplate"
            v-model:sponsor-block="sponsorBlock"
            :is-sc="isSc"
          />

          <!-- Okładka (wideo: miniatura/brak) + Okładka (audio) -->
          <CoverOptionsFields
            v-model:cover-type="coverType"
            v-model:custom-path="customPath"
            v-model:frame-time="frameTime"
            v-model:clip-start="clipStart"
            v-model:clip-end="clipEnd"
            v-model:clip-format="clipFormat"
            :is-sc="isSc"
            :kind="kind"
          />

          <!-- Metadane -->
          <MetadataFieldsSection
            v-model:artist="artist"
            v-model:album="album"
            v-model:year="year"
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
          <DownloadOutputSection
            v-model:folder-mode="folderMode"
            v-model:output-dir="outputDir"
            :channel-title="props.channelTitle"
            :playlist-title="props.playlistTitle"
            :channel-folder="channelFolder"
            :playlist-folder="playlistFolder"
          />
        </div>
      </div>
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
        <Download :size="14" />
        {{ $t('youtube.addToQueue') }}
      </button>
    </div>
  </ModalShell>
</template>
