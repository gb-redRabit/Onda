import type { SubscriptionDownloadPrefs, CoverSpec, MetaOverride } from '@renderer/types/online';

// Pure subscription-prefs builder extracted from
// `components/online/SubscribeConfigDialog.vue` (plan 2.8). Only values that
// differ from the app defaults are stored, so changing a default later applies
// to existing subscriptions.

export interface SubscribePrefsInput {
  isSc: boolean;
  folderMode: 'channel' | 'global' | 'custom';
  channelFolder: string;
  outputDir: string;
  filenameTemplate: string;
  addToLibrary: boolean;
  kind: 'audio' | 'video';
  format: string;
  quality: string;
  audioQuality: string;
  audioLanguage: string;
  coverType: 'thumbnail' | 'none' | 'frame' | 'clip' | 'custom';
  customCoverPath: string;
  coverFrameTime: number;
  coverClipStart: number;
  coverClipEnd: number;
  coverClipFormat: 'webm' | 'mp4';
  artist: string;
  album: string;
  year: string;
  subsEnabled: boolean;
  subsLangs: string;
  subsFormat: 'srt' | 'vtt' | 'ass';
  subsMode: 'manual' | 'auto' | 'best';
  subsFolder: boolean;
  sponsorBlock: 'off' | 'mark' | 'remove';
  trimStart: number | null;
  trimEnd: number | null;
  selectedProfileId: string;
}

export interface SubscribePrefsDefaults {
  kind: 'audio' | 'video';
  audioFormat: string;
  videoQuality: string;
  audioQuality: string;
  cover: string;
  autoAddDownloadFolder: boolean;
}

export function buildSubscribePrefs(
  i: SubscribePrefsInput,
  d: SubscribePrefsDefaults
): SubscriptionDownloadPrefs {
  // SoundCloud jobs are plain MP3 downloads — only folder/template/library
  // prefs are meaningful.
  if (i.isSc) {
    const scPrefs: SubscriptionDownloadPrefs = {};
    if (i.folderMode === 'channel') scPrefs.outputDir = i.channelFolder;
    else if (i.folderMode === 'custom' && i.outputDir) scPrefs.outputDir = i.outputDir;
    if (i.filenameTemplate.trim()) scPrefs.filenameTemplate = i.filenameTemplate.trim();
    if (i.addToLibrary !== d.autoAddDownloadFolder) scPrefs.addToLibrary = i.addToLibrary;
    return scPrefs;
  }

  const prefs: SubscriptionDownloadPrefs = {};
  if (i.kind !== d.kind) prefs.kind = i.kind;
  if (i.kind === 'audio' && i.format !== d.audioFormat) {
    prefs.format = i.format;
  }
  if (i.kind === 'video' && i.quality !== d.videoQuality) {
    prefs.quality = i.quality;
  }
  if (i.audioQuality !== d.audioQuality) {
    prefs.audioQuality = i.audioQuality;
  }
  if (i.audioLanguage.trim()) prefs.audioLanguage = i.audioLanguage.trim();
  const cover: CoverSpec | undefined = (() => {
    if (i.kind === 'video') {
      // Video downloads embed the YouTube thumbnail by default; "none" is the
      // explicit opt-out, undefined means "keep the default".
      return i.coverType === 'none' ? { type: 'none' } : undefined;
    }
    if (i.coverType === d.cover) return undefined;
    if (i.coverType === 'thumbnail') return { type: 'thumbnail' };
    if (i.coverType === 'custom')
      return i.customCoverPath ? { type: 'custom', customPath: i.customCoverPath } : undefined;
    if (i.coverType === 'frame') return { type: 'frame', frameTime: Number(i.coverFrameTime) || 0 };
    if (i.coverType === 'clip')
      return {
        type: 'clip',
        clipStart: Number(i.coverClipStart) || 0,
        clipEnd: Number(i.coverClipEnd) || 0,
        clipFormat: i.coverClipFormat
      };
    return undefined;
  })();
  if (cover) prefs.cover = cover;
  const meta: MetaOverride = {};
  if (i.artist.trim()) meta.artist = i.artist.trim();
  if (i.album.trim()) meta.album = i.album.trim();
  if (i.year.trim()) meta.year = i.year.trim();
  if (Object.keys(meta).length) prefs.metaOverride = meta;
  if (i.subsEnabled && i.subsLangs.trim()) {
    prefs.subsLangs = i.subsLangs.trim();
    prefs.subsFormat = i.subsFormat;
    prefs.subsMode = i.subsMode;
    prefs.subsFolder = i.subsFolder;
  }
  if (i.folderMode === 'channel') prefs.outputDir = i.channelFolder;
  else if (i.folderMode === 'custom' && i.outputDir) prefs.outputDir = i.outputDir;
  if (i.filenameTemplate.trim()) prefs.filenameTemplate = i.filenameTemplate.trim();
  if (i.addToLibrary !== d.autoAddDownloadFolder) {
    prefs.addToLibrary = i.addToLibrary;
  }
  if (i.sponsorBlock !== 'off') prefs.sponsorBlock = i.sponsorBlock;
  if (i.trimStart != null && i.trimEnd != null && i.trimEnd > i.trimStart) {
    prefs.trimStart = i.trimStart;
    prefs.trimEnd = i.trimEnd;
  }
  if (i.selectedProfileId) prefs.profileId = i.selectedProfileId;
  return prefs;
}
