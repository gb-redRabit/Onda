import type {
  DownloadTask,
  SubscriptionDownloadPrefs,
  CoverSpec,
  MetaOverride,
  YouTubeVideo,
  YouTubeResolvedItem
} from '@renderer/types/online';
import type { IpcDownloadJobInput } from '@shared/types/ipc';
import { logger } from '@shared/logger';
import { useSettingsStore } from '@renderer/stores/settings';
import { streamTargetFor, isSoundcloudItem, sanitizeFileName } from './onlineHelpers';

// Job building extracted from `stores/online.ts` (plan 2.7). Only depends on the
// (global) settings store + the pure online helpers.

export type VideoSource = YouTubeVideo | YouTubeResolvedItem;

export interface JobExtra {
  kind?: 'audio' | 'video';
  format?: string;
  quality?: string;
  audioQuality?: string;
  videoContainer?: 'mp4' | 'mkv' | 'webm';
  filenameTemplate?: string;
  cover?: CoverSpec;
  metaOverride?: MetaOverride;
  channelTitle?: string;
  playlistTitle?: string;
  outputDir?: string;
  subsLangs?: string;
  subsFormat?: 'srt' | 'vtt' | 'ass';
  subsMode?: 'manual' | 'auto' | 'best';
  subsFolder?: boolean;
  audioLanguage?: string;
  sponsorBlock?: 'off' | 'mark' | 'remove';
  trimStart?: number;
  trimEnd?: number;
  addToLibrary?: boolean;
}

export function defaultCoverSpec(): CoverSpec | undefined {
  const d = useSettingsStore().download;
  switch (d.defaultCover) {
    case 'thumbnail':
      return { type: 'thumbnail' };
    case 'frame':
      return { type: 'frame', frameTime: d.defaultCoverFrameTime };
    case 'clip':
      return {
        type: 'clip',
        clipStart: d.defaultCoverClipStart,
        clipEnd: d.defaultCoverClipEnd,
        clipFormat: d.defaultCoverClipFormat
      };
    default:
      return undefined;
  }
}

export function buildJob(
  video: VideoSource,
  prefs?: SubscriptionDownloadPrefs,
  extra?: JobExtra
): IpcDownloadJobInput {
  const settings = useSettingsStore();
  const kind = extra?.kind ?? prefs?.kind ?? settings.download.defaultKind ?? 'audio';
  const format =
    kind === 'video'
      ? (extra?.format ?? prefs?.format ?? 'best')
      : (extra?.format ?? prefs?.format ?? settings.download.defaultAudioFormat);
  const quality = extra?.quality ?? prefs?.quality ?? settings.download.defaultVideoQuality;
  const audioQuality =
    extra?.audioQuality ?? prefs?.audioQuality ?? settings.download.defaultAudioQuality;
  const videoContainer = extra?.videoContainer ?? settings.download.defaultVideoContainer ?? 'mp4';
  // Canonical page URL: SC items carry their permalink (ids cannot be
  // rebuilt into a URL); YT falls back to the classic watch URL.
  const jobUrl = streamTargetFor(video);
  const scJob = isSoundcloudItem(video);
  // SoundCloud downloads bypass yt-dlp entirely: the manager resolves a
  // fresh progressive-MP3 URL at attempt start. No covers/subs/tag pipeline.
  if (scJob) {
    return {
      url: jobUrl,
      title: video.title,
      thumbnail: video.thumbnail,
      kind,
      format,
      quality,
      audioQuality,
      outputDir: extra?.outputDir ?? prefs?.outputDir ?? settings.download.defaultPath ?? '',
      filenameTemplate:
        extra?.filenameTemplate ??
        prefs?.filenameTemplate ??
        settings.download.filenameTemplate ??
        '{title} - {artist}',
      videoId: video.id,
      channelId: video.channelId,
      channelTitle: extra?.channelTitle || video.channelTitle,
      playlistTitle: extra?.playlistTitle,
      cover: extra?.cover !== undefined ? extra.cover : undefined,
      source: {
        mode: 'soundcloud',
        fileName: `${sanitizeFileName(video.title)}.mp3`
      }
    };
  }
  // Audio covers follow the global default (thumbnail/frame/clip/none); video
  // downloads always embed the YouTube thumbnail by default. An explicit
  // cover (including `none`) always wins over the defaults.
  const cover =
    extra?.cover !== undefined || prefs?.cover !== undefined
      ? (extra?.cover ?? prefs?.cover)
      : kind === 'audio'
        ? defaultCoverSpec()
        : ({ type: 'thumbnail' } as const);
  const subsLangs =
    extra?.subsLangs ??
    prefs?.subsLangs ??
    (settings.download.defaultSubs ? settings.download.defaultSubsLangs : undefined);
  logger.info(
    'yt',
    `buildJob kind=${kind} defaultSubs=${settings.download.defaultSubs} subsLangs=${subsLangs || 'none'}`
  );
  return {
    url: jobUrl,
    title: video.title,
    thumbnail: video.thumbnail,
    kind,
    format,
    quality,
    audioQuality,
    outputDir: extra?.outputDir ?? prefs?.outputDir ?? settings.download.defaultPath ?? '',
    filenameTemplate:
      extra?.filenameTemplate ??
      prefs?.filenameTemplate ??
      settings.download.filenameTemplate ??
      '{title} - {artist}',
    videoId: video.id,
    channelId: video.channelId,
    channelTitle: extra?.channelTitle || video.channelTitle,
    playlistTitle: extra?.playlistTitle,
    cover,
    metaOverride: extra?.metaOverride ?? prefs?.metaOverride,
    subsLangs,
    subsFormat: extra?.subsFormat,
    subsMode: extra?.subsMode,
    subsFolder: extra?.subsFolder,
    audioLanguage: extra?.audioLanguage ?? prefs?.audioLanguage,
    videoContainer,
    sponsorBlock: extra?.sponsorBlock ?? prefs?.sponsorBlock ?? 'off',
    trimStart: extra?.trimStart ?? prefs?.trimStart,
    trimEnd: extra?.trimEnd ?? prefs?.trimEnd,
    addToLibrary: extra?.addToLibrary ?? prefs?.addToLibrary
  };
}

export function buildTaskInput(task: DownloadTask): IpcDownloadJobInput {
  const settings = useSettingsStore();
  return {
    url: task.url,
    title: task.title,
    thumbnail: task.thumbnail,
    kind: task.kind,
    format: task.format || settings.download.defaultAudioFormat,
    quality: task.quality || settings.download.defaultVideoQuality,
    outputDir: task.outputDir || settings.download.defaultPath || '',
    filenameTemplate: settings.download.filenameTemplate || '{title} - {artist}',
    videoId: task.videoId,
    channelId: task.channelId,
    channelTitle: task.channelTitle,
    playlistTitle: task.playlistTitle,
    cover: task.cover,
    metaOverride: task.metaOverride,
    subsLangs: task.subsLangs,
    subsFormat: task.subsFormat,
    subsMode: task.subsMode,
    subsFolder: task.subsFolder,
    audioQuality: task.audioQuality,
    audioLanguage: task.audioLanguage,
    videoContainer: task.videoContainer || settings.download.defaultVideoContainer,
    sponsorBlock: task.sponsorBlock,
    trimStart: task.trimStart,
    trimEnd: task.trimEnd,
    addToLibrary: task.addToLibrary,
    source: task.source
  };
}
