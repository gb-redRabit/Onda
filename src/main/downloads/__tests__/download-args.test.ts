import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  mkdir: vi.fn(),
  mapTemplate: vi.fn((template: string) => `mapped-${template}`),
  formatSelector: vi.fn((quality: string, kind: string) => `${kind}:${quality}`),
  resolveOutputDir: vi.fn(() => 'D:/out'),
  thumbnailArgs: vi.fn(() => ['--write-thumbnail']),
  sectionArgs: vi.fn((from: number, to: number) => ['--download-sections', `${from}-${to}`]),
  subtitleArgs: vi.fn((opts: unknown) => ['--subs', JSON.stringify(opts)]),
  sponsorArgs: vi.fn(() => ['--sponsor']),
  readNetwork: vi.fn(),
  readSpeed: vi.fn(),
  addRoot: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock('fs/promises', () => ({ mkdir: state.mkdir }));
vi.mock('../download-helpers', () => ({
  mapFilenameTemplate: state.mapTemplate,
  buildFormatSelector: state.formatSelector,
  resolveOutputDir: state.resolveOutputDir
}));
vi.mock('../cover-spec', () => ({
  buildThumbnailArgs: state.thumbnailArgs,
  buildSectionArgs: state.sectionArgs
}));
vi.mock('../subtitle-args', () => ({ buildSubtitleArgs: state.subtitleArgs }));
vi.mock('../sponsorblock', () => ({ buildSponsorBlockArgs: state.sponsorArgs }));
vi.mock('../../ipc/proxy-utils', () => ({
  readNetworkArgs: state.readNetwork,
  readSpeedLimitArgs: state.readSpeed
}));
vi.mock('../../media/media-server', () => ({ addAllowedRoot: state.addRoot }));
vi.mock('../../../shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));

import { buildBaseArgs } from '../download-args';

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    url: 'https://www.youtube.com/watch?v=x',
    kind: 'video',
    format: 'mp4',
    quality: '1080p',
    filenameTemplate: '{title}',
    source: { mode: 'youtube' },
    ...overrides
  } as never;
}

beforeEach(() => {
  state.mkdir.mockReset();
  state.mkdir.mockResolvedValue(undefined);
  state.mapTemplate.mockClear();
  state.formatSelector.mockClear();
  state.resolveOutputDir.mockClear();
  state.thumbnailArgs.mockClear();
  state.sectionArgs.mockClear();
  state.subtitleArgs.mockClear();
  state.sponsorArgs.mockClear();
  state.readNetwork.mockReset();
  state.readNetwork.mockResolvedValue(['--proxy', 'socks']);
  state.readSpeed.mockReset();
  state.readSpeed.mockResolvedValue(['--limit-rate', '1M']);
  state.addRoot.mockReset();
  state.loggerInfo.mockReset();
});

describe('base args', () => {
  it('returns nothing for provider jobs', async () => {
    const args = await buildBaseArgs(job({ source: { mode: 'provider' } }));

    expect(args).toEqual([]);
    expect(state.mkdir).not.toHaveBeenCalled();
    expect(state.addRoot).not.toHaveBeenCalled();
  });

  it('builds video arguments with output folder and network settings', async () => {
    const args = await buildBaseArgs(job());

    expect(state.resolveOutputDir).toHaveBeenCalled();
    expect(state.mkdir).toHaveBeenCalledWith('D:/out', { recursive: true });
    expect(state.addRoot).toHaveBeenCalledWith('D:/out');
    expect(state.mapTemplate).toHaveBeenCalledWith('{title}');
    expect(args).toEqual([
      '--newline',
      '--no-playlist',
      '--no-warnings',
      '--continue',
      '-o',
      join('D:/out', 'mapped-{title}.%(ext)s'),
      '-f',
      'video:1080p',
      '--merge-output-format',
      'mp4',
      '--embed-metadata',
      '--embed-chapters',
      '--sponsor',
      '--proxy',
      'socks',
      '--limit-rate',
      '1M',
      '--',
      'https://www.youtube.com/watch?v=x'
    ]);
    expect(state.readNetwork).toHaveBeenCalledWith('youtube');
  });

  it('rejects non-http URLs after preparing the folder', async () => {
    await expect(buildBaseArgs(job({ url: 'file:///etc/passwd' }))).rejects.toThrow(
      'Invalid download URL'
    );
    expect(state.mkdir).toHaveBeenCalled();
  });

  it('accepts plain http', async () => {
    const args = await buildBaseArgs(job({ url: 'http://example.com/a.mp4' }));
    expect(args.at(-1)).toBe('http://example.com/a.mp4');
  });
});

