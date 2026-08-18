<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  X,
  FolderOpen,
  Download,
  ImagePlus,
  Film,
  Scissors,
  Image,
  Save,
  Trash2
} from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { joinPath, sanitizeDirName } from '@renderer/utils/path';
import { AUDIO_FORMATS, VIDEO_QUALITIES, VIDEO_CONTAINERS } from '@shared/constants';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';
import type { CoverSpec, MetaOverride } from '@renderer/types/youtube';
import type { IpcDownloadConfig } from '@shared/types/ipc';

const props = defineProps<{
  title: string;
  thumbnail?: string;
  channelTitle?: string;
  playlistTitle?: string;
}>();

const emit = defineEmits<{
  confirm: [payload: IpcDownloadConfig];
  cancel: [];
}>();

const { profiles, save, remove, ensureLoaded } = useDownloadProfiles();
const selectedProfileId = ref('');
const profileName = ref('');

const coverTypes = [
  { id: 'thumbnail', icon: Image, key: 'youtube.coverThumbnail' },
  { id: 'custom', icon: ImagePlus, key: 'youtube.coverCustom' },
  { id: 'frame', icon: Film, key: 'youtube.coverFrame' },
  { id: 'clip', icon: Scissors, key: 'youtube.coverClip' }
] as const;

const settings = useSettingsStore();
const systemDownloads = ref('');

const audioFormats = AUDIO_FORMATS;
const videoQualities = VIDEO_QUALITIES;
const videoContainers = VIDEO_CONTAINERS;
const audioQualities = ['best', 'high', 'medium', 'low'] as const;

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

function close() {
  emit('cancel');
}

async function pickCustomCover() {
  const res = (await window.api?.openImageDialog()) as
    { canceled?: boolean; filePaths?: string[] } | undefined;
  if (res && !res.canceled && res.filePaths && res.filePaths.length > 0) {
    customPath.value = res.filePaths[0];
  }
}

async function pickOutputDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

function buildConfig(): IpcDownloadConfig {
  const cover: CoverSpec | undefined = (() => {
    if (kind.value === 'video') {
      // Video downloads embed the YouTube thumbnail by default; "none" is the
      // explicit opt-out (animated covers are an audio feature).
      return coverType.value === 'none' ? { type: 'none' } : { type: 'thumbnail' };
    }
    if (coverType.value === 'none') return { type: 'none' };
    if (coverType.value === 'custom') {
      return customPath.value ? { type: 'custom', customPath: customPath.value } : undefined;
    }
    if (coverType.value === 'frame') {
      return { type: 'frame', frameTime: Number(frameTime.value) || 0 };
    }
    if (coverType.value === 'clip') {
      return {
        type: 'clip',
        clipStart: Number(clipStart.value) || 0,
        clipEnd: Number(clipEnd.value) || 0,
        clipFormat: clipFormat.value
      };
    }
    return { type: 'thumbnail' };
  })();
  const metaOverride: MetaOverride = {};
  if (artist.value.trim()) metaOverride.artist = artist.value.trim();
  if (album.value.trim()) metaOverride.album = album.value.trim();
  if (year.value.trim()) metaOverride.year = year.value.trim();
  let resolvedDir: string | undefined;
  if (folderMode.value === 'channel') resolvedDir = channelFolder.value || undefined;
  else if (folderMode.value === 'playlist') resolvedDir = playlistFolder.value || undefined;
  else if (folderMode.value === 'custom') resolvedDir = outputDir.value || undefined;
  return {
    kind: kind.value,
    ...(kind.value === 'audio' ? { format: format.value } : {}),
    ...(kind.value === 'audio' ? { audioQuality: audioQuality.value } : {}),
    ...(kind.value === 'video' ? { quality: quality.value } : {}),
    ...(kind.value === 'video' ? { videoContainer: videoContainer.value } : {}),
    ...(audioLanguage.value.trim() ? { audioLanguage: audioLanguage.value.trim() } : {}),
    filenameTemplate: filenameTemplate.value.trim() || undefined,
    sponsorBlock: sponsorBlock.value,
    ...(trimStart.value != null && trimEnd.value != null && trimEnd.value > trimStart.value
      ? { trimStart: trimStart.value, trimEnd: trimEnd.value }
      : {}),
    ...(cover ? { cover } : {}),
    ...(Object.keys(metaOverride).length ? { metaOverride } : {}),
    ...(resolvedDir ? { outputDir: resolvedDir } : {}),
    ...(subsEnabled.value && subsLangs.value.trim()
      ? {
          subsLangs: subsLangs.value.trim(),
          subsFormat: subsFormat.value,
          subsMode: subsMode.value,
          subsFolder: subsFolder.value
        }
      : {})
  };
}

