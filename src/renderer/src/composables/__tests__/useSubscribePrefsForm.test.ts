import { beforeEach, describe, expect, it, vi } from 'vitest';

// Formularz preferencji subskrypcji: store, helpery i tłumaczenia są podstawione.
const state = vi.hoisted(() => ({
  settings: {
    download: {
      defaultKind: 'audio' as 'audio' | 'video',
      defaultAudioFormat: 'mp3',
      defaultVideoQuality: '1080',
      defaultAudioQuality: 'best',
      defaultCover: 'thumbnail' as 'thumbnail' | 'none' | 'frame' | 'clip' | 'custom',
      autoAddDownloadFolder: true,
      defaultPath: '/downloads'
    }
  },
  profiles: { value: [] as Array<{ id: string; config: Record<string, unknown> }> },
  ensureLoaded: vi.fn(),
  buildSubscribeSummary: vi.fn((values: unknown, translate: unknown) => [{ values, translate }]),
  buildSubscribePrefs: vi.fn((values: Record<string, unknown>, defaults: unknown) => ({
    values,
    defaults
  })),
  downloadProfileToForm: vi.fn((): Record<string, unknown> => ({}))
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => `t:${key}` }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useDownloadProfiles', () => ({
  useDownloadProfiles: () => ({
    profiles: state.profiles,
    ensureLoaded: state.ensureLoaded
  })
}));
vi.mock('@renderer/utils/path', () => ({
  joinPath: (a: string, b: string) => `${a}/${b}`,
  sanitizeDirName: (name: string) => name.trim().replace(/[/\\:*?"<>|]/g, '_')
}));
vi.mock('@renderer/utils/subscribeSummary', () => ({
  buildSubscribeSummary: state.buildSubscribeSummary
}));
vi.mock('@renderer/utils/subscribePrefs', () => ({
  buildSubscribePrefs: state.buildSubscribePrefs
}));
vi.mock('@renderer/utils/downloadProfile', () => ({
  downloadProfileToForm: state.downloadProfileToForm
}));

const { useSubscribePrefsForm } = await import('../useSubscribePrefsForm');

let initial: Record<string, unknown> | undefined;
let channelTitle = '';
let platform: 'youtube' | 'soundcloud' | undefined = 'youtube';

function setup() {
  return useSubscribePrefsForm({
    getInitialPrefs: () => initial as never,
    getChannelTitle: () => channelTitle,
    getPlatform: () => platform
  });
}

beforeEach(() => {
  state.settings.download.defaultKind = 'audio';
  state.settings.download.defaultAudioFormat = 'mp3';
  state.settings.download.defaultVideoQuality = '1080';
  state.settings.download.defaultAudioQuality = 'best';
  state.settings.download.defaultCover = 'thumbnail';
  state.settings.download.autoAddDownloadFolder = true;
  state.settings.download.defaultPath = '/downloads';
  state.profiles.value = [];
  state.ensureLoaded.mockClear();
  state.buildSubscribeSummary.mockClear();
  state.buildSubscribePrefs.mockClear();
  state.downloadProfileToForm.mockReset();
  state.downloadProfileToForm.mockReturnValue({});
  initial = undefined;
  channelTitle = '';
  platform = 'youtube';
});

describe('initial values', () => {
  it('uses global settings without saved prefs', () => {
    const form = setup();

    expect(form.kind.value).toBe('audio');
    expect(form.format.value).toBe('mp3');
    expect(form.quality.value).toBe('1080');
    expect(form.audioQuality.value).toBe('best');
    expect(form.coverType.value).toBe('thumbnail');
    expect(form.subsEnabled.value).toBe(false);
    expect(form.subsLangs.value).toBe('pl,en');
    expect(form.subsFormat.value).toBe('srt');
    expect(form.subsMode.value).toBe('best');
    expect(form.folderMode.value).toBe('channel');
    expect(form.addToLibrary.value).toBe(true);
    expect(form.sponsorBlock.value).toBe('off');
    expect(form.trimStart.value).toBeNull();
    expect(form.trimEnd.value).toBeNull();
    expect(form.selectedProfileId.value).toBe('');
  });

  it('prefers saved prefs over global settings', () => {
    initial = {
      kind: 'video',
      format: 'flac',
      quality: '720',
      audioQuality: 'high',
      audioLanguage: 'de',
      cover: {
        type: 'custom',
        customPath: '/custom.jpg',
        frameTime: 12,
        clipStart: 3,
        clipEnd: 9,
        clipFormat: 'mp4'
      },
      filenameTemplate: '%artist% - %title%',
      metaOverride: { artist: 'Artist', album: 'Album', year: '2001' },
      subsLangs: 'de,en',
      subsFormat: 'vtt',
      subsMode: 'manual',
      subsFolder: true,
      outputDir: '/custom',
      addToLibrary: false,
      sponsorBlock: 'remove',
      trimStart: 5,
      trimEnd: 10
    };
    const form = setup();

    expect(form.kind.value).toBe('video');
    expect(form.format.value).toBe('flac');
    expect(form.quality.value).toBe('720');
    expect(form.audioQuality.value).toBe('high');
    expect(form.audioLanguage.value).toBe('de');
    expect(form.coverType.value).toBe('custom');
    expect(form.customCoverPath.value).toBe('/custom.jpg');
    expect(form.coverFrameTime.value).toBe(12);
    expect(form.coverClipStart.value).toBe(3);
    expect(form.coverClipEnd.value).toBe(9);
    expect(form.coverClipFormat.value).toBe('mp4');
    expect(form.filenameTemplate.value).toBe('%artist% - %title%');
    expect(form.artist.value).toBe('Artist');
    expect(form.album.value).toBe('Album');
    expect(form.year.value).toBe('2001');
    expect(form.subsEnabled.value).toBe(true);
    expect(form.subsLangs.value).toBe('de,en');
    expect(form.subsFormat.value).toBe('vtt');
    expect(form.subsMode.value).toBe('manual');
    expect(form.subsFolder.value).toBe(true);
    expect(form.folderMode.value).toBe('custom');
    expect(form.outputDir.value).toBe('/custom');
    expect(form.addToLibrary.value).toBe(false);
    expect(form.sponsorBlock.value).toBe('remove');
    expect(form.trimStart.value).toBe(5);
    expect(form.trimEnd.value).toBe(10);
  });

  it('derives the SoundCloud flag', () => {
    platform = 'soundcloud';
    expect(setup().isSc.value).toBe(true);
    platform = 'youtube';
    expect(setup().isSc.value).toBe(false);
  });
});

describe('channel folder', () => {
  it('joins the sanitized channel name with the base directory', () => {
    channelTitle = 'My / Channel';
    const form = setup();
    expect(form.channelFolder.value).toBe('/downloads/My _ Channel');
  });

  it('returns the sanitized name when there is no base directory', () => {
    channelTitle = 'Channel';
    state.settings.download.defaultPath = '';
    const form = setup();
    expect(form.channelFolder.value).toBe('Channel');

    form.systemDownloads.value = '/system';
    expect(form.channelFolder.value).toBe('/system/Channel');
  });
});

describe('summary and confirmation', () => {
  it('builds the summary from form values and the translator', () => {
    const form = setup();
    const summary = form.prefsSummary.value;

    expect(state.buildSubscribeSummary).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'audio', folderMode: 'channel', selectedProfileId: '' }),
      expect.any(Function)
    );
    const translate = (summary as unknown as Array<{ translate: (k: string) => string }>)[0]
      .translate;
    expect(translate('key')).toBe('t:key');
  });

  it('builds prefs with global defaults', () => {
    const form = setup();
    form.kind.value = 'video';
    form.artist.value = 'Artist';

    const prefs = form.confirmPrefs();

    expect(prefs).toMatchObject({
      values: expect.objectContaining({ kind: 'video', artist: 'Artist' }),
      defaults: {
        kind: 'audio',
        audioFormat: 'mp3',
        videoQuality: '1080',
        audioQuality: 'best',
        cover: 'thumbnail',
        autoAddDownloadFolder: true
      }
    });
  });

  it('exposes profile loading helpers', () => {
    const form = setup();
    expect(form.profiles).toBe(state.profiles);
    expect(form.ensureLoaded).toBe(state.ensureLoaded);
  });
});

