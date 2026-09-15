import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { joinPath, sanitizeDirName } from '@renderer/utils/path';
import { buildSubscribeSummary, type SummaryItem } from '@renderer/utils/subscribeSummary';
import { buildSubscribePrefs } from '@renderer/utils/subscribePrefs';
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

  async function init() {
    if (!settings.download.defaultPath) {
      try {
        const p = (await window.api.invoke('app:getPath', 'downloads')) as string;
        systemDownloads.value = p || '';
      } catch {
        systemDownloads.value = '';
      }
    }
    void ensureLoaded();
  }

  const baseDir = computed(() => settings.download.defaultPath || systemDownloads.value);
  const channelFolder = computed(() => {
    const name = sanitizeDirName(options.getChannelTitle());
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

  function confirmPrefs(): SubscriptionDownloadPrefs {
    return buildSubscribePrefs(
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
  }

  function onProfileSelect(id: string) {
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

  return {
    isSc,
    profiles,
    ensureLoaded,
    init,
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
