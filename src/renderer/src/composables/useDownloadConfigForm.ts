import { ref, computed } from 'vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDownloadProfiles } from '@renderer/composables/useDownloadProfiles';
import { joinPath, sanitizeDirName } from '@renderer/utils/path';
import { buildDownloadConfig, buildSoundcloudDownloadConfig } from '@renderer/utils/downloadConfig';
import { downloadProfileToForm } from '@renderer/utils/downloadProfile';
import type { IpcDownloadConfig } from '@shared/types/ipc';

export interface DownloadConfigFormOptions {
  getChannelTitle: () => string | undefined;
  getPlaylistTitle: () => string | undefined;
  getPlatform: () => 'youtube' | 'soundcloud' | undefined;
}

// Download-config dialog form state, extracted from
// `components/online/DownloadConfigDialog.vue` (plan 2.8).
export function useDownloadConfigForm(options: DownloadConfigFormOptions) {
  const settings = useSettingsStore();
  const isSc = computed(() => options.getPlatform() === 'soundcloud');
  const { profiles, save, remove, ensureLoaded } = useDownloadProfiles();

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

  const baseDir = computed(() => settings.download.defaultPath || systemDownloads.value);
  const channelFolder = computed(() => {
    const title = options.getChannelTitle();
    if (!title || !baseDir.value) return '';
    return joinPath(baseDir.value, sanitizeDirName(title));
  });
  const playlistFolder = computed(() => {
    const title = options.getPlaylistTitle();
    if (!title || !baseDir.value) return '';
    return joinPath(baseDir.value, sanitizeDirName(title));
  });

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

  function confirmConfig(): IpcDownloadConfig {
    // SoundCloud: fixed progressive MP3 — only folder/metadata apply.
    if (isSc.value) {
      return buildSoundcloudDownloadConfig({
        artist: artist.value,
        album: album.value,
        year: year.value,
        folderMode: folderMode.value,
        channelFolder: channelFolder.value,
        playlistFolder: playlistFolder.value,
        outputDir: outputDir.value
      });
    }
    return buildConfig();
  }

  function applyProfile(id: string) {
    const profile = profiles.value.find((p) => p.id === id);
    if (!profile) return;
    const f = downloadProfileToForm(profile.config);
    if (f.kind) kind.value = f.kind;
    if (f.format) format.value = f.format;
    if (f.quality) quality.value = f.quality;
    if (f.audioQuality) audioQuality.value = f.audioQuality;
    if (f.videoContainer) videoContainer.value = f.videoContainer;
    if (f.audioLanguage !== undefined) audioLanguage.value = f.audioLanguage;
    if (f.sponsorBlock) sponsorBlock.value = f.sponsorBlock;
    if (f.trimStart != null) trimStart.value = f.trimStart;
    if (f.trimEnd != null) trimEnd.value = f.trimEnd;
    if (f.filenameTemplate) filenameTemplate.value = f.filenameTemplate;
    if (f.coverType) {
      coverType.value = f.coverType;
      if (f.customCoverPath !== undefined) customPath.value = f.customCoverPath;
      if (f.coverFrameTime !== undefined) frameTime.value = f.coverFrameTime;
      if (f.coverClipStart !== undefined) clipStart.value = f.coverClipStart;
      if (f.coverClipEnd !== undefined) clipEnd.value = f.coverClipEnd;
      if (f.coverClipFormat !== undefined) clipFormat.value = f.coverClipFormat;
    }
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
  }

  return {
    isSc,
    profiles,
    ensureLoaded,
    save,
    remove,
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
    buildConfig,
    applyProfile,
    confirmConfig
  };
}
