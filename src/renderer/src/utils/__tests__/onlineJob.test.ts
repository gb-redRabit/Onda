import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  settings: null as any,
  streamTargetFor: vi.fn(
    (video: { id: string; url?: string }) => video.url ?? `https://yt/${video.id}`
  ),
  isSoundcloudItem: vi.fn(() => false),
  sanitizeFileName: vi.fn((value: string) => value.replace(/[^\w.-]+/g, '_')),
  loggerInfo: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('../onlineHelpers', () => ({
  streamTargetFor: h.streamTargetFor,
  isSoundcloudItem: h.isSoundcloudItem,
  sanitizeFileName: h.sanitizeFileName
}));
vi.mock('@shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { buildJob, buildTaskInput, defaultCoverSpec } from '../onlineJob';
import type { VideoSource } from '../onlineJob';

function downloadSettings(overrides: Record<string, unknown> = {}) {
  return {
    defaultKind: 'audio',
    defaultAudioFormat: 'mp3',
    defaultAudioQuality: 'high',
    defaultVideoQuality: '1080p',
    defaultVideoContainer: 'mkv',
    defaultCover: 'none',
    defaultCoverFrameTime: 12,
    defaultCoverClipStart: 3,
    defaultCoverClipEnd: 9,
    defaultCoverClipFormat: 'webm',
    defaultPath: 'D:/Downloads',
    filenameTemplate: '{artist} - {title}',
    defaultSubs: true,
    defaultSubsLangs: 'en,pl',
    ...overrides
  };
}

function video(overrides: Record<string, unknown> = {}): VideoSource {
  return {
    id: 'vid1',
    title: 'A Song',
    thumbnail: 'https://img/1.jpg',
    channelTitle: 'Channel',
    channelId: 'chan1',
    ...overrides
  } as never;
}

beforeEach(() => {
  h.settings = { download: downloadSettings() };
  h.streamTargetFor.mockClear();
  h.isSoundcloudItem.mockReset().mockReturnValue(false);
  h.sanitizeFileName.mockClear();
  h.loggerInfo.mockClear();
});

describe('defaultCoverSpec', () => {
  it('maps thumbnail, frame and clip defaults', () => {
    h.settings.download.defaultCover = 'thumbnail';
    expect(defaultCoverSpec()).toEqual({ type: 'thumbnail' });

    h.settings.download.defaultCover = 'frame';
    expect(defaultCoverSpec()).toEqual({ type: 'frame', frameTime: 12 });

    h.settings.download.defaultCover = 'clip';
    expect(defaultCoverSpec()).toEqual({
      type: 'clip',
      clipStart: 3,
      clipEnd: 9,
      clipFormat: 'webm'
    });
  });

  it('returns undefined for none', () => {
    h.settings.download.defaultCover = 'none';
    expect(defaultCoverSpec()).toBeUndefined();
  });
});

describe('buildJob for yt-dlp sources', () => {
  it('applies the configured audio defaults', () => {
    const job = buildJob(video());

    expect(job).toMatchObject({
      url: 'https://yt/vid1',
      kind: 'audio',
      format: 'mp3',
      quality: '1080p',
      audioQuality: 'high',
      outputDir: 'D:/Downloads',
      filenameTemplate: '{artist} - {title}',
      videoId: 'vid1',
      channelId: 'chan1',
      channelTitle: 'Channel',
      subsLangs: 'en,pl',
      videoContainer: 'mkv',
      sponsorBlock: 'off'
    });
    expect(job.cover).toBeUndefined();
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'yt',
      'buildJob kind=audio defaultSubs=true subsLangs=en,pl'
    );
  });

  it('uses the canonical soundcloud-independent url for the source', () => {
    buildJob(video({ url: 'https://soundcloud.com/a/b', title: 'SC track' }));

    expect(h.streamTargetFor).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://soundcloud.com/a/b' })
    );
  });

  it('defaults video downloads to best quality and a thumbnail cover', () => {
    const job = buildJob(video(), { kind: 'video', format: 'mp4' });

    expect(job).toMatchObject({ kind: 'video', format: 'mp4' });
    expect(job.cover).toEqual({ type: 'thumbnail' });
  });

  it('gives explicit extras priority over subscription prefs and settings', () => {
    const job = buildJob(
      video(),
      { kind: 'video', format: 'mp4', quality: '720p', outputDir: 'E:/Prefs' },
      {
        kind: 'audio',
        format: 'flac',
        quality: 'best',
        audioQuality: 'low',
        outputDir: 'E:/Extra',
        filenameTemplate: '{title}',
        cover: { type: 'none' },
        subsLangs: 'de',
        subsFormat: 'vtt',
        subsMode: 'auto',
        subsFolder: true,
        audioLanguage: 'de',
        videoContainer: 'webm',
        sponsorBlock: 'remove',
        trimStart: 2,
        trimEnd: 8,
        addToLibrary: true,
        channelTitle: 'Override',
        playlistTitle: 'PL',
        metaOverride: { artist: 'A' }
      }
    );

    expect(job).toMatchObject({
      kind: 'audio',
      format: 'flac',
      quality: 'best',
      audioQuality: 'low',
      outputDir: 'E:/Extra',
      filenameTemplate: '{title}',
      cover: { type: 'none' },
      subsLangs: 'de',
      subsFormat: 'vtt',
      subsMode: 'auto',
      subsFolder: true,
      audioLanguage: 'de',
      videoContainer: 'webm',
      sponsorBlock: 'remove',
      trimStart: 2,
      trimEnd: 8,
      addToLibrary: true,
      channelTitle: 'Override',
      playlistTitle: 'PL',
      metaOverride: { artist: 'A' }
    });
  });

  it('uses subscription prefs when extras are absent', () => {
    const job = buildJob(video(), {
      kind: 'audio',
      format: 'opus',
      quality: '480p',
      audioQuality: 'medium',
      outputDir: 'F:/Prefs',
      filenameTemplate: '{title}',
      cover: { type: 'frame', frameTime: 4 },
      subsLangs: 'fr',
      audioLanguage: 'fr',
      sponsorBlock: 'mark',
      trimStart: 1,
      trimEnd: 2,
      addToLibrary: true
    });

    expect(job).toMatchObject({
      format: 'opus',
      quality: '480p',
      audioQuality: 'medium',
      outputDir: 'F:/Prefs',
      filenameTemplate: '{title}',
      cover: { type: 'frame', frameTime: 4 },
      subsLangs: 'fr',
      audioLanguage: 'fr',
      sponsorBlock: 'mark',
      trimStart: 1,
      trimEnd: 2,
      addToLibrary: true,
      channelTitle: 'Channel'
    });
  });

  it('omits subtitle defaults when they are disabled', () => {
    h.settings.download.defaultSubs = false;

    const job = buildJob(video());

    expect(job.subsLangs).toBeUndefined();
    expect(h.loggerInfo).toHaveBeenCalledWith(
      'yt',
      'buildJob kind=audio defaultSubs=false subsLangs=none'
    );
  });

  it('clones reactive metadata overrides', () => {
    const metaOverride = { artist: 'A', album: 'B' };
    const job = buildJob(video(), undefined, { metaOverride });

    expect(job.metaOverride).toEqual(metaOverride);
    expect(job.metaOverride).not.toBe(metaOverride);
  });
});

