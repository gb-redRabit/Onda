import { beforeEach, describe, expect, it, vi } from 'vitest';

// Formularz pobierania: store i czyste helpery są podstawione, sprawdzamy
// mapowanie ustawień, folderów, profilu i payloadu konfiguracji.
const state = vi.hoisted(() => ({
  settings: {
    download: {
      defaultKind: 'audio' as 'audio' | 'video',
      defaultAudioFormat: 'mp3',
      defaultVideoQuality: '1080',
      defaultAudioQuality: 'best',
      defaultVideoContainer: 'mp4' as 'mp4' | 'mkv' | 'webm',
      filenameTemplate: '%title%',
      defaultPath: '/downloads'
    }
  },
  profiles: { value: [] as Array<{ id: string; config: Record<string, unknown> }> },
  save: vi.fn(),
  remove: vi.fn(),
  ensureLoaded: vi.fn(),
  buildDownloadConfig: vi.fn((input: Record<string, unknown>) => ({ kind: 'built', ...input })),
  buildSoundcloudDownloadConfig: vi.fn((input: Record<string, unknown>) => ({
    kind: 'sc',
    ...input
  })),
  downloadProfileToForm: vi.fn((): Record<string, unknown> => ({}))
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useDownloadProfiles', () => ({
  useDownloadProfiles: () => ({
    profiles: state.profiles,
    save: state.save,
    remove: state.remove,
    ensureLoaded: state.ensureLoaded
  })
}));
vi.mock('@renderer/utils/path', () => ({
  joinPath: (a: string, b: string) => `${a}/${b}`,
  sanitizeDirName: (name: string) => name.trim().replace(/[/\\:*?"<>|]/g, '_')
}));
vi.mock('@renderer/utils/downloadConfig', () => ({
  buildDownloadConfig: state.buildDownloadConfig,
  buildSoundcloudDownloadConfig: state.buildSoundcloudDownloadConfig
}));
vi.mock('@renderer/utils/downloadProfile', () => ({
  downloadProfileToForm: state.downloadProfileToForm
}));

const { useDownloadConfigForm } = await import('../useDownloadConfigForm');

function setup(
  overrides: Partial<{
    getChannelTitle: () => string | undefined;
    getPlaylistTitle: () => string | undefined;
    getPlatform: () => 'youtube' | 'soundcloud' | 'generic' | undefined;
  }> = {}
) {
  return useDownloadConfigForm({
    getChannelTitle: () => undefined,
    getPlaylistTitle: () => undefined,
    getPlatform: () => 'youtube',
    ...overrides
  });
}

beforeEach(() => {
  state.settings.download.defaultKind = 'audio';
  state.settings.download.defaultAudioFormat = 'mp3';
  state.settings.download.defaultVideoQuality = '1080';
  state.settings.download.defaultAudioQuality = 'best';
  state.settings.download.defaultVideoContainer = 'mp4';
  state.settings.download.filenameTemplate = '%title%';
  state.settings.download.defaultPath = '/downloads';
  state.profiles.value = [];
  state.save.mockClear();
  state.remove.mockClear();
  state.ensureLoaded.mockClear();
  state.buildDownloadConfig.mockClear();
  state.buildSoundcloudDownloadConfig.mockClear();
  state.downloadProfileToForm.mockReset();
  state.downloadProfileToForm.mockReturnValue({});
});

describe('initial values', () => {
  it('takes defaults from settings', () => {
    const form = setup();

    expect(form.kind.value).toBe('audio');
    expect(form.format.value).toBe('mp3');
    expect(form.quality.value).toBe('1080');
    expect(form.audioQuality.value).toBe('best');
    expect(form.videoContainer.value).toBe('mp4');
    expect(form.filenameTemplate.value).toBe('%title%');
    expect(form.coverType.value).toBe('thumbnail');
    expect(form.subsMode.value).toBe('best');
    expect(form.folderMode.value).toBe('global');
  });

  it('derives the platform flags', () => {
    expect(setup({ getPlatform: () => 'soundcloud' }).isSc.value).toBe(true);
    expect(setup({ getPlatform: () => 'generic' }).isGeneric.value).toBe(true);
    expect(setup({ getPlatform: () => 'youtube' }).isSc.value).toBe(false);
  });

  it('falls back to the system downloads directory for folders', () => {
    state.settings.download.defaultPath = '';
    const form = setup({ getChannelTitle: () => 'Channel' });
    expect(form.channelFolder.value).toBe('');

    form.systemDownloads.value = '/system/downloads';
    expect(form.channelFolder.value).toBe('/system/downloads/Channel');
  });
});

describe('folders', () => {
  it('builds sanitized channel and playlist folders', () => {
    const form = setup({
      getChannelTitle: () => 'My / Channel',
      getPlaylistTitle: () => 'Best: Mix'
    });

    expect(form.channelFolder.value).toBe('/downloads/My _ Channel');
    expect(form.playlistFolder.value).toBe('/downloads/Best_ Mix');
  });

  it('returns empty folders without a title or base directory', () => {
    const noTitles = setup();
    expect(noTitles.channelFolder.value).toBe('');
    expect(noTitles.playlistFolder.value).toBe('');

    state.settings.download.defaultPath = '';
    const noBase = setup({ getChannelTitle: () => 'Channel', getPlaylistTitle: () => 'List' });
    expect(noBase.channelFolder.value).toBe('');
    expect(noBase.playlistFolder.value).toBe('');
  });
});

describe('config building', () => {
  it('passes every form field to the download config builder', () => {
    const form = setup({ getChannelTitle: () => 'Channel', getPlaylistTitle: () => 'List' });
    form.kind.value = 'video';
    form.coverType.value = 'custom';
    form.customPath.value = '/covers/a.jpg';
    form.folderMode.value = 'channel';
    form.subsEnabled.value = true;

    const config = form.buildConfig();

    expect(config).toMatchObject({
      kind: 'video',
      format: 'mp3',
      quality: '1080',
      coverType: 'custom',
      customPath: '/covers/a.jpg',
      folderMode: 'channel',
      channelFolder: '/downloads/Channel',
      playlistFolder: '/downloads/List',
      subsEnabled: true
    });
    expect(state.buildDownloadConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        coverType: 'custom',
        customPath: '/covers/a.jpg',
        folderMode: 'channel',
        channelFolder: '/downloads/Channel',
        playlistFolder: '/downloads/List',
        subsEnabled: true
      })
    );
  });

  it('uses the SoundCloud builder for SoundCloud', () => {
    const form = setup({ getPlatform: () => 'soundcloud' });
    form.artist.value = 'Artist';
    form.album.value = 'Album';
    form.year.value = '2001';

    const config = form.confirmConfig();

    expect(state.buildSoundcloudDownloadConfig).toHaveBeenCalledWith({
      artist: 'Artist',
      album: 'Album',
      year: '2001',
      folderMode: 'global',
      channelFolder: '',
      playlistFolder: '',
      outputDir: ''
    });
    expect(state.buildDownloadConfig).not.toHaveBeenCalled();
    expect(config.kind).toBe('sc');
  });

  it('uses the generic builder for every other platform', () => {
    const form = setup({ getPlatform: () => 'youtube' });
    form.confirmConfig();
    expect(state.buildDownloadConfig).toHaveBeenCalled();
    expect(state.buildSoundcloudDownloadConfig).not.toHaveBeenCalled();
  });
});