function confirm() {
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
      class="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="close"
    >
      <div
        class="bg-bg-surface border border-border-default rounded-2xl w-full max-w-3xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-border-default shrink-0">
          <div
            v-if="props.thumbnail"
            class="w-12 h-8 rounded-lg overflow-hidden shrink-0 bg-bg-elevated"
          >
            <img :src="props.thumbnail" :alt="props.title" class="w-full h-full object-cover" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold text-fg-base truncate">{{ props.title }}</h3>
            <p class="text-xs text-fg-faint truncate">
              <span v-if="props.channelTitle">{{ props.channelTitle }}</span>
              <span v-if="props.channelTitle && props.playlistTitle"> · </span>
              <span v-if="props.playlistTitle">{{ props.playlistTitle }}</span>
            </p>
          </div>
          <button
            class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-auto px-5 py-5">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <!-- Left: preview -->
            <div class="space-y-4">
              <div
                class="aspect-video rounded-2xl overflow-hidden bg-bg-elevated border border-border-default"
              >
                <img
                  v-if="props.thumbnail"
                  :src="props.thumbnail"
                  :alt="props.title"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-fg-faint">
                  <Image :size="32" />
                </div>
              </div>
              <div class="p-3 rounded-xl bg-bg-elevated border border-border-default">
                <p class="text-xs text-fg-faint">{{ $t('youtube.downloadConfigHint') }}</p>
                <p class="text-sm font-medium text-fg-base mt-1 line-clamp-2">{{ props.title }}</p>
              </div>
            </div>

            <!-- Right: settings -->
            <div class="space-y-5">
              <!-- Profiles -->
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.profilesSection') }}
                </p>
                <div class="flex items-center gap-2">
                  <select
                    :value="selectedProfileId"
                    class="flex-1 min-w-0 px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    @change="onProfileSelect"
                  >
                    <option value="">{{ $t('youtube.profileNone') }}</option>
                    <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                  <button
                    v-if="selectedProfileId"
                    class="p-2 rounded-xl border border-border-default text-fg-muted hover:text-red-base hover:bg-bg-hover transition-colors shrink-0"
                    :title="$t('youtube.profileDelete')"
                    @click="deleteProfile"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
                <div class="flex items-center gap-2 mt-2">
                  <input
                    v-model="profileName"
                    class="flex-1 px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :placeholder="$t('youtube.profileNamePlaceholder')"
                  />
                  <button
                    class="flex items-center gap-1 px-3 py-2 rounded-xl border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors shrink-0"
                    :disabled="!profileName.trim()"
                    @click="saveProfile"
                  >
                    <Save :size="13" />
                    {{ $t('youtube.profileSave') }}
                  </button>
                </div>
              </section>

              <!-- Format -->
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.prefKind') }}
                </p>
                <div class="flex gap-1 bg-bg-base rounded-xl p-1 w-fit">
                  <button
                    v-for="k in ['audio', 'video'] as const"
                    :key="k"
                    class="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    :class="
                      kind === k ? 'bg-accent-base text-white' : 'text-fg-muted hover:text-fg-base'
                    "
                    @click="kind = k"
                  >
                    {{ k === 'audio' ? $t('youtube.prefAudio') : $t('youtube.prefVideo') }}
                  </button>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-3">
                  <label v-if="kind === 'audio'" class="block text-xs text-fg-faint">
                    {{ $t('youtube.prefFormat') }}
                    <select
                      v-model="format"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option v-for="f in audioFormats" :key="f" :value="f">
                        {{ f === 'best' ? $t('settings.audioNative') : f }}
                      </option>
                    </select>
                  </label>
                  <label v-if="kind === 'audio'" class="block text-xs text-fg-faint">
                    {{ $t('settings.defaultAudioQuality') }}
                    <select
                      v-model="audioQuality"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option v-for="q in audioQualities" :key="q" :value="q">
                        {{ $t('settings.audioQuality.' + q) }}
                      </option>
                    </select>
                  </label>
                  <label v-if="kind === 'video'" class="block text-xs text-fg-faint">
                    {{ $t('youtube.prefQuality') }}
                    <select
                      v-model="quality"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option v-for="q in videoQualities" :key="q" :value="q">{{ q }}</option>
                    </select>
                  </label>
                  <label v-if="kind === 'video'" class="block text-xs text-fg-faint">
                    {{ $t('settings.defaultVideoContainer') }}
                    <select
                      v-model="videoContainer"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option v-for="c in videoContainers" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </label>
                </div>

                <label v-if="kind === 'audio'" class="mt-3 block text-xs text-fg-faint">
                  {{ $t('youtube.audioLanguage') }}
                  <input
                    v-model="audioLanguage"
                    class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :placeholder="$t('youtube.audioLanguagePlaceholder')"
                  />
                </label>

                <div class="mt-3 grid grid-cols-2 gap-3">
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.trimStart') }}
                    <input
                      v-model.number="trimStart"
                      type="number"
                      min="0"
                      step="1"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :placeholder="$t('youtube.trimStartPlaceholder')"
                    />
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.trimEnd') }}
                    <input
                      v-model.number="trimEnd"
                      type="number"
                      min="0"
                      step="1"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :placeholder="$t('youtube.trimEndPlaceholder')"
                    />
                  </label>
                </div>

                <label class="mt-3 block text-xs text-fg-faint">
                  {{ $t('youtube.prefTemplate') }}
                  <input
                    v-model="filenameTemplate"
                    class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :placeholder="$t('youtube.prefTemplatePlaceholder')"
                  />
                  <div class="mt-1.5">
                    <FilenameTemplatePresets @preset="(p) => (filenameTemplate = p)" />
                  </div>
                </label>

                <label class="mt-3 block text-xs text-fg-faint">
                  {{ $t('youtube.sponsorBlock') }}
                  <select
                    v-model="sponsorBlock"
                    class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                  >
                    <option value="off">{{ $t('youtube.sponsorBlockOff') }}</option>
                    <option value="mark">{{ $t('youtube.sponsorBlockMark') }}</option>
                    <option value="remove">{{ $t('youtube.sponsorBlockRemove') }}</option>
                  </select>
                </label>
              </section>

              <!-- Cover (video: thumbnail/none) -->
              <section v-if="kind === 'video'">
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.coverSection') }}
                </p>
                <div class="flex gap-1 bg-bg-base rounded-xl p-1 w-fit">
                  <button
                    class="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    :class="
                      coverType !== 'none'
                        ? 'bg-accent-base text-white'
                        : 'text-fg-muted hover:text-fg-base'
                    "
                    @click="coverType = 'thumbnail'"
                  >
                    {{ $t('youtube.coverThumbnail') }}
                  </button>
                  <button
                    class="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    :class="
                      coverType === 'none'
                        ? 'bg-accent-base text-white'
                        : 'text-fg-muted hover:text-fg-base'
                    "
                    @click="coverType = 'none'"
                  >
                    {{ $t('youtube.coverNone') }}
                  </button>
                </div>
              </section>

              <!-- Cover (audio) -->
              <section v-if="kind === 'audio'">
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.coverSection') }}
                </p>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="ct in coverTypes"
                    :key="ct.id"
                    class="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors"
                    :class="
                      coverType === ct.id
                        ? 'border-accent-base bg-accent-ghost text-accent-base'
                        : 'border-border-default text-fg-muted hover:bg-bg-hover'
                    "
                    @click="coverType = ct.id"
                  >
                    <component :is="ct.icon" :size="14" />
                    {{ $t(ct.key) }}
                  </button>
                </div>

                <div v-if="coverType === 'custom'" class="mt-2 flex items-center gap-2">
                  <button
                    class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
                    @click="pickCustomCover"
                  >
                    <ImagePlus :size="13" />
                    {{ $t('youtube.pickCoverFile') }}
                  </button>
                  <span class="text-xs text-fg-faint truncate flex-1">
                    {{ customPath || $t('youtube.coverCustomHint') }}
                  </span>
                </div>

                <label v-else-if="coverType === 'frame'" class="mt-2 block text-xs text-fg-faint">
                  {{ $t('youtube.frameTimeLabel') }}
                  <input
                    v-model.number="frameTime"
                    type="number"
                    min="0"
                    step="1"
                    class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                  />
                </label>

                <div v-else-if="coverType === 'clip'" class="mt-2 grid grid-cols-2 gap-3">
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.clipStartLabel') }}
                    <input
                      v-model.number="clipStart"
                      type="number"
                      min="0"
                      step="1"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    />
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.clipEndLabel') }}
                    <input
                      v-model.number="clipEnd"
                      type="number"
                      min="1"
                      step="1"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    />
                  </label>
                  <label class="block text-xs text-fg-faint col-span-2">
                    {{ $t('youtube.clipFormatLabel') }}
                    <select
                      v-model="clipFormat"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option value="webm">.webm</option>
                      <option value="mp4">.mp4</option>
                    </select>
                  </label>
                </div>
              </section>

              <!-- Metadata -->
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-1">
                  {{ $t('youtube.metaSection') }}
                </p>
                <p class="text-[11px] text-fg-faint mb-2">{{ $t('youtube.metaHint') }}</p>
                <div class="grid grid-cols-3 gap-3">
                  <input
                    v-model="artist"
                    class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :placeholder="$t('youtube.metaArtist')"
                  />
                  <input
                    v-model="album"
                    class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :placeholder="$t('youtube.metaAlbum')"
                  />
                  <input
                    v-model="year"
                    class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :placeholder="$t('youtube.metaYear')"
                  />
                </div>
              </section>

              <!-- Subtitles -->
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.subsSection') }}
                </p>
                <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    v-model="subsEnabled"
                    type="checkbox"
                    class="w-4 h-4 rounded accent-accent-base"
                  />
                  {{ $t('youtube.subsDownload') }}
                </label>
                <div v-if="subsEnabled" class="mt-2 space-y-2">
                  <input
                    v-model="subsLangs"
                    class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    :placeholder="$t('youtube.subsLangsPlaceholder')"
                  />
                  <div class="grid grid-cols-2 gap-2">
                    <select
                      v-model="subsMode"
                      class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option value="best">{{ $t('youtube.subsModeBest') }}</option>
                      <option value="manual">{{ $t('youtube.subsModeManual') }}</option>
                      <option value="auto">{{ $t('youtube.subsModeAuto') }}</option>
                    </select>
                    <select
                      v-model="subsFormat"
                      class="px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
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
                      class="w-3.5 h-3.5 rounded accent-accent-base"
                    />
                    {{ $t('youtube.subsFolder') }}
                  </label>
                </div>
              </section>

              <!-- Output folder -->
              <section v-if="props.channelTitle || props.playlistTitle">
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.prefOutputDir') }}
                </p>
                <div class="flex items-center gap-2">
                  <select
                    v-model="folderMode"
                    class="flex-1 min-w-0 px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
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
                    class="flex items-center gap-1 px-3 py-2 rounded-xl border border-border-default text-fg-muted hover:bg-bg-hover transition-colors shrink-0"
                    @click="pickOutputDir"
                  >
                    <FolderOpen :size="14" />
                  </button>
                </div>
                <p
                  v-if="folderMode === 'channel'"
                  class="mt-1 truncate text-[11px] text-fg-faint"
                  :title="channelFolder"
                >
                  {{ $t('youtube.prefOutputDirChannelHint', { folder: channelFolder }) }}
                </p>
                <p
                  v-else-if="folderMode === 'playlist'"
                  class="mt-1 truncate text-[11px] text-fg-faint"
                  :title="playlistFolder"
                >
                  {{ $t('youtube.folderModePlaylistHint', { folder: playlistFolder }) }}
                </p>
                <input
                  v-else-if="folderMode === 'custom'"
                  v-model="outputDir"
                  readonly
                  class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                  :placeholder="$t('youtube.prefOutputDirPlaceholder')"
                />
              </section>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div
          class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-default shrink-0"
        >
          <button
            class="px-4 py-2 rounded-xl border border-border-default text-sm text-fg-muted hover:bg-bg-hover transition-colors"
            @click="close"
          >
            {{ $t('youtube.cancel') }}
          </button>
          <button
            class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover transition-colors"
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
