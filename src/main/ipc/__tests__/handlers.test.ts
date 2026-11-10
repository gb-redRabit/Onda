import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as string[],
  context: { getMainWindow: vi.fn(() => null) },
  fns: {} as Record<string, ReturnType<typeof vi.fn>>
}));

const modules: Array<[string, string]> = [
  ['../guard', 'installIpcGuards'],
  ['../fs/fs-handlers', 'registerFsHandlers'],
  ['../library/library-handlers', 'registerLibraryHandlers'],
  ['../settings/settings-handlers', 'registerSettingsHandlers'],
  ['../media/media-handlers', 'registerMediaHandlers'],
  ['../media/media-frames', 'registerMediaFrameHandlers'],
  ['../cover/cover-handlers', 'registerCoverHandlers'],
  ['../subtitle-handlers', 'registerSubtitleHandlers'],
  ['../lyrics/lyrics-handlers', 'registerLyricsHandlers'],
  ['../opensubtitles', 'registerOpenSubtitlesHandlers'],
  ['../napiprojekt', 'registerNapiProjektHandlers'],
  ['../animesub', 'registerAnimeSubHandlers'],
  ['../playback-handlers', 'registerPlaybackHandlers'],
  ['../dependency/dependency-handlers', 'registerDependencyHandlers'],
  ['../youtube/youtube-handlers', 'registerYoutubeHandlers'],
  ['../soundcloud/soundcloud-handlers', 'registerSoundcloudHandlers'],
  ['../youtube/youtube-auth-handlers', 'registerYoutubeAuthHandlers'],
  ['../subscriptions/subscriptions-handlers', 'registerSubscriptionHandlers'],
  ['../downloads/downloads-handlers', 'registerDownloadHandlers'],
  ['../downloads/download-profiles', 'registerDownloadProfileHandlers'],
  ['../dialog-handlers', 'registerDialogHandlers'],
  ['../musicbrainz', 'registerMusicBrainzHandlers'],
  ['../diagnostics-handlers', 'registerDiagnosticsHandlers'],
  ['../updater-handlers', 'registerUpdaterHandlers'],
  ['../sources/sources-handlers', 'registerSourcesHandlers'],
  ['../providers/providers-handlers', 'registerProvidersHandlers'],
  ['../../preview/preview-window', 'registerPreviewHandlers'],
  ['../saved-streams', 'registerSavedHandlers'],
  ['../radio-store', 'registerRadioHandlers'],
  ['../plugins/plugins-handlers', 'registerPluginsHandlers'],
  ['../remote-image', 'registerRemoteImageHandler'],
  ['../cache-handlers', 'registerCacheHandlers'],
  ['../factory-reset', 'registerFactoryResetHandler'],
  ['../scrobbling/scrobbling-handlers', 'registerScrobblingHandlers'],
  ['../../tools/tools-handlers', 'registerToolsHandlers'],
  ['../../discord/discord-handlers', 'registerDiscordHandlers']
];

async function load() {
  vi.resetModules();
  const record = (name: string) =>
    vi.fn((...args: unknown[]) => {
      state.calls.push(`${name}:${args.length}`);
    });
  state.fns = {};
  for (const [path, name] of modules) {
    const fn = record(name);
    state.fns[name] = fn;
    vi.doMock(path, () => ({ [name]: fn }));
  }
  return import('../handlers');
}

beforeEach(() => {
  state.calls = [];
});

describe('registerIPC', () => {
  it('installs guards and every handler in order', async () => {
    const { registerIPC } = await load();
    registerIPC(state.context);

    expect(state.calls[0]).toBe('installIpcGuards:0');
    expect(state.calls).toHaveLength(modules.length);
    expect(state.calls.map((call) => call.split(':')[0])).toEqual(modules.map(([, name]) => name));
  });

  it('calls every module exactly once', async () => {
    const { registerIPC } = await load();
    registerIPC(state.context);
    registerIPC(state.context);

    for (const [, name] of modules) {
      expect(state.fns[name]).toHaveBeenCalledTimes(2);
    }
  });

  it('passes the context only to the tools handlers', async () => {
    const { registerIPC } = await load();
    registerIPC(state.context);

    expect(state.fns.registerToolsHandlers).toHaveBeenCalledWith(state.context);
    for (const [, name] of modules) {
      if (name === 'registerToolsHandlers') continue;
      expect(state.fns[name].mock.calls[0]).toEqual([]);
    }
  });

  it('does not register anything at import time', async () => {
    await load();
    expect(state.calls).toEqual([]);
  });

  it('stops when an earlier registrar throws', async () => {
    vi.resetModules();
    const failing = vi.fn(() => {
      throw new Error('boom');
    });
    vi.doMock('../guard', () => ({ installIpcGuards: failing }));
    vi.doMock('../fs/fs-handlers', () => ({ registerFsHandlers: vi.fn() }));
    for (const [path, name] of modules.slice(2)) {
      vi.doMock(path, () => ({ [name]: vi.fn() }));
    }
    const { registerIPC } = await import('../handlers');

    expect(() => registerIPC(state.context)).toThrow('boom');
  });
});
