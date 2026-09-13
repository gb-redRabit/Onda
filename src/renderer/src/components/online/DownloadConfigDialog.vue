<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { X, FolderOpen, Download, Save, Trash2 } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { joinPath, sanitizeDirName } from '@renderer/utils/path';
import type { MetaOverride } from '@renderer/types/online';
import type { IpcDownloadConfig } from '@shared/types/ipc';
import { buildDownloadConfig } from '@renderer/utils/downloadConfig';
import DownloadPreviewCard from './DownloadPreviewCard.vue';
import MetadataFieldsSection from './MetadataFieldsSection.vue';
import DownloadFormatSection from './DownloadFormatSection.vue';
import DownloadCoverSection from './DownloadCoverSection.vue';

const props = defineProps<{
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  playlistTitle?: string;
  /** SoundCloud downloads are fixed MP3s — most sections do not apply. */
  platform?: 'youtube' | 'soundcloud';
}>();

const emit = defineEmits<{
  confirm: [payload: IpcDownloadConfig];
  cancel: [];
}>();

const isSc = computed(() => props.platform === 'soundcloud');

const { profiles, save, remove, ensureLoaded } = useDownloadProfiles();
const selectedProfileId = ref('');
const profileName = ref('');

const settings = useSettingsStore();
const systemDownloads = ref('');

const kind = ref<'audio' | 'video'>(settings.download.defaultKind);
const format = ref<string>(settings.download.defaultAudioFormat);
const quality = ref<string>(settings.download.defaultVideoQuality);
const audioQuality = ref<string>(settings.download.defaultAudioQuality);
const audioLanguage = ref('');
const sponsorBlock = ref<'off' | 'mark' | 'remove'>('off');
const trimStart = ref<number | null>(null);
const trimEnd = ref<number | null>(null);
const videoContainer = ref<'mp4' | 'mkv' | 'webm'>(settings.download.defaultVideoContainer);
const filenameTemplate = ref(settings.download.filenameTemplate);
const coverType = ref<'thumbnail' | 'custom' | 'frame' | 'clip' | 'none'>('thumbnail');
const customPath = ref('');
const frameTime = ref(30);
const clipStart = ref(0);
const clipEnd = ref(30);
const clipFormat = ref<'webm' | 'mp4'>('webm');
const artist = ref('');
const album = ref('');
const year = ref('');
const folderMode = ref<'global' | 'channel' | 'playlist' | 'custom'>('global');
const outputDir = ref('');
const subsEnabled = ref(false);
const subsLangs = ref('pl,en');
const subsFormat = ref<'srt' | 'vtt' | 'ass'>('srt');
const subsMode = ref<'manual' | 'auto' | 'best'>('best');
const subsFolder = ref(false);

onMounted(async () => {
  if (!settings.download.defaultPath) {
    try {
      const p = (await window.api.invoke('app:getPath', 'downloads')) as string;
      systemDownloads.value = p || '';
    } catch {
      systemDownloads.value = '';
    }
  }
  void ensureLoaded();
});

const baseDir = computed(() => settings.download.defaultPath || systemDownloads.value);

const channelFolder = computed(() => {
  if (!props.channelTitle || !baseDir.value) return '';
  return joinPath(baseDir.value, sanitizeDirName(props.channelTitle));
});

const playlistFolder = computed(() => {
  if (!props.playlistTitle || !baseDir.value) return '';
  return joinPath(baseDir.value, sanitizeDirName(props.playlistTitle));
});

const { t } = useI18n();
const ui = useUIStore();
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

async function pickOutputDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

function buildConfig(): IpcDownloadConfig {
  return buildDownloadConfig({
    kind: kind.value,
    format: format.value,
    audioQuality: audioQuality.value,
    quality: quality.value,
    videoContainer: videoContainer.value,
    audioLanguage: audioLanguage.value,
    filenameTemplate: filenameTemplate.value,
    sponsorBlock: sponsorBlock.value,
    trimStart: trimStart.value,
    trimEnd: trimEnd.value,
    coverType: coverType.value,
    customPath: customPath.value,
    frameTime: frameTime.value,
    clipStart: clipStart.value,
    clipEnd: clipEnd.value,
    clipFormat: clipFormat.value,
    artist: artist.value,
    album: album.value,
    year: year.value,
    folderMode: folderMode.value,
    channelFolder: channelFolder.value,
    playlistFolder: playlistFolder.value,
    outputDir: outputDir.value,
    subsEnabled: subsEnabled.value,
    subsLangs: subsLangs.value,
    subsFormat: subsFormat.value,
    subsMode: subsMode.value,
    subsFolder: subsFolder.value
  });
}

