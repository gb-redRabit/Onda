<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { X, Download, Tv2 } from '@lucide/vue';
import { useUIStore } from '@renderer/stores/ui';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { useI18n } from 'vue-i18n';
import { joinPath, sanitizeDirName } from '@renderer/utils/path';
import { buildSubscribeSummary, type SummaryItem } from '@renderer/utils/subscribeSummary';
import { buildSubscribePrefs } from '@renderer/utils/subscribePrefs';
import SubscribePrefsSummary from './SubscribePrefsSummary.vue';
import SubscribeScopeSelector from './SubscribeScopeSelector.vue';
import SubscribeChannelCard from './SubscribeChannelCard.vue';
import SubscribeSubtitlesSection from './SubscribeSubtitlesSection.vue';
import MetadataFieldsSection from './MetadataFieldsSection.vue';
import SubscribeOutputSection from './SubscribeOutputSection.vue';
import SubscribeFormatSection from './SubscribeFormatSection.vue';
import { useRemoteImage } from '@renderer/composables/useRemoteImage';
import type { SubscriptionDownloadPrefs } from '@renderer/types/online';

const props = withDefaults(
  defineProps<{
    channel: { channelId: string; channelTitle: string; channelThumbnail?: string };
    mode?: 'create' | 'edit';
    initialPrefs?: SubscriptionDownloadPrefs;
    /** SoundCloud subscriptions only use folder/template/library prefs. */
    platform?: 'youtube' | 'soundcloud';
  }>(),
  {
    mode: 'create'
  }
);

// SoundCloud downloads are progressive MP3s via the internal API — kind,
// format, quality, covers, subtitles and sponsor-block do not apply.
const isSc = computed(() => props.platform === 'soundcloud');

const emit = defineEmits<{
  confirm: [payload: { prefs?: SubscriptionDownloadPrefs; downloadAll: boolean }];
  cancel: [];
}>();

const isEdit = computed(() => props.mode === 'edit');

const settings = useSettingsStore();
const { t } = useI18n();
const { profiles, ensureLoaded } = useDownloadProfiles();
const selectedProfileId = ref('');
const systemDownloads = ref('');
const avatarFailed = ref(false);
const avatarSrc = useRemoteImage(computed(() => props.channel.channelThumbnail));

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

