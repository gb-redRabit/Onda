<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { X, FolderOpen, Download, Tv2 } from '@lucide/vue';
import FilenameTemplatePresets from '@renderer/components/FilenameTemplatePresets.vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { useI18n } from 'vue-i18n';
import { joinPath, sanitizeDirName } from '@renderer/utils/path';
import { AUDIO_FORMATS, VIDEO_QUALITIES } from '@shared/constants';
import type { SubscriptionDownloadPrefs, CoverSpec, MetaOverride } from '@renderer/types/youtube';

const props = withDefaults(
  defineProps<{
    channel: { channelId: string; channelTitle: string; channelThumbnail?: string };
    mode?: 'create' | 'edit';
    initialPrefs?: SubscriptionDownloadPrefs;
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

const audioFormats = AUDIO_FORMATS;
const videoQualities = VIDEO_QUALITIES;

const settings = useSettingsStore();
const { t } = useI18n();
const { profiles, ensureLoaded } = useDownloadProfiles();
const selectedProfileId = ref('');
const systemDownloads = ref('');
const avatarFailed = ref(false);

const initial = computed(() => props.initialPrefs);

// Pref values default to the current global setting; a field is only stored as
// an override when the user changes it away from the global default.
const kind = ref<'audio' | 'video'>(initial.value?.kind ?? settings.download.defaultKind);
const format = ref<string>(initial.value?.format ?? settings.download.defaultAudioFormat);
const quality = ref<string>(initial.value?.quality ?? settings.download.defaultVideoQuality);
const audioQuality = ref<string>(
  initial.value?.audioQuality ?? settings.download.defaultAudioQuality
);
const audioLanguage = ref(initial.value?.audioLanguage ?? '');
const coverType = ref<'thumbnail' | 'none' | 'frame' | 'clip' | 'custom'>(
  initial.value?.cover?.type ?? settings.download.defaultCover
);
const customCoverPath = ref(initial.value?.cover?.customPath ?? '');
const coverFrameTime = ref(initial.value?.cover?.frameTime ?? 30);
const coverClipStart = ref(initial.value?.cover?.clipStart ?? 0);
const coverClipEnd = ref(initial.value?.cover?.clipEnd ?? 30);
const coverClipFormat = ref<'webm' | 'mp4'>(initial.value?.cover?.clipFormat ?? 'webm');
const filenameTemplate = ref(initial.value?.filenameTemplate ?? '');
const artist = ref(initial.value?.metaOverride?.artist ?? '');
const album = ref(initial.value?.metaOverride?.album ?? '');
const year = ref(initial.value?.metaOverride?.year ?? '');
const subsEnabled = ref(!!initial.value?.subsLangs);
const subsLangs = ref(initial.value?.subsLangs ?? 'pl,en');
const subsFormat = ref<'srt' | 'vtt' | 'ass'>(initial.value?.subsFormat ?? 'srt');
const subsMode = ref<'manual' | 'auto' | 'best'>(initial.value?.subsMode ?? 'best');
const subsFolder = ref(!!initial.value?.subsFolder);
const folderMode = ref<'channel' | 'global' | 'custom'>(
  initial.value?.outputDir ? 'custom' : 'channel'
);
const outputDir = ref(initial.value?.outputDir ?? '');
const addToLibrary = ref(initial.value?.addToLibrary ?? settings.download.autoAddDownloadFolder);
const sponsorBlock = ref<'off' | 'mark' | 'remove'>(initial.value?.sponsorBlock ?? 'off');
const trimStart = ref<number | null>(initial.value?.trimStart ?? null);
const trimEnd = ref<number | null>(initial.value?.trimEnd ?? null);
const downloadAll = ref(false);

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
  const name = sanitizeDirName(props.channel.channelTitle);
  return baseDir.value ? joinPath(baseDir.value, name) : name;
});

interface SummaryItem {
  label: string;
  value: string;
}

