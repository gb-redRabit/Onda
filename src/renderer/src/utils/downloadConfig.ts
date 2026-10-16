import type { CoverSpec, MetaOverride } from '@renderer/types/online';
import type { IpcDownloadConfig } from '@shared/types/ipc';
import { buildCoverSpec } from '@shared/coverSpec';

// Czysty builder konfiguracji pobierania wydzielony z
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
  const cover: CoverSpec | undefined =
    input.kind === 'video'
      ? // Pobierania wideo domyślnie osadzają miniaturę YouTube; "none" to
        // jawne wyłączenie (animowane okładki są funkcją audio).
        input.coverType === 'none'
        ? { type: 'none' }
        : { type: 'thumbnail' }
      : buildCoverSpec({
          type: input.coverType,
          customPath: input.customPath,
          frameTime: input.frameTime,
          clipStart: input.clipStart,
          clipEnd: input.clipEnd,
          clipFormat: input.clipFormat
        });
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

export interface SoundcloudDownloadInput {
  artist: string;
  album: string;
  year: string;
  folderMode: 'global' | 'channel' | 'playlist' | 'custom';
  channelFolder: string;
  playlistFolder: string;
  outputDir: string;
}

// SoundCloud to stały progresywny MP3 — mają zastosowanie tylko nadpisania
// folderu + metadanych (bez okładki/napisów/formatu). Wydzielone z
// `useDownloadConfigForm.ts` (plan 2.8).
export function buildSoundcloudDownloadConfig(input: SoundcloudDownloadInput): IpcDownloadConfig {
  const metaOverride: MetaOverride = {};
  if (input.artist.trim()) metaOverride.artist = input.artist.trim();
  if (input.album.trim()) metaOverride.album = input.album.trim();
  if (input.year.trim()) metaOverride.year = input.year.trim();
  let resolvedDir: string | undefined;
  if (input.folderMode === 'channel') resolvedDir = input.channelFolder || undefined;
  else if (input.folderMode === 'playlist') resolvedDir = input.playlistFolder || undefined;
  else if (input.folderMode === 'custom') resolvedDir = input.outputDir || undefined;
  return {
    kind: 'audio',
    format: 'mp3',
    ...(Object.keys(metaOverride).length ? { metaOverride } : {}),
    ...(resolvedDir ? { outputDir: resolvedDir } : {})
  };
}
