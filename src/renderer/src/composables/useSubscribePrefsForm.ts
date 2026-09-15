import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { joinPath, sanitizeDirName } from '@renderer/utils/path';
import { buildSubscribeSummary, type SummaryItem } from '@renderer/utils/subscribeSummary';
import { buildSubscribePrefs } from '@renderer/utils/subscribePrefs';
import { downloadProfileToForm } from '@renderer/utils/downloadProfile';
import type { SubscriptionDownloadPrefs } from '@renderer/types/online';

export interface SubscribePrefsFormOptions {
  getInitialPrefs: () => SubscriptionDownloadPrefs | undefined;
  getChannelTitle: () => string;
  getPlatform: () => 'youtube' | 'soundcloud' | undefined;
}

// Subscription-prefs form state extracted from
// `components/online/SubscribeConfigDialog.vue` (plan 2.8).
export function useSubscribePrefsForm(options: SubscribePrefsFormOptions) {
  const settings = useSettingsStore();
  const { t } = useI18n();
  const { profiles, ensureLoaded } = useDownloadProfiles();

  const isSc = computed(() => options.getPlatform() === 'soundcloud');
  const initial = computed(() => options.getInitialPrefs());

  const selectedProfileId = ref('');
  const systemDownloads = ref('');

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

  const baseDir = computed(() => settings.download.defaultPath || systemDownloads.value);
  const channelFolder = computed(() => {
    const name = sanitizeDirName(options.getChannelTitle());
    return baseDir.value ? joinPath(baseDir.value, name) : name;
  });

  // Single source for both the summary and the confirm payload — avoids
  // repeating the 25-field mapping twice.
  const formValues = computed(() => ({
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
  }));

  const prefsSummary = computed<SummaryItem[]>(() =>
    buildSubscribeSummary(formValues.value, (k) => t(k))
  );

  function confirmPrefs(): SubscriptionDownloadPrefs {
    return buildSubscribePrefs(formValues.value, {
      kind: settings.download.defaultKind,
      audioFormat: settings.download.defaultAudioFormat,
      videoQuality: settings.download.defaultVideoQuality,
      audioQuality: settings.download.defaultAudioQuality,
      cover: settings.download.defaultCover,
      autoAddDownloadFolder: settings.download.autoAddDownloadFolder
    });
  }

  function onProfileSelect(id: string) {
    selectedProfileId.value = id;
    if (!id) return;
    const profile = profiles.value.find((p) => p.id === id);
    if (!profile) return;
    const f = downloadProfileToForm(profile.config);
    if (f.kind) kind.value = f.kind;
    if (f.format) format.value = f.format;
    if (f.quality) quality.value = f.quality;
    if (f.audioQuality) audioQuality.value = f.audioQuality;
    if (f.audioLanguage !== undefined) audioLanguage.value = f.audioLanguage;
    if (f.coverType) {
      coverType.value = f.coverType;
      if (f.customCoverPath !== undefined) customCoverPath.value = f.customCoverPath;
      if (f.coverFrameTime !== undefined) coverFrameTime.value = f.coverFrameTime;
      if (f.coverClipStart !== undefined) coverClipStart.value = f.coverClipStart;
      if (f.coverClipEnd !== undefined) coverClipEnd.value = f.coverClipEnd;
      if (f.coverClipFormat !== undefined) coverClipFormat.value = f.coverClipFormat;
    }
    if (f.filenameTemplate) filenameTemplate.value = f.filenameTemplate;
    if (f.artist !== undefined) artist.value = f.artist;
    if (f.album !== undefined) album.value = f.album;
    if (f.year !== undefined) year.value = f.year;
    if (f.outputDir) {
      folderMode.value = 'custom';
      outputDir.value = f.outputDir;
    }
    if (f.subsEnabled) {
      subsEnabled.value = true;
      subsLangs.value = f.subsLangs ?? subsLangs.value;
      subsFormat.value = f.subsFormat ?? subsFormat.value;
      subsMode.value = f.subsMode ?? subsMode.value;
      subsFolder.value = f.subsFolder ?? false;
    }
    if (f.addToLibrary !== undefined) addToLibrary.value = f.addToLibrary;
    if (f.sponsorBlock) sponsorBlock.value = f.sponsorBlock;
    if (f.trimStart != null) trimStart.value = f.trimStart;
    if (f.trimEnd != null) trimEnd.value = f.trimEnd;
  }

  return {
    isSc,
    profiles,
    ensureLoaded,
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
  };
}