const prefsSummary = computed<SummaryItem[]>(() => {
  const items: SummaryItem[] = [];
  items.push({
    label: t('youtube.prefKind'),
    value: kind.value === 'audio' ? t('youtube.prefAudio') : t('youtube.prefVideo')
  });
  if (kind.value === 'audio') {
    items.push({ label: t('youtube.prefFormat'), value: format.value });
  }
  if (kind.value === 'video') {
    items.push({ label: t('youtube.prefQuality'), value: quality.value });
  }
  if (kind.value !== 'video') {
    items.push({
      label: t('settings.defaultAudioQuality'),
      value: t('settings.audioQuality.' + audioQuality.value)
    });
  }
  if (audioLanguage.value.trim()) {
    items.push({ label: t('youtube.audioLanguage'), value: audioLanguage.value.trim() });
  }
  if (kind.value !== 'video') {
    items.push({ label: t('youtube.coverSection'), value: t('settings.cover.' + coverType.value) });
  }
  if (sponsorBlock.value !== 'off') {
    items.push({
      label: t('youtube.sponsorBlock'),
      value:
        sponsorBlock.value === 'mark'
          ? t('youtube.sponsorBlockMark')
          : t('youtube.sponsorBlockRemove')
    });
  }
  if (trimStart.value != null && trimEnd.value != null) {
    items.push({
      label: t('youtube.trimStart') + ' / ' + t('youtube.trimEnd'),
      value: `${trimStart.value}s – ${trimEnd.value}s`
    });
  }
  if (subsEnabled.value && subsLangs.value.trim()) {
    items.push({ label: t('youtube.subsSection'), value: subsLangs.value.trim() });
  }
  const folder =
    folderMode.value === 'channel'
      ? channelFolder.value || t('youtube.prefOutputDirChannel')
      : folderMode.value === 'custom'
        ? outputDir.value || t('youtube.prefOutputDirCustom')
        : t('youtube.prefOutputDirGlobal');
  items.push({ label: t('youtube.prefOutputDir'), value: folder });
  if (filenameTemplate.value.trim()) {
    items.push({ label: t('youtube.prefTemplate'), value: filenameTemplate.value.trim() });
  }
  if (artist.value.trim() || album.value.trim() || year.value.trim()) {
    items.push({
      label: t('youtube.metaSection'),
      value: [artist.value, album.value, year.value].filter(Boolean).join(' / ')
    });
  }
  items.push({
    label: t('youtube.addToLibraryPref'),
    value: addToLibrary.value ? t('common.yes') : t('common.no')
  });
  return items;
});

function close() {
  emit('cancel');
}

function confirm() {
  const prefs: SubscriptionDownloadPrefs = {};
  if (kind.value !== settings.download.defaultKind) prefs.kind = kind.value;
  if (kind.value === 'audio' && format.value !== settings.download.defaultAudioFormat) {
    prefs.format = format.value;
  }
  if (kind.value === 'video' && quality.value !== settings.download.defaultVideoQuality) {
    prefs.quality = quality.value;
  }
  if (audioQuality.value !== settings.download.defaultAudioQuality) {
    prefs.audioQuality = audioQuality.value;
  }
  if (audioLanguage.value.trim()) prefs.audioLanguage = audioLanguage.value.trim();
  const cover: CoverSpec | undefined = (() => {
    if (kind.value === 'video') {
      // Video downloads embed the YouTube thumbnail by default; "none" is the
      // explicit opt-out, undefined means "keep the default".
      return coverType.value === 'none' ? { type: 'none' } : undefined;
    }
    if (coverType.value === settings.download.defaultCover) return undefined;
    if (coverType.value === 'thumbnail') return { type: 'thumbnail' };
    if (coverType.value === 'custom')
      return customCoverPath.value
        ? { type: 'custom', customPath: customCoverPath.value }
        : undefined;
    if (coverType.value === 'frame')
      return { type: 'frame', frameTime: Number(coverFrameTime.value) || 0 };
    if (coverType.value === 'clip')
      return {
        type: 'clip',
        clipStart: Number(coverClipStart.value) || 0,
        clipEnd: Number(coverClipEnd.value) || 0,
        clipFormat: coverClipFormat.value
      };
    return undefined;
  })();
  if (cover) prefs.cover = cover;
  const meta: MetaOverride = {};
  if (artist.value.trim()) meta.artist = artist.value.trim();
  if (album.value.trim()) meta.album = album.value.trim();
  if (year.value.trim()) meta.year = year.value.trim();
  if (Object.keys(meta).length) prefs.metaOverride = meta;
  if (subsEnabled.value && subsLangs.value.trim()) {
    prefs.subsLangs = subsLangs.value.trim();
    prefs.subsFormat = subsFormat.value;
    prefs.subsMode = subsMode.value;
    prefs.subsFolder = subsFolder.value;
  }
  if (folderMode.value === 'channel') prefs.outputDir = channelFolder.value;
  else if (folderMode.value === 'custom' && outputDir.value) prefs.outputDir = outputDir.value;
  if (filenameTemplate.value.trim()) prefs.filenameTemplate = filenameTemplate.value.trim();
  if (addToLibrary.value !== settings.download.autoAddDownloadFolder) {
    prefs.addToLibrary = addToLibrary.value;
  }
  if (sponsorBlock.value !== 'off') prefs.sponsorBlock = sponsorBlock.value;
  if (trimStart.value != null && trimEnd.value != null && trimEnd.value > trimStart.value) {
    prefs.trimStart = trimStart.value;
    prefs.trimEnd = trimEnd.value;
  }
  if (selectedProfileId.value) prefs.profileId = selectedProfileId.value;
  emit('confirm', { prefs, downloadAll: downloadAll.value });
}