function confirm() {
  // SoundCloud: fixed progressive MP3 — only folder/metadata apply.
  if (isSc.value) {
    const metaOverride: MetaOverride = {};
    if (artist.value.trim()) metaOverride.artist = artist.value.trim();
    if (album.value.trim()) metaOverride.album = album.value.trim();
    if (year.value.trim()) metaOverride.year = year.value.trim();
    let resolvedDir: string | undefined;
    if (folderMode.value === 'channel') resolvedDir = channelFolder.value || undefined;
    else if (folderMode.value === 'playlist') resolvedDir = playlistFolder.value || undefined;
    else if (folderMode.value === 'custom') resolvedDir = outputDir.value || undefined;
    emit('confirm', {
      kind: 'audio',
      format: 'mp3',
      ...(Object.keys(metaOverride).length ? { metaOverride } : {}),
      ...(resolvedDir ? { outputDir: resolvedDir } : {})
    });
    return;
  }
  emit('confirm', buildConfig());
}

function applyProfile(id: string) {
  const profile = profiles.value.find((p) => p.id === id);
  if (!profile) return;
  const c = profile.config;
  if (c.kind) kind.value = c.kind;
  if (c.format) format.value = c.format;
  if (c.quality) quality.value = c.quality;
  if (c.audioQuality) audioQuality.value = c.audioQuality;
  if (c.videoContainer) videoContainer.value = c.videoContainer;
  if (c.audioLanguage !== undefined) audioLanguage.value = c.audioLanguage;
  if (c.sponsorBlock) sponsorBlock.value = c.sponsorBlock;
  if (c.trimStart != null) trimStart.value = c.trimStart;
  if (c.trimEnd != null) trimEnd.value = c.trimEnd;
  if (c.filenameTemplate) filenameTemplate.value = c.filenameTemplate;
  if (c.cover) {
    coverType.value = c.cover.type;
    if (c.cover.type === 'custom') customPath.value = c.cover.customPath || '';
    if (c.cover.type === 'frame') frameTime.value = c.cover.frameTime ?? 30;
    if (c.cover.type === 'clip') {
      clipStart.value = c.cover.clipStart ?? 0;
      clipEnd.value = c.cover.clipEnd ?? 30;
      clipFormat.value = c.cover.clipFormat ?? 'webm';
    }
  }
  if (c.metaOverride) {
    artist.value = c.metaOverride.artist || '';
    album.value = c.metaOverride.album || '';
    year.value = c.metaOverride.year || '';
  }
  if (c.outputDir) {
    folderMode.value = 'custom';
    outputDir.value = c.outputDir;
  }
  if (c.subsLangs) {
    subsEnabled.value = true;
    subsLangs.value = c.subsLangs;
    subsFormat.value = c.subsFormat || 'srt';
    subsMode.value = c.subsMode || 'best';
    subsFolder.value = !!c.subsFolder;
  }
}

async function saveProfile() {
  const name = profileName.value.trim();
  if (!name) return;
  await save(name, buildConfig());
  profileName.value = '';
}

async function deleteProfile() {
  if (!selectedProfileId.value) return;
  await remove(selectedProfileId.value);
  selectedProfileId.value = '';
}

