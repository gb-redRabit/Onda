import { describe, it, expect } from 'vitest';
import {
  buildSubscribePrefs,
  type SubscribePrefsInput,
  type SubscribePrefsDefaults
} from '../subscribePrefs';

// Siatka regresyjna dla buildera preferencji subskrypcji: zapisuje TYLKO wartości
// różne od domyślnych i ma osobne, prostsze zachowanie dla SoundCloud.

const defaults: SubscribePrefsDefaults = {
  kind: 'audio',
  audioFormat: 'mp3',
  videoQuality: 'best',
  audioQuality: 'best',
  cover: 'thumbnail',
  autoAddDownloadFolder: false
};

function input(o: Partial<SubscribePrefsInput> = {}): SubscribePrefsInput {
  return {
    isSc: false,
    folderMode: 'global',
    channelFolder: 'C:/chan',
    outputDir: '',
    filenameTemplate: '',
    addToLibrary: false,
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    audioQuality: 'best',
    audioLanguage: '',
    coverType: 'thumbnail',
    customCoverPath: '',
    coverFrameTime: 0,
    coverClipStart: 0,
    coverClipEnd: 0,
    coverClipFormat: 'webm',
    artist: '',
    album: '',
    year: '',
    subsEnabled: false,
    subsLangs: '',
    subsFormat: 'srt',
    subsMode: 'best',
    subsFolder: false,
    sponsorBlock: 'off',
    trimStart: null,
    trimEnd: null,
    selectedProfileId: '',
    ...o
  };
}

describe('SoundCloud preferences', () => {
  it('keeps only folder/template/library and uses the channel folder', () => {
    const prefs = buildSubscribePrefs(
      input({
        isSc: true,
        folderMode: 'channel',
        filenameTemplate: '  {title}  ',
        addToLibrary: true
      }),
      defaults
    );
    expect(prefs).toEqual({
      outputDir: 'C:/chan',
      filenameTemplate: '{title}',
      addToLibrary: true
    });
  });

  it('omits the output dir for global mode and library when equal to the default', () => {
    const prefs = buildSubscribePrefs(
      input({ isSc: true, folderMode: 'global', addToLibrary: false }),
      { ...defaults, autoAddDownloadFolder: false }
    );
    expect(prefs.outputDir).toBeUndefined();
    expect(prefs.addToLibrary).toBeUndefined();
  });
});

describe('YouTube preferences', () => {
  it('records kind and quality for a video differing from defaults', () => {
    const prefs = buildSubscribePrefs(input({ kind: 'video', quality: '1080p' }), defaults);
    expect(prefs.kind).toBe('video');
    expect(prefs.quality).toBe('1080p');
    expect(prefs.format).toBeUndefined();
  });

  it('records format and audioQuality for audio differing from defaults', () => {
    const prefs = buildSubscribePrefs(
      input({ kind: 'audio', format: 'opus', audioQuality: 'high' }),
      defaults
    );
    expect(prefs.kind).toBeUndefined();
    expect(prefs.format).toBe('opus');
    expect(prefs.audioQuality).toBe('high');
  });

  it('stores trim only when the range is valid', () => {
    expect(buildSubscribePrefs(input({ trimStart: 5, trimEnd: 10 }), defaults)).toMatchObject({
      trimStart: 5,
      trimEnd: 10
    });
    expect(
      buildSubscribePrefs(input({ trimStart: 10, trimEnd: 5 }), defaults).trimStart
    ).toBeUndefined();
    expect(
      buildSubscribePrefs(input({ trimStart: 5, trimEnd: null }), defaults).trimStart
    ).toBeUndefined();
  });
});

describe('covers', () => {
  it('builds a custom audio cover only when a path is given', () => {
    expect(
      buildSubscribePrefs(input({ coverType: 'custom', customCoverPath: 'C:/c.png' }), defaults)
        .cover
    ).toEqual({ type: 'custom', customPath: 'C:/c.png' });
    expect(
      buildSubscribePrefs(input({ coverType: 'custom', customCoverPath: '' }), defaults).cover
    ).toBeUndefined();
  });

  it('omits an audio cover equal to the default and a frame cover', () => {
    expect(buildSubscribePrefs(input({ coverType: 'thumbnail' }), defaults).cover).toBeUndefined();
    expect(
      buildSubscribePrefs(input({ coverType: 'frame', coverFrameTime: 3 }), defaults).cover
    ).toEqual({
      type: 'frame',
      frameTime: 3
    });
  });

  it('treats video "none" as an explicit opt-out and keeps other video covers default', () => {
    expect(
      buildSubscribePrefs(input({ kind: 'video', coverType: 'none' }), defaults).cover
    ).toEqual({
      type: 'none'
    });
    expect(
      buildSubscribePrefs(input({ kind: 'video', coverType: 'thumbnail' }), defaults).cover
    ).toBeUndefined();
  });
});

describe('metadata, subtitles and misc', () => {
  it('collects meta override from trimmed values', () => {
    const prefs = buildSubscribePrefs(input({ artist: ' A ', album: 'B', year: '' }), defaults);
    expect(prefs.metaOverride).toEqual({ artist: 'A', album: 'B' });
  });

  it('stores subtitles only when enabled with languages', () => {
    expect(
      buildSubscribePrefs(
        input({
          subsEnabled: true,
          subsLangs: 'pl,en',
          subsFormat: 'vtt',
          subsMode: 'manual',
          subsFolder: true
        }),
        defaults
      )
    ).toMatchObject({
      subsLangs: 'pl,en',
      subsFormat: 'vtt',
      subsMode: 'manual',
      subsFolder: true
    });
    expect(
      buildSubscribePrefs(input({ subsEnabled: true, subsLangs: '' }), defaults).subsLangs
    ).toBeUndefined();
  });

  it('records sponsorBlock, profileId and folder/template/library', () => {
    const prefs = buildSubscribePrefs(
      input({
        sponsorBlock: 'mark',
        selectedProfileId: 'p1',
        folderMode: 'channel',
        filenameTemplate: '{artist} - {title}',
        addToLibrary: true
      }),
      defaults
    );
    expect(prefs.sponsorBlock).toBe('mark');
    expect(prefs.profileId).toBe('p1');
    expect(prefs.outputDir).toBe('C:/chan');
    expect(prefs.filenameTemplate).toBe('{artist} - {title}');
    expect(prefs.addToLibrary).toBe(true);
  });

  it('omits addToLibrary when it equals the auto-add default', () => {
    const prefs = buildSubscribePrefs(input({ addToLibrary: true }), {
      ...defaults,
      autoAddDownloadFolder: true
    });
    expect(prefs.addToLibrary).toBeUndefined();
  });
});