function onProfileSelect(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  selectedProfileId.value = id;
  if (!id) return;
  const profile = profiles.value.find((p) => p.id === id);
  if (!profile) return;
  const c = profile.config;
  if (c.kind) kind.value = c.kind;
  if (c.format) format.value = c.format;
  if (c.quality) quality.value = c.quality;
  if (c.audioQuality) audioQuality.value = c.audioQuality;
  if (c.audioLanguage !== undefined) audioLanguage.value = c.audioLanguage;
  if (c.cover) {
    coverType.value = c.cover.type;
    if (c.cover.type === 'custom') customCoverPath.value = c.cover.customPath || '';
    if (c.cover.type === 'frame') coverFrameTime.value = c.cover.frameTime ?? 30;
    if (c.cover.type === 'clip') {
      coverClipStart.value = c.cover.clipStart ?? 0;
      coverClipEnd.value = c.cover.clipEnd ?? 30;
      coverClipFormat.value = c.cover.clipFormat ?? 'webm';
    }
  }
  if (c.filenameTemplate) filenameTemplate.value = c.filenameTemplate;
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
  if (c.addToLibrary !== undefined) addToLibrary.value = c.addToLibrary;
  if (c.sponsorBlock) sponsorBlock.value = c.sponsorBlock;
  if (c.trimStart != null) trimStart.value = c.trimStart;
  if (c.trimEnd != null) trimEnd.value = c.trimEnd;
}

