import type { CoverSpec, MetaOverride } from '@renderer/types/online';
import type { IpcDownloadConfig } from '@shared/types/ipc';

// Pure download-config builder extracted from
// `components/online/DownloadConfigDialog.vue` (plan 2.8).

export interface DownloadConfigInput {
  kind: 'audio' | 'video';
  format: string;
  audioQuality: string;
  quality: string;
  videoContainer: 'mp4' | 'mkv' | 'webm';
  audioLanguage: string;
  filenameTemplate: string;
  sponsorBlock: 'off' | 'mark' | 'remove';
  trimStart: number | null;
  trimEnd: number | null;
  coverType: 'thumbnail' | 'custom' | 'frame' | 'clip' | 'none';
  customPath: string;
  frameTime: number;
  clipStart: number;
  clipEnd: number;
  clipFormat: 'webm' | 'mp4';
  artist: string;
  album: string;
  year: string;
  folderMode: 'global' | 'channel' | 'playlist' | 'custom';
  channelFolder: string;
  playlistFolder: string;
  outputDir: string;
  subsEnabled: boolean;
  subsLangs: string;
  subsFormat: 'srt' | 'vtt' | 'ass';
  subsMode: 'manual' | 'auto' | 'best';
  subsFolder: boolean;
}

export function buildDownloadConfig(input: DownloadConfigInput): IpcDownloadConfig {
  const cover: CoverSpec | undefined = (() => {
    if (input.kind === 'video') {
      // Video downloads embed the YouTube thumbnail by default; "none" is the
      // explicit opt-out (animated covers are an audio feature).
      return input.coverType === 'none' ? { type: 'none' } : { type: 'thumbnail' };
    }
    if (input.coverType === 'none') return { type: 'none' };
    if (input.coverType === 'custom') {
      return input.customPath ? { type: 'custom', customPath: input.customPath } : undefined;
    }
    if (input.coverType === 'frame') {
      return { type: 'frame', frameTime: Number(input.frameTime) || 0 };
    }
    if (input.coverType === 'clip') {
      return {
        type: 'clip',
        clipStart: Number(input.clipStart) || 0,
        clipEnd: Number(input.clipEnd) || 0,
        clipFormat: input.clipFormat
      };
    }
    return { type: 'thumbnail' };
  })();
  const metaOverride: MetaOverride = {};
  if (input.artist.trim()) metaOverride.artist = input.artist.trim();
  if (input.album.trim()) metaOverride.album = input.album.trim();
  if (input.year.trim()) metaOverride.year = input.year.trim();
  let resolvedDir: string | undefined;
  if (input.folderMode === 'channel') resolvedDir = input.channelFolder || undefined;
  else if (input.folderMode === 'playlist') resolvedDir = input.playlistFolder || undefined;
  else if (input.folderMode === 'custom') resolvedDir = input.outputDir || undefined;
  return {
    kind: input.kind,
    ...(input.kind === 'audio' ? { format: input.format } : {}),
    ...(input.kind === 'audio' ? { audioQuality: input.audioQuality } : {}),
    ...(input.kind === 'video' ? { quality: input.quality } : {}),
    ...(input.kind === 'video' ? { videoContainer: input.videoContainer } : {}),
    ...(input.audioLanguage.trim() ? { audioLanguage: input.audioLanguage.trim() } : {}),
    filenameTemplate: input.filenameTemplate.trim() || undefined,
    sponsorBlock: input.sponsorBlock,
    ...(input.trimStart != null && input.trimEnd != null && input.trimEnd > input.trimStart
      ? { trimStart: input.trimStart, trimEnd: input.trimEnd }
      : {}),
    ...(cover ? { cover } : {}),
    ...(Object.keys(metaOverride).length ? { metaOverride } : {}),
    ...(resolvedDir ? { outputDir: resolvedDir } : {}),
    ...(input.subsEnabled && input.subsLangs.trim()
      ? {
          subsLangs: input.subsLangs.trim(),
          subsFormat: input.subsFormat,
          subsMode: input.subsMode,
          subsFolder: input.subsFolder
        }
      : {})
  };
}