describe('buildJob for soundcloud', () => {
  beforeEach(() => {
    h.isSoundcloudItem.mockReturnValue(true);
  });

  it('builds a direct MP3 job without the yt-dlp pipeline', () => {
    const job = buildJob(
      video({ id: 'sc1', title: 'My/Track', url: 'https://soundcloud.com/x/y' }),
      { outputDir: 'G:/Prefs', filenameTemplate: '{title}' },
      { outputDir: 'G:/Extra', filenameTemplate: '{artist}', channelTitle: 'Extra' }
    );

    expect(job).toMatchObject({
      url: 'https://soundcloud.com/x/y',
      title: 'My/Track',
      kind: 'audio',
      format: 'mp3',
      outputDir: 'G:/Extra',
      filenameTemplate: '{artist}',
      videoId: 'sc1',
      channelTitle: 'Extra',
      source: { mode: 'soundcloud', fileName: 'My_Track.mp3' }
    });
    expect(job.cover).toBeUndefined();
    expect(job.subsLangs).toBeUndefined();
    expect(job.metaOverride).toBeUndefined();
    expect(h.sanitizeFileName).toHaveBeenCalledWith('My/Track');
    expect(h.loggerInfo).not.toHaveBeenCalled();
  });

  it('falls back to the configured filename template and channel title', () => {
    const job = buildJob(video({ title: 'Track' }));

    expect(job.filenameTemplate).toBe('{artist} - {title}');
    expect(job.channelTitle).toBe('Channel');
    expect(job.playlistTitle).toBeUndefined();
  });

  it('passes an explicit cover through', () => {
    const job = buildJob(video(), undefined, { cover: { type: 'custom', customPath: 'x.jpg' } });

    expect(job.cover).toEqual({ type: 'custom', customPath: 'x.jpg' });
  });
});

describe('buildTaskInput', () => {
  it('maps a queued task back to an IPC input with fallbacks', () => {
    const task = {
      url: 'https://yt/abc',
      title: 'Task',
      thumbnail: 'thumb',
      kind: 'video',
      format: '',
      quality: '',
      outputDir: '',
      videoId: 'abc',
      channelId: 'c',
      channelTitle: 'C',
      playlistTitle: 'P',
      cover: { type: 'thumbnail' },
      metaOverride: { year: '2020' },
      subsLangs: 'en',
      subsFormat: 'srt',
      subsMode: 'manual',
      subsFolder: true,
      audioQuality: 'high',
      audioLanguage: 'en',
      videoContainer: '',
      sponsorBlock: 'off',
      trimStart: 1,
      trimEnd: 2,
      addToLibrary: true,
      source: { mode: 'ytdlp' }
    } as never;

    const input = buildTaskInput(task);

    expect(input).toMatchObject({
      url: 'https://yt/abc',
      title: 'Task',
      kind: 'video',
      format: 'mp3',
      quality: '1080p',
      outputDir: 'D:/Downloads',
      filenameTemplate: '{artist} - {title}',
      videoContainer: 'mkv',
      subsLangs: 'en',
      source: { mode: 'ytdlp' }
    });
  });

  it('keeps explicit task values', () => {
    const task = {
      url: 'u',
      title: 't',
      thumbnail: 'th',
      kind: 'audio',
      format: 'flac',
      quality: '720p',
      outputDir: 'H:/Out',
      videoContainer: 'webm'
    } as never;

    expect(buildTaskInput(task)).toMatchObject({
      format: 'flac',
      quality: '720p',
      outputDir: 'H:/Out',
      videoContainer: 'webm'
    });
  });
});