async function pickOutputDir() {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

async function pickCustomCover() {
  const res = (await window.api?.openImageDialog()) as
    { canceled?: boolean; filePaths?: string[] } | undefined;
  if (res && !res.canceled && res.filePaths && res.filePaths.length > 0) {
    customCoverPath.value = res.filePaths[0];
  }
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
            v-if="props.channel.channelThumbnail && !avatarFailed"
            class="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-bg-elevated"
          >
            <img
              :src="props.channel.channelThumbnail"
              :alt="props.channel.channelTitle"
              class="w-full h-full object-cover"
              @error="avatarFailed = true"
            />
          </div>
          <div
            v-else
            class="w-10 h-10 rounded-full bg-bg-elevated border border-border-default flex items-center justify-center shrink-0 text-fg-faint"
          >
            <Tv2 :size="18" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-semibold text-fg-base">
              {{ isEdit ? $t('youtube.downloadPrefs') : $t('youtube.subscribeConfigTitle') }}
            </h3>
            <p class="text-xs text-fg-faint truncate">{{ props.channel.channelTitle }}</p>
          </div>
          <button
            class="p-1.5 rounded-lg text-fg-faint hover:text-fg-base hover:bg-bg-hover transition-colors"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>
        <!-- Body -->
        <div class="flex-1 overflow-auto px-5 py-5 space-y-5">
          <!-- Channel card -->
          <div class="p-5 rounded-2xl bg-bg-elevated border border-border-default">
            <div class="flex items-center gap-4">
              <div
                v-if="props.channel.channelThumbnail && !avatarFailed"
                class="w-16 h-16 rounded-full overflow-hidden shrink-0 bg-bg-base"
              >
                <img
                  :src="props.channel.channelThumbnail"
                  :alt="props.channel.channelTitle"
                  class="w-full h-full object-cover"
                  @error="avatarFailed = true"
                />
              </div>
              <div
                v-else
                class="w-16 h-16 rounded-full bg-bg-base border border-border-default flex items-center justify-center shrink-0 text-fg-faint"
              >
                <Tv2 :size="28" />
              </div>
              <div class="min-w-0">
                <p class="text-base font-semibold text-fg-base truncate">
                  {{ props.channel.channelTitle }}
                </p>
                <p class="text-xs text-fg-faint">
                  {{ isEdit ? $t('youtube.prefSectionHint') : $t('youtube.subscribeConfigHint') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Scope (create only) -->
          <div v-if="!isEdit">
            <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
              {{ $t('youtube.subscribeScope') }}
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                class="p-3 rounded-xl border-2 text-left transition-all"
                :class="
                  !downloadAll
                    ? 'border-accent-base bg-accent-ghost'
                    : 'border-border-default hover:border-border-subtle'
                "
                @click="downloadAll = false"
              >
                <p class="text-sm font-medium text-fg-base">{{ $t('youtube.scopeNew') }}</p>
                <p class="text-xs text-fg-faint">{{ $t('youtube.scopeNewDesc') }}</p>
              </button>
              <button
                class="p-3 rounded-xl border-2 text-left transition-all"
                :class="
                  downloadAll
                    ? 'border-accent-base bg-accent-ghost'
                    : 'border-border-default hover:border-border-subtle'
                "
                @click="downloadAll = true"
              >
                <p class="text-sm font-medium text-fg-base">{{ $t('youtube.scopeAll') }}</p>
                <p class="text-xs text-fg-faint">{{ $t('youtube.scopeAllDesc') }}</p>
              </button>
            </div>
          </div>

          <!-- Preferences grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <!-- Left column -->
            <div class="space-y-5">
              <!-- Profile -->
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.profilesSection') }}
                </p>
                <select
                  :value="selectedProfileId"
                  class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                  @change="onProfileSelect"
                >
                  <option value="">{{ $t('youtube.profileNone') }}</option>
                  <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
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

                  <label v-if="kind === 'video'" class="block text-xs text-fg-faint">
                    {{ $t('youtube.prefQuality') }}
                    <select
                      v-model="quality"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option v-for="q in videoQualities" :key="q" :value="q">{{ q }}</option>
                    </select>
                  </label>

                  <label v-if="kind !== 'video'" class="block text-xs text-fg-faint">
                    {{ $t('settings.defaultAudioQuality') }}
                    <select
                      v-model="audioQuality"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
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

                  <label v-if="kind === 'audio'" class="block text-xs text-fg-faint">
                    {{ $t('youtube.audioLanguage') }}
                    <input
                      v-model="audioLanguage"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                      :placeholder="$t('youtube.audioLanguagePlaceholder')"
                    />
                  </label>
                </div>

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

              <!-- Cover (audio only) -->
              <section v-if="kind !== 'video'">
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.coverSection') }}
                </p>
                <div class="flex gap-1 bg-bg-base rounded-xl p-1 w-fit flex-wrap">
                  <button
                    v-for="c in ['thumbnail', 'none', 'frame', 'clip', 'custom'] as const"
                    :key="c"
                    class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    :class="
                      coverType === c
                        ? 'bg-accent-base text-white'
                        : 'text-fg-muted hover:text-fg-base'
                    "
                    @click="coverType = c"
                  >
                    {{ $t('settings.cover.' + c) }}
                  </button>
                </div>
                <div v-if="coverType === 'frame'" class="mt-2 grid grid-cols-1 gap-2">
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.frameTimeLabel') }}
                    <input
                      v-model.number="coverFrameTime"
                      type="number"
                      min="0"
                      class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    />
                  </label>
                </div>
                <div v-else-if="coverType === 'clip'" class="mt-2 grid grid-cols-3 gap-2">
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.clipStartLabel') }}
                    <input
                      v-model.number="coverClipStart"
                      type="number"
                      min="0"
                      class="mt-1 w-full px-2 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    />
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.clipEndLabel') }}
                    <input
                      v-model.number="coverClipEnd"
                      type="number"
                      min="1"
                      class="mt-1 w-full px-2 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    />
                  </label>
                  <label class="block text-xs text-fg-faint">
                    {{ $t('youtube.clipFormatLabel') }}
                    <select
                      v-model="coverClipFormat"
                      class="mt-1 w-full px-2 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                    >
                      <option value="webm">.webm</option>
                      <option value="mp4">.mp4</option>
                    </select>
                  </label>
                </div>
                <div v-else-if="coverType === 'custom'" class="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    class="px-3 py-2 rounded-xl border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
                    @click="pickCustomCover"
                  >
                    {{ $t('youtube.pickCoverFile') }}
                  </button>
                  <span class="text-xs text-fg-faint truncate flex-1">
                    {{ customCoverPath || $t('youtube.coverCustomHint') }}
                  </span>
                </div>
              </section>
            </div>

            <!-- Right column -->
            <div class="space-y-5">
              <!-- Metadata -->
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-1">
                  {{ $t('youtube.metaSection') }}
                </p>
                <p class="text-[11px] text-fg-faint mb-2">{{ $t('youtube.metaHint') }}</p>
                <div class="grid grid-cols-3 gap-2">
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
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.prefOutputDir') }}
                </p>
                <div class="flex items-center gap-2">
                  <select
                    v-model="folderMode"
                    class="flex-1 min-w-0 px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                  >
                    <option value="channel">{{ $t('youtube.prefOutputDirChannel') }}</option>
                    <option value="global">{{ $t('youtube.prefOutputDirGlobal') }}</option>
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
                <input
                  v-else-if="folderMode === 'custom'"
                  v-model="outputDir"
                  readonly
                  class="mt-1 w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                  :placeholder="$t('youtube.prefOutputDirPlaceholder')"
                />
              </section>

              <!-- Filename template -->
              <section>
                <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-1">
                  {{ $t('youtube.prefTemplate') }}
                </p>
                <input
                  v-model="filenameTemplate"
                  class="w-full px-3 py-2 rounded-xl bg-bg-base border border-border-default text-sm focus:border-accent-base focus:outline-none"
                  :placeholder="$t('youtube.prefTemplatePlaceholder')"
                />
                <div class="mt-1.5">
                  <FilenameTemplatePresets @preset="(p) => (filenameTemplate = p)" />
                </div>
              </section>

              <!-- Add to library -->
              <section>
                <label
                  class="flex items-center gap-2 text-sm cursor-pointer select-none"
                  :title="$t('youtube.addToLibraryPrefDesc')"
                >
                  <input
                    v-model="addToLibrary"
                    type="checkbox"
                    class="w-4 h-4 rounded accent-accent-base"
                  />
                  <span>{{ $t('youtube.addToLibraryPref') }}</span>
                </label>
                <p class="mt-1 text-[11px] text-fg-faint">
                  {{ $t('youtube.addToLibraryPrefDesc') }}
                </p>
              </section>
            </div>
          </div>

          <!-- Summary -->
          <div class="p-4 rounded-2xl bg-bg-elevated border border-border-default">
            <p class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-3">
              {{ $t('youtube.prefsSummary') }}
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
              <div
                v-for="(item, idx) in prefsSummary"
                :key="idx"
                class="flex items-start justify-between gap-2 text-xs"
              >
                <span class="text-fg-faint">{{ item.label }}</span>
                <span class="text-fg-base text-right truncate max-w-[60%]" :title="item.value">
                  {{ item.value }}
                </span>
              </div>
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
            <Download v-if="!isEdit" :size="14" />
            {{ isEdit ? $t('common.save') : $t('youtube.subscribeAndSave') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