const prefsSummary = computed<SummaryItem[]>(() =>
  buildSubscribeSummary(
    {
      isSc: isSc.value,
      folderMode: folderMode.value,
      channelFolder: channelFolder.value,
      outputDir: outputDir.value,
      filenameTemplate: filenameTemplate.value,
      addToLibrary: addToLibrary.value,
      kind: kind.value,
      format: format.value,
      quality: quality.value,
      audioQuality: audioQuality.value,
      audioLanguage: audioLanguage.value,
      coverType: coverType.value,
      sponsorBlock: sponsorBlock.value,
      trimStart: trimStart.value,
      trimEnd: trimEnd.value,
      subsEnabled: subsEnabled.value,
      subsLangs: subsLangs.value,
      artist: artist.value,
      album: album.value,
      year: year.value
    },
    (k) => t(k)
  )
);

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
  const prefs = buildSubscribePrefs(
    {
      isSc: isSc.value,
      folderMode: folderMode.value,
      channelFolder: channelFolder.value,
      outputDir: outputDir.value,
      filenameTemplate: filenameTemplate.value,
      addToLibrary: addToLibrary.value,
      kind: kind.value,
      format: format.value,
      quality: quality.value,
      audioQuality: audioQuality.value,
      audioLanguage: audioLanguage.value,
      coverType: coverType.value,
      customCoverPath: customCoverPath.value,
      coverFrameTime: coverFrameTime.value,
      coverClipStart: coverClipStart.value,
      coverClipEnd: coverClipEnd.value,
      coverClipFormat: coverClipFormat.value,
      artist: artist.value,
      album: album.value,
      year: year.value,
      subsEnabled: subsEnabled.value,
      subsLangs: subsLangs.value,
      subsFormat: subsFormat.value,
      subsMode: subsMode.value,
      subsFolder: subsFolder.value,
      sponsorBlock: sponsorBlock.value,
      trimStart: trimStart.value,
      trimEnd: trimEnd.value,
      selectedProfileId: selectedProfileId.value
    },
    {
      kind: settings.download.defaultKind,
      audioFormat: settings.download.defaultAudioFormat,
      videoQuality: settings.download.defaultVideoQuality,
      audioQuality: settings.download.defaultAudioQuality,
      cover: settings.download.defaultCover,
      autoAddDownloadFolder: settings.download.autoAddDownloadFolder
    }
  );
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
      class="fixed inset-0 z-9999 bg-neutral/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="onOverlayClickSub"
    >
      <div
        class="bg-base-100 border border-base-300 rounded-box w-full max-w-3xl max-h-[92vh] shadow-2xl overflow-hidden flex flex-col"
      >
        <!-- Header -->
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
            <h3 class="text-sm font-semibold text-base-content">
              {{ isEdit ? $t('youtube.downloadPrefs') : $t('youtube.subscribeConfigTitle') }}
            </h3>
            <p class="text-xs text-base-content/50 truncate">{{ props.channel.channelTitle }}</p>
          </div>
          <button
            class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>
        <!-- Body -->
        <div class="flex-1 overflow-auto px-5 py-5 space-y-5">
          <!-- Channel card -->
          <SubscribeChannelCard :channel="props.channel" :is-sc="isSc" :is-edit="isEdit" />

          <!-- Scope (create only) -->
          <SubscribeScopeSelector v-model="downloadAll" :is-edit="isEdit" />

          <!-- Preferences grid -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <!-- Left column -->
            <div class="space-y-5">
              <!-- Profile -->
              <section v-if="!isSc">
                <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.profilesSection') }}
                </p>
                <select
                  :value="selectedProfileId"
                  class="w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                  @change="onProfileSelect"
                >
                  <option value="">{{ $t('youtube.profileNone') }}</option>
                  <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </section>

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

              <!-- Cover (audio only) -->
              <section v-if="!isSc && kind !== 'video'">
                <p class="text-xs text-base-content/50 font-medium uppercase tracking-wider mb-2">
                  {{ $t('youtube.coverSection') }}
                </p>
                <div
                  class="flex gap-1 bg-base-200/[var(--glass-alpha)] rounded-box p-1 w-fit flex-wrap"
                >
                  <button
                    v-for="c in ['thumbnail', 'none', 'frame', 'clip', 'custom'] as const"
                    :key="c"
                    class="fx-noise px-3 py-1.5 fx-depth rounded-field text-xs font-medium transition-colors"
                    :class="
                      coverType === c
                        ? 'bg-primary text-primary-content'
                        : 'text-base-content/70 hover:text-base-content'
                    "
                    @click="coverType = c"
                  >
                    {{ $t('settings.cover.' + c) }}
                  </button>
                </div>
                <div v-if="coverType === 'frame'" class="mt-2 grid grid-cols-1 gap-2">
                  <label class="block text-xs text-base-content/50">
                    {{ $t('youtube.frameTimeLabel') }}
                    <input
                      v-model.number="coverFrameTime"
                      type="number"
                      min="0"
                      class="mt-1 w-full px-3 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                </div>
                <div v-else-if="coverType === 'clip'" class="mt-2 grid grid-cols-3 gap-2">
                  <label class="block text-xs text-base-content/50">
                    {{ $t('youtube.clipStartLabel') }}
                    <input
                      v-model.number="coverClipStart"
                      type="number"
                      min="0"
                      class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label class="block text-xs text-base-content/50">
                    {{ $t('youtube.clipEndLabel') }}
                    <input
                      v-model.number="coverClipEnd"
                      type="number"
                      min="1"
                      class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label class="block text-xs text-base-content/50">
                    {{ $t('youtube.clipFormatLabel') }}
                    <select
                      v-model="coverClipFormat"
                      class="mt-1 w-full px-2 py-2 fx-depth rounded-field bg-base-200/[var(--glass-alpha)] border border-base-300 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="webm">.webm</option>
                      <option value="mp4">.mp4</option>
                    </select>
                  </label>
                </div>
                <div v-else-if="coverType === 'custom'" class="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    class="fx-noise px-3 py-2 fx-depth rounded-field border border-base-300 text-xs text-base-content/70 hover:bg-base-content/10 transition-colors"
                    @click="pickCustomCover"
                  >
                    {{ $t('youtube.pickCoverFile') }}
                  </button>
                  <span class="text-xs text-base-content/50 truncate flex-1">
                    {{ customCoverPath || $t('youtube.coverCustomHint') }}
                  </span>
                </div>
              </section>
            </div>

            <!-- Right column -->
            <div class="space-y-5">
              <!-- Metadata -->
              <MetadataFieldsSection
                v-if="!isSc"
                v-model:artist="artist"
                v-model:album="album"
                v-model:year="year"
                grid-class="grid-cols-3 gap-2"
              />

              <!-- Subtitles -->
              <SubscribeSubtitlesSection
                v-model:subs-enabled="subsEnabled"
                v-model:subs-langs="subsLangs"
                v-model:subs-mode="subsMode"
                v-model:subs-format="subsFormat"
                v-model:subs-folder="subsFolder"
                :is-sc="isSc"
              />

              <!-- Output folder -->
              <SubscribeOutputSection
                v-model:folder-mode="folderMode"
                v-model:output-dir="outputDir"
                v-model:filename-template="filenameTemplate"
                v-model:add-to-library="addToLibrary"
                :channel-folder="channelFolder"
              />
            </div>
          </div>

          <!-- Summary -->
          <SubscribePrefsSummary :items="prefsSummary" />
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
            <Download v-if="!isEdit" :size="14" />
            {{ isEdit ? $t('common.save') : $t('youtube.subscribeAndSave') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
