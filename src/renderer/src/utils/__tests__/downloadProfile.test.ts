import { describe, expect, it } from 'vitest';
import type { IpcDownloadConfig } from '@shared/types/ipc';

import { downloadProfileToForm } from '../downloadProfile';

function config(overrides: Partial<IpcDownloadConfig> = {}): IpcDownloadConfig {
  return overrides as IpcDownloadConfig;
}

describe('downloadProfileToForm', () => {
  it('returns an empty form for an empty config', () => {
    expect(downloadProfileToForm(config())).toEqual({});
  });

  it('copies scalar fields', () => {
    expect(
      downloadProfileToForm(
        config({
          kind: 'video',
          format: 'mp4',
          quality: '1080',
          audioQuality: '320',
          videoContainer: 'mkv',
          audioLanguage: '',
          filenameTemplate: '{title}',
          outputDir: 'D:/out',
          sponsorBlock: 'remove',
          trimStart: 0,
          trimEnd: 90
        })
      )
    ).toEqual({
      kind: 'video',
      format: 'mp4',
      quality: '1080',
      audioQuality: '320',
      videoContainer: 'mkv',
      audioLanguage: '',
      filenameTemplate: '{title}',
      outputDir: 'D:/out',
      sponsorBlock: 'remove',
      trimStart: 0,
      trimEnd: 90
    });
  });

  it('maps custom cover paths', () => {
    expect(
      downloadProfileToForm(config({ cover: { type: 'custom', customPath: 'D:/cover.jpg' } }))
    ).toEqual({ coverType: 'custom', customCoverPath: 'D:/cover.jpg' });

    expect(downloadProfileToForm(config({ cover: { type: 'custom' } }))).toEqual({
      coverType: 'custom',
      customCoverPath: ''
    });
  });

  it('maps frame covers with a default timestamp', () => {
    expect(downloadProfileToForm(config({ cover: { type: 'frame' } }))).toEqual({
      coverType: 'frame',
      coverFrameTime: 30
    });
    expect(downloadProfileToForm(config({ cover: { type: 'frame', frameTime: 45 } }))).toEqual({
      coverType: 'frame',
      coverFrameTime: 45
    });
  });

  it('maps clip covers with defaults and explicit values', () => {
    expect(downloadProfileToForm(config({ cover: { type: 'clip' } }))).toEqual({
      coverType: 'clip',
      coverClipStart: 0,
      coverClipEnd: 30,
      coverClipFormat: 'webm'
    });
    expect(
      downloadProfileToForm(
        config({
          cover: {
            type: 'clip',
            clipStart: 5,
            clipEnd: 10,
            clipFormat: 'mp4'
          }
        })
      )
    ).toEqual({
      coverType: 'clip',
      coverClipStart: 5,
      coverClipEnd: 10,
      coverClipFormat: 'mp4'
    });
  });

  it('keeps thumbnail covers minimal', () => {
    expect(downloadProfileToForm(config({ cover: { type: 'thumbnail' } }))).toEqual({
      coverType: 'thumbnail'
    });
  });

  it('maps metadata overrides with empty fallbacks', () => {
    expect(
      downloadProfileToForm(
        config({ metaOverride: { artist: 'Artist', album: 'Album', year: '2024' } })
      )
    ).toMatchObject({ artist: 'Artist', album: 'Album', year: '2024' });

    expect(downloadProfileToForm(config({ metaOverride: {} }))).toEqual({
      artist: '',
      album: '',
      year: ''
    });
  });

  it('enables subtitles with defaults when languages exist', () => {
    expect(downloadProfileToForm(config({ subsLangs: 'en,pl' }))).toEqual({
      subsEnabled: true,
      subsLangs: 'en,pl',
      subsFormat: 'srt',
      subsMode: 'best',
      subsFolder: false
    });
    expect(
      downloadProfileToForm(
        config({ subsLangs: 'en', subsFormat: 'vtt', subsMode: 'auto', subsFolder: true })
      )
    ).toEqual({
      subsEnabled: true,
      subsLangs: 'en',
      subsFormat: 'vtt',
      subsMode: 'auto',
      subsFolder: true
    });
  });

  it('keeps explicit false flags and ignores undefined ones', () => {
    expect(downloadProfileToForm(config({ addToLibrary: false }))).toEqual({
      addToLibrary: false
    });
    expect(downloadProfileToForm(config({ addToLibrary: true }))).toEqual({
      addToLibrary: true
    });
  });
});
