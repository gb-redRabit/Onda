import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildCoverSpec: vi.fn((spec: Record<string, unknown>) => ({ type: 'built', spec }))
}));

vi.mock('@shared/coverSpec', () => ({ buildCoverSpec: mocks.buildCoverSpec }));

import {
  buildDownloadConfig,
  buildSoundcloudDownloadConfig,
  type DownloadConfigInput
} from '../downloadConfig';

function input(overrides: Partial<DownloadConfigInput> = {}): DownloadConfigInput {
  return {
    kind: 'audio',
    format: 'mp3',
    audioQuality: 'high',
    quality: '1080p',
    videoContainer: 'mp4',
    audioLanguage: '  ',
    filenameTemplate: '  ',
    sponsorBlock: 'off',
    trimStart: null,
    trimEnd: null,
    coverType: 'frame',
    customPath: '',
    frameTime: 5,
    clipStart: 1,
    clipEnd: 2,
    clipFormat: 'webm',
    artist: '',
    album: '',
    year: '',
    folderMode: 'global',
    channelFolder: '',
    playlistFolder: '',
    outputDir: '',
    subsEnabled: false,
    subsLangs: '',
    subsFormat: 'srt',
    subsMode: 'manual',
    subsFolder: false,
    ...overrides
  };
}

beforeEach(() => {
  mocks.buildCoverSpec.mockClear();
});

describe('audio config', () => {
  it('keeps audio format/quality and builds the cover from fields', () => {
    const config = buildDownloadConfig(input({ coverType: 'clip', clipStart: 3, clipEnd: 9 }));

    expect(config).toMatchObject({
      kind: 'audio',
      format: 'mp3',
      audioQuality: 'high'
    });
    expect(config).not.toHaveProperty('quality');
    expect(config).not.toHaveProperty('videoContainer');
    expect(mocks.buildCoverSpec).toHaveBeenCalledWith({
      type: 'clip',
      customPath: '',
      frameTime: 5,
      clipStart: 3,
      clipEnd: 9,
      clipFormat: 'webm'
    });
    expect(config.cover).toEqual({ type: 'built', spec: expect.any(Object) });
  });
});

describe('video config', () => {
  it('keeps video fields and always embeds a thumbnail unless none', () => {
    const withThumb = buildDownloadConfig(input({ kind: 'video', coverType: 'frame' }));
    expect(withThumb).toMatchObject({
      kind: 'video',
      quality: '1080p',
      videoContainer: 'mp4',
      cover: { type: 'thumbnail' }
    });
    expect(withThumb).not.toHaveProperty('format');
    expect(mocks.buildCoverSpec).not.toHaveBeenCalled();

    const none = buildDownloadConfig(input({ kind: 'video', coverType: 'none' }));
    expect(none.cover).toEqual({ type: 'none' });
  });
});

describe('metadata and folders', () => {
  it('trims metadata and omits empty values', () => {
    expect(buildDownloadConfig(input())).not.toHaveProperty('metaOverride');

    const config = buildDownloadConfig(input({ artist: ' A ', album: ' B ', year: ' 2001 ' }));
    expect(config.metaOverride).toEqual({ artist: 'A', album: 'B', year: '2001' });
  });

  it('resolves channel, playlist and custom folders', () => {
    expect(
      buildDownloadConfig(input({ folderMode: 'channel', channelFolder: 'C:/Chan' })).outputDir
    ).toBe('C:/Chan');
    expect(
      buildDownloadConfig(input({ folderMode: 'playlist', playlistFolder: 'C:/PL' })).outputDir
    ).toBe('C:/PL');
    expect(
      buildDownloadConfig(input({ folderMode: 'custom', outputDir: 'C:/Custom' })).outputDir
    ).toBe('C:/Custom');
    expect(buildDownloadConfig(input({ folderMode: 'global' }))).not.toHaveProperty('outputDir');
  });

  it('falls back to no output dir when the selected folder is empty', () => {
    expect(buildDownloadConfig(input({ folderMode: 'channel' }))).not.toHaveProperty('outputDir');
    expect(buildDownloadConfig(input({ folderMode: 'playlist' }))).not.toHaveProperty('outputDir');
    expect(buildDownloadConfig(input({ folderMode: 'custom' }))).not.toHaveProperty('outputDir');
  });
});

describe('optional fields', () => {
  it('trims the filename template and audio language', () => {
    const config = buildDownloadConfig(
      input({ filenameTemplate: ' {title} ', audioLanguage: ' pl ' })
    );

    expect(config.filenameTemplate).toBe('{title}');
    expect(config.audioLanguage).toBe('pl');
  });

  it('omits empty filename and language', () => {
    const config = buildDownloadConfig(input());

    expect(config.filenameTemplate).toBeUndefined();
    expect(config).not.toHaveProperty('audioLanguage');
  });

  it('only includes a valid trim range', () => {
    expect(buildDownloadConfig(input({ trimStart: 2, trimEnd: 8 }))).toMatchObject({
      trimStart: 2,
      trimEnd: 8
    });
    expect(buildDownloadConfig(input({ trimStart: 8, trimEnd: 2 }))).not.toHaveProperty(
      'trimStart'
    );
    expect(buildDownloadConfig(input({ trimStart: 2 }))).not.toHaveProperty('trimStart');
  });

  it('includes subtitles only when enabled and languages are set', () => {
    expect(buildDownloadConfig(input({ subsLangs: 'en' }))).not.toHaveProperty('subsLangs');

    const config = buildDownloadConfig(
      input({
        subsEnabled: true,
        subsLangs: ' en,pl ',
        subsFormat: 'vtt',
        subsMode: 'auto',
        subsFolder: true
      })
    );
    expect(config).toMatchObject({
      subsLangs: 'en,pl',
      subsFormat: 'vtt',
      subsMode: 'auto',
      subsFolder: true
    });
  });

  it('always forwards sponsorBlock', () => {
    expect(buildDownloadConfig(input({ sponsorBlock: 'remove' })).sponsorBlock).toBe('remove');
  });
});

describe('soundcloud config', () => {
  it('builds the fixed MP3 config with metadata and folder overrides', () => {
    expect(
      buildSoundcloudDownloadConfig({
        artist: ' A ',
        album: ' B ',
        year: ' 1999 ',
        folderMode: 'playlist',
        channelFolder: '',
        playlistFolder: 'C:/PL',
        outputDir: ''
      })
    ).toEqual({
      kind: 'audio',
      format: 'mp3',
      metaOverride: { artist: 'A', album: 'B', year: '1999' },
      outputDir: 'C:/PL'
    });
  });

  it('omits empty metadata and folders', () => {
    expect(
      buildSoundcloudDownloadConfig({
        artist: '',
        album: '',
        year: '',
        folderMode: 'channel',
        channelFolder: '',
        playlistFolder: '',
        outputDir: ''
      })
    ).toEqual({ kind: 'audio', format: 'mp3' });
  });

  it('supports channel and custom folders', () => {
    const base = {
      artist: '',
      album: '',
      year: '',
      channelFolder: '',
      playlistFolder: '',
      outputDir: ''
    };
    expect(
      buildSoundcloudDownloadConfig({ ...base, folderMode: 'channel', channelFolder: 'C:/C' })
        .outputDir
    ).toBe('C:/C');
    expect(
      buildSoundcloudDownloadConfig({ ...base, folderMode: 'custom', outputDir: 'C:/O' }).outputDir
    ).toBe('C:/O');
  });
});