function onProfileSelect(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  selectedProfileId.value = id;
  if (id) applyProfile(id);
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-9999 bg-neutral/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="onOverlayClick"
    >
      <div
        class="bg-base-100 border border-base-300 rounded-box w-full max-w-3xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-base-300 shrink-0">
          <div
            v-if="props.thumbnail"
            class="w-12 h-8 rounded-field overflow-hidden shrink-0 bg-base-100"
          >
            <img :src="props.thumbnail" :alt="props.title" class="w-full h-full object-cover" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold text-base-content truncate">{{ props.title }}</h3>
            <p class="text-xs text-base-content/50 truncate">
              <span v-if="props.channelTitle">{{ props.channelTitle }}</span>
              <span v-if="props.channelTitle && props.playlistTitle"> · </span>
              <span v-if="props.playlistTitle">{{ props.playlistTitle }}</span>
            </p>
          </div>
          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-auto px-5 py-5">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <!-- Left: preview -->
            <DownloadPreviewCard :thumbnail="props.thumbnail" :title="props.title" />

            <!-- Right: settings -->
            <div class="space-y-5">
              <!-- Profiles -->
              <section v-if="!isSc">
                <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.profilesSection') }}
                </p>
                <div class="flex items-center gap-2">
                  <select
                    :value="selectedProfileId"
                    class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    @change="onProfileSelect"
                  >
                    <option value="">{{ $t('youtube.profileNone') }}</option>
                    <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                  <button
                    v-if="selectedProfileId"
                    class="fx-noise p-2 fx-depth rounded-field border border-base-300 text-base-content/70 hover:text-error hover:bg-base-content/10 transition-colors shrink-0"
                    :title="$t('youtube.profileDelete')"
                    @click="deleteProfile"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
                <div class="flex items-center gap-2 mt-2">
                  <input
                    v-model="profileName"
                    class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    :placeholder="$t('youtube.profileNamePlaceholder')"
                  />
                  <button
                    class="fx-noise flex items-center gap-1 px-3 py-2 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors shrink-0"
                    :disabled="!profileName.trim()"
                    @click="saveProfile"
                  >
                    <Save :size="13" />
                    {{ $t('youtube.profileSave') }}
                  </button>
                </div>
              </section>

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

              <!-- Cover (video: thumbnail/none) + Cover (audio) -->
              <DownloadCoverSection
                v-model:cover-type="coverType"
                v-model:custom-path="customPath"
                v-model:frame-time="frameTime"
                v-model:clip-start="clipStart"
                v-model:clip-end="clipEnd"
                v-model:clip-format="clipFormat"
                :is-sc="isSc"
                :kind="kind"
              />

              <!-- Metadata -->
              <MetadataFieldsSection
                v-model:artist="artist"
                v-model:album="album"
                v-model:year="year"
              />

              <!-- Subtitles -->
              <section v-if="!isSc">
                <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.subsSection') }}
                </p>
                <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input v-model="subsEnabled" type="checkbox" />
                  {{ $t('youtube.subsDownload') }}
                </label>
                <div v-if="subsEnabled" class="mt-2 space-y-2">
                  <input
                    v-model="subsLangs"
                    class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    :placeholder="$t('youtube.subsLangsPlaceholder')"
                  />
                  <div class="grid grid-cols-2 gap-2">
                    <select
                      v-model="subsMode"
                      class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="best">{{ $t('youtube.subsModeBest') }}</option>
                      <option value="manual">{{ $t('youtube.subsModeManual') }}</option>
                      <option value="auto">{{ $t('youtube.subsModeAuto') }}</option>
                    </select>
                    <select
                      v-model="subsFormat"
                      class="px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="srt">SRT</option>
                      <option value="vtt">VTT</option>
                      <option value="ass">ASS</option>
                    </select>
                  </div>
                  <label class="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      v-model="subsFolder"
                      type="checkbox"
                      class="w-3.5 h-3.5 fx-depth rounded-field accent-primary"
                    />
                    {{ $t('youtube.subsFolder') }}
                  </label>
                </div>
              </section>

              <!-- Output folder -->
              <section v-if="props.channelTitle || props.playlistTitle">
                <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.prefOutputDir') }}
                </p>
                <div class="flex items-center gap-2">
                  <select
                    v-model="folderMode"
                    class="flex-1 min-w-0 px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                  >
                    <option value="global">{{ $t('youtube.prefOutputDirGlobal') }}</option>
                    <option v-if="props.channelTitle" value="channel">
                      {{ $t('youtube.prefOutputDirChannel') }}
                    </option>
                    <option v-if="props.playlistTitle" value="playlist">
                      {{ $t('youtube.folderModePlaylist') }}
                    </option>
                    <option value="custom">{{ $t('youtube.prefOutputDirCustom') }}</option>
                  </select>
                  <button
                    v-if="folderMode === 'custom'"
                    class="fx-noise flex items-center gap-1 px-3 py-2 fx-depth rounded-field border border-base-300 text-base-content/70 hover:bg-base-content/10 transition-colors shrink-0"
                    @click="pickOutputDir"
                  >
                    <FolderOpen :size="14" />
                  </button>
                </div>
                <p
                  v-if="folderMode === 'channel'"
                  class="mt-1 truncate text-[11px] text-base-content/50"
                  :title="channelFolder"
                >
                  {{ $t('youtube.prefOutputDirChannelHint', { folder: channelFolder }) }}
                </p>
                <p
                  v-else-if="folderMode === 'playlist'"
                  class="mt-1 truncate text-[11px] text-base-content/50"
                  :title="playlistFolder"
                >
                  {{ $t('youtube.folderModePlaylistHint', { folder: playlistFolder }) }}
                </p>
                <input
                  v-else-if="folderMode === 'custom'"
                  v-model="outputDir"
                  readonly
                  class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                  :placeholder="$t('youtube.prefOutputDirPlaceholder')"
                />
              </section>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-end gap-2 px-5 py-4 border-t border-base-300 shrink-0"
        >
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
      </div>
    </div>
  </Teleport>
</template>