describe('profile selection', () => {
  it('clears the selection without touching the form', () => {
    const form = setup();
    form.kind.value = 'video';

    form.onProfileSelect('');

    expect(form.selectedProfileId.value).toBe('');
    expect(state.downloadProfileToForm).not.toHaveBeenCalled();
    expect(form.kind.value).toBe('video');
  });

  it('ignores an unknown profile but keeps the id', () => {
    const form = setup();
    form.onProfileSelect('missing');
    expect(form.selectedProfileId.value).toBe('missing');
    expect(state.downloadProfileToForm).not.toHaveBeenCalled();
  });

  it('applies every mapped profile field', () => {
    state.profiles.value = [{ id: 'p1', config: { kind: 'video' } }];
    state.downloadProfileToForm.mockReturnValue({
      kind: 'video',
      format: 'flac',
      quality: '720',
      audioQuality: 'high',
      audioLanguage: 'de',
      coverType: 'clip',
      customCoverPath: '/c.jpg',
      coverFrameTime: 15,
      coverClipStart: 2,
      coverClipEnd: 8,
      coverClipFormat: 'mp4',
      filenameTemplate: '%title%',
      artist: 'Artist',
      album: 'Album',
      year: '2001',
      outputDir: '/out',
      subsEnabled: true,
      subsLangs: 'fr',
      subsFormat: 'ass',
      subsMode: 'auto',
      subsFolder: true,
      addToLibrary: false,
      sponsorBlock: 'mark',
      trimStart: 1,
      trimEnd: 2
    });
    const form = setup();

    form.onProfileSelect('p1');

    expect(form.selectedProfileId.value).toBe('p1');
    expect(form.kind.value).toBe('video');
    expect(form.format.value).toBe('flac');
    expect(form.quality.value).toBe('720');
    expect(form.audioQuality.value).toBe('high');
    expect(form.audioLanguage.value).toBe('de');
    expect(form.coverType.value).toBe('clip');
    expect(form.customCoverPath.value).toBe('/c.jpg');
    expect(form.coverFrameTime.value).toBe(15);
    expect(form.coverClipStart.value).toBe(2);
    expect(form.coverClipEnd.value).toBe(8);
    expect(form.coverClipFormat.value).toBe('mp4');
    expect(form.filenameTemplate.value).toBe('%title%');
    expect(form.artist.value).toBe('Artist');
    expect(form.album.value).toBe('Album');
    expect(form.year.value).toBe('2001');
    expect(form.folderMode.value).toBe('custom');
    expect(form.outputDir.value).toBe('/out');
    expect(form.subsEnabled.value).toBe(true);
    expect(form.subsLangs.value).toBe('fr');
    expect(form.subsFormat.value).toBe('ass');
    expect(form.subsMode.value).toBe('auto');
    expect(form.subsFolder.value).toBe(true);
    expect(form.addToLibrary.value).toBe(false);
    expect(form.sponsorBlock.value).toBe('mark');
    expect(form.trimStart.value).toBe(1);
    expect(form.trimEnd.value).toBe(2);
  });

  it('leaves unrelated values for a minimal profile', () => {
    state.profiles.value = [{ id: 'p2', config: {} }];
    state.downloadProfileToForm.mockReturnValue({ format: 'opus' });
    const form = setup();

    form.onProfileSelect('p2');

    expect(form.format.value).toBe('opus');
    expect(form.kind.value).toBe('audio');
    expect(form.folderMode.value).toBe('channel');
    expect(form.addToLibrary.value).toBe(true);
  });
});