describe('audio', () => {
  it('keeps the native stream for best audio and drops thumbnail embedding', async () => {
    const args = await buildBaseArgs(
      job({ kind: 'audio', format: 'best', quality: 'high', cover: { type: 'thumbnail' } })
    );

    expect(args).toContain('audio:high');
    expect(args).not.toContain('--extract-audio');
    expect(args).not.toContain('--write-thumbnail');
  });

  it('transcodes encoded audio with the quality map', async () => {
    const args = await buildBaseArgs(job({ kind: 'audio', format: 'mp3', audioQuality: 'medium' }));

    expect(args).toEqual(
      expect.arrayContaining([
        '--extract-audio',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '--embed-metadata',
        '--embed-chapters'
      ])
    );
  });

  it('falls back to the best audio quality for unknown values', async () => {
    const args = await buildBaseArgs(job({ kind: 'audio', format: 'mp3', audioQuality: 'weird' }));
    expect(args).toContain('0');
  });

  it('embeds thumbnails and marks fetching', async () => {
    const media = job({
      kind: 'audio',
      format: 'mp3',
      cover: { type: 'thumbnail' }
    }) as Record<string, any>;
    const args = await buildBaseArgs(media as never);

    expect(args).toContain('--write-thumbnail');
    expect(media.coverStatus).toBe('fetching');
    expect(media.cover).toEqual({ type: 'thumbnail' });
  });
});

describe('video covers', () => {
  it('embeds thumbnails for mp4', async () => {
    const media = job({ cover: { type: 'thumbnail' } }) as Record<string, any>;
    const args = await buildBaseArgs(media as never);

    expect(args).toContain('--write-thumbnail');
    expect(media.coverStatus).toBe('fetching');
  });

  it('drops thumbnails for WebM', async () => {
    const media = job({ videoContainer: 'webm', cover: { type: 'thumbnail' } }) as Record<
      string,
      any
    >;
    const args = await buildBaseArgs(media as never);

    expect(args).not.toContain('--write-thumbnail');
    expect(media.cover).toBeUndefined();
    expect(media.coverStatus).toBeUndefined();
  });

  it('leaves other cover types untouched', async () => {
    const media = job({ cover: { type: 'clip' } }) as Record<string, any>;
    await buildBaseArgs(media as never);

    expect(media.cover).toEqual({ type: 'clip' });
    expect(media.coverStatus).toBeUndefined();
  });

  it('uses the configured container', async () => {
    const args = await buildBaseArgs(job({ videoContainer: 'mkv' }));
    const index = args.indexOf('--merge-output-format');
    expect(args[index + 1]).toBe('mkv');
  });
});

describe('optional flags', () => {
  it('adds audio language, headers and trim sections', async () => {
    const args = await buildBaseArgs(
      job({
        audioLanguage: 'pl',
        source: { mode: 'youtube', headers: { 'X-Test': '1', Empty: '' } },
        trimStart: 5,
        trimEnd: 10
      })
    );

    expect(args).toEqual(
      expect.arrayContaining([
        '--audio-language',
        'pl',
        '--add-header',
        'X-Test: 1',
        '--download-sections',
        '5-10'
      ])
    );
    expect(args).not.toContain('--add-header Empty: ');
  });

  it('skips invalid trim ranges', async () => {
    await buildBaseArgs(job({ trimStart: 10, trimEnd: 5 }));
    await buildBaseArgs(job({ trimStart: 'a', trimEnd: 5 }));
    await buildBaseArgs(job({ trimStart: 1 }));

    expect(state.sectionArgs).not.toHaveBeenCalled();
  });

  it('adds subtitle flags and logs the request', async () => {
    const args = await buildBaseArgs(
      job({
        subsLangs: 'pl,en',
        subsFormat: 'srt',
        subsMode: 'sidecar',
        kind: 'video'
      })
    );

    expect(state.subtitleArgs).toHaveBeenCalledWith({
      langs: 'pl,en',
      format: 'srt',
      mode: 'sidecar',
      kind: 'video',
      embed: true
    });
    expect(args).toContain('--subs');
    expect(state.loggerInfo).toHaveBeenCalledWith(
      'downloads',
      'subtitle download enabled for job-1 (langs=pl,en)'
    );
  });

  it('uses SoundCloud network settings', async () => {
    await buildBaseArgs(job({ source: { mode: 'soundcloud' } }));
    expect(state.readNetwork).toHaveBeenCalledWith('soundcloud');
  });
});