describe('profiles', () => {
  it('exposes profile helpers', () => {
    const form = setup();
    expect(form.profiles).toBe(state.profiles);
    expect(form.save).toBe(state.save);
    expect(form.remove).toBe(state.remove);
    expect(form.ensureLoaded).toBe(state.ensureLoaded);
  });

  it('ignores an unknown profile id', () => {
    const form = setup();
    form.applyProfile('missing');
    expect(state.downloadProfileToForm).not.toHaveBeenCalled();
  });

  it('applies every mapped profile field', () => {
    state.profiles.value = [{ id: 'p1', config: { kind: 'video' } }];
    state.downloadProfileToForm.mockReturnValue({
      kind: 'video',
      format: 'flac',
      quality: '720',
      audioQuality: 'high',
      videoContainer: 'mkv',
      audioLanguage: '',
      sponsorBlock: 'remove',
      trimStart: 5,
      trimEnd: 10,
      filenameTemplate: '%artist% - %title%',
      coverType: 'clip',
      customCoverPath: '/cover.jpg',
      coverFrameTime: 12,
      coverClipStart: 3,
      coverClipEnd: 9,
      coverClipFormat: 'mp4',
      artist: 'Artist',
      album: 'Album',
      year: '2001',
      outputDir: '/custom',
      subsEnabled: true,
      subsLangs: 'de,en',
      subsFormat: 'vtt',
      subsMode: 'manual',
      subsFolder: true
    });
    const form = setup();

    form.applyProfile('p1');

    expect(form.kind.value).toBe('video');
    expect(form.format.value).toBe('flac');
    expect(form.quality.value).toBe('720');
    expect(form.audioQuality.value).toBe('high');
    expect(form.videoContainer.value).toBe('mkv');
    expect(form.audioLanguage.value).toBe('');
    expect(form.sponsorBlock.value).toBe('remove');
    expect(form.trimStart.value).toBe(5);
    expect(form.trimEnd.value).toBe(10);
    expect(form.filenameTemplate.value).toBe('%artist% - %title%');
    expect(form.coverType.value).toBe('clip');
    expect(form.customPath.value).toBe('/cover.jpg');
    expect(form.frameTime.value).toBe(12);
    expect(form.clipStart.value).toBe(3);
    expect(form.clipEnd.value).toBe(9);
    expect(form.clipFormat.value).toBe('mp4');
    expect(form.artist.value).toBe('Artist');
    expect(form.album.value).toBe('Album');
    expect(form.year.value).toBe('2001');
    expect(form.folderMode.value).toBe('custom');
    expect(form.outputDir.value).toBe('/custom');
    expect(form.subsEnabled.value).toBe(true);
    expect(form.subsLangs.value).toBe('de,en');
    expect(form.subsFormat.value).toBe('vtt');
    expect(form.subsMode.value).toBe('manual');
    expect(form.subsFolder.value).toBe(true);
  });

  it('leaves values untouched for a minimal profile', () => {
    state.profiles.value = [{ id: 'p2', config: {} }];
    const form = setup();
    form.kind.value = 'video';

    form.applyProfile('p2');

    expect(form.kind.value).toBe('video');
    expect(form.coverType.value).toBe('thumbnail');
    expect(form.folderMode.value).toBe('global');
    expect(form.subsEnabled.value).toBe(false);
  });
});
