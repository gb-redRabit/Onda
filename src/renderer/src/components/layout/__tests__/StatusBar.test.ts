import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import StatusBar from '../StatusBar.vue';

const state = vi.hoisted(() => ({
  route: null as any,
  router: null as any,
  player: null as any,
  library: null as any,
  explorer: null as any,
  youtube: null as any,
  settings: null as any,
  authStatus: null as any,
  ensureLoaded: vi.fn(),
  open: vi.fn(),
  getAppInfo: vi.fn(),
  loggerWarn: vi.fn(),
  t: vi.fn((key: string) => key),
  locale: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t, locale: state.locale }) }));
vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => state.router
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.youtube }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useYoutubeAuth', () => ({
  useYoutubeAuth: () => ({ status: state.authStatus, ensureLoaded: state.ensureLoaded })
}));
vi.mock('@renderer/composables/useContextMenu', () => ({
  useContextMenu: () => ({ open: state.open })
}));
vi.mock('@renderer/utils/fileTypes', () => ({
  getFileTypeInfo: (ext: string) => {
    const map: Record<string, string> = {
      mp3: 'audio',
      flac: 'audio',
      mp4: 'video',
      mkv: 'video',
      png: 'image',
      m3u: 'playlist'
    };
    return { category: map[ext] ?? 'other' };
  }
}));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));

const StatusBarPlayingStub = {
  emits: ['open'],
  template: '<button data-testid="playing" @click="$emit(\'open\', \'/player\')">playing</button>'
};

let wrapper: VueWrapper | null = null;

const ALL_SECTIONS = [
  'playing',
  'separator',
  'viewCounts',
  'context',
  'downloads',
  'youtube',
  'dependencies',
  'version',
  'clock'
];

function mountStatusBar() {
  wrapper = mount(StatusBar, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { StatusBarPlaying: StatusBarPlayingStub }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.route = reactive({ name: 'audio' });
  state.router = { push: vi.fn() };
  state.library = reactive({
    audioCount: 12,
    videoCount: 4,
    imageCount: 3,
    playlists: [{ tracks: [] }]
  });
  state.player = reactive({ currentTrack: null });
  state.explorer = reactive({ files: [], selectedCount: 0 });
  state.youtube = reactive({ downloads: [], subscriptions: [] });
  state.settings = reactive({
    statusBar: { visible: true, sections: [...ALL_SECTIONS] },
    updateStatusBar: vi.fn(),
    appearance: { audioLayout: { preset: 'grid' } },
    playback: { visualization: { mode: 'bars' } },
    dependencies: {} as Record<string, unknown>
  });
  state.authStatus = ref({ loggedIn: false });
  state.locale = ref('en');
  state.getAppInfo.mockReset();
  state.getAppInfo.mockResolvedValue({ appVersion: '1.2.3' });
  state.open.mockReset();
  state.loggerWarn.mockClear();
  state.ensureLoaded.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = { getAppInfo: state.getAppInfo };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('visibility and sections', () => {
  it('renders nothing when the status bar is hidden', () => {
    state.settings.statusBar.visible = false;
    mountStatusBar();
    expect(wrapper!.find('[data-app-statusbar]').exists()).toBe(false);
  });

  it('renders configured sections and loads app info', async () => {
    mountStatusBar();
    await flush();

    expect(state.ensureLoaded).toHaveBeenCalled();
    expect(state.getAppInfo).toHaveBeenCalled();
    expect(wrapper!.find('[data-testid="playing"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('status.audioFiles: 12');
    expect(wrapper!.text()).toContain('Onda v1.2.3');
    expect(wrapper!.text()).toContain('status.notLoggedIn');
  });

  it('hides sections that are not enabled', async () => {
    state.settings.statusBar.sections = ['playing', 'clock'];
    mountStatusBar();
    await flush();

    expect(wrapper!.text()).not.toContain('status.audioFiles');
    expect(wrapper!.text()).not.toContain('Onda v1.2.3');
    expect(wrapper!.text()).not.toContain('status.notLoggedIn');
  });

  it('logs app info failures without breaking the bar', async () => {
    state.getAppInfo.mockRejectedValueOnce(new Error('nope'));
    mountStatusBar();
    await flush();

    expect(state.loggerWarn).toHaveBeenCalledWith('statusbar', 'load failed', expect.any(Error));
    expect(wrapper!.text()).not.toContain('Onda v');
  });
});

describe('view counts and context', () => {
  it('shows audio counts and layout context', async () => {
    mountStatusBar();
    await flush();
    expect(wrapper!.text()).toContain('grid · bars');
  });

  it('shows current track metadata for audio', async () => {
    state.player.currentTrack = {
      extension: 'flac',
      metadata: { format: 'flac', codec: 'FLAC', sampleRate: 44100 }
    };
    mountStatusBar();
    await flush();
    expect(wrapper!.text()).toContain('FLAC · FLAC · 44kHz');
    expect(wrapper!.text()).toContain('grid · bars');
  });

  it('falls back to the extension when format is missing', async () => {
    state.player.currentTrack = { extension: 'mp3', metadata: {} };
    mountStatusBar();
    await flush();
    expect(wrapper!.text()).toContain('MP3');
  });

  it('shows video count on the player route', async () => {
    state.route.name = 'player';
    mountStatusBar();
    await flush();
    expect(wrapper!.text()).toContain('status.videoFiles: 4');
    expect(wrapper!.text()).not.toContain('status.audioFiles');
  });

  it('shows all library counts', async () => {
    state.route.name = 'library';
    mountStatusBar();
    await flush();
    expect(wrapper!.text()).toContain('status.audioFiles: 12');
    expect(wrapper!.text()).toContain('status.videoFiles: 4');
    expect(wrapper!.text()).toContain('status.images: 3');
    expect(wrapper!.text()).toContain('status.playlistsLabel: 1');
  });

  it('counts explorer files by category and shows the selection', async () => {
    state.route.name = 'explorer';
    state.explorer.files = [
      { isDirectory: true, extension: 'mp3' },
      { isDirectory: false, extension: 'mp3' },
      { isDirectory: false, extension: 'flac' },
      { isDirectory: false, extension: 'mp4' },
      { isDirectory: false, extension: 'png' },
      { isDirectory: false, extension: 'm3u' },
      { isDirectory: false, extension: 'txt' },
      { isDirectory: false, extension: '' }
    ];
    state.explorer.selectedCount = 2;
    mountStatusBar();
    await flush();

    expect(wrapper!.text()).toContain('status.audioFiles: 2');
    expect(wrapper!.text()).toContain('status.videoFiles: 1');
    expect(wrapper!.text()).toContain('status.images: 1');
    expect(wrapper!.text()).toContain('status.playlistsLabel: 1');
    expect(wrapper!.text()).toContain('2 status.selected');
  });

  it('shows subscriptions and active downloads on online routes', async () => {
    state.route.name = 'online';
    state.youtube.subscriptions = [{ id: 's1' }, { id: 's2' }];
    state.youtube.downloads = [
      { id: 'd1', status: 'downloading', title: 'Video 1', progress: 42, speed: '1 MB/s' },
      { id: 'd2', status: 'pending', title: 'Video 2', progress: 0 },
      { id: 'd3', status: 'done', title: 'Video 3', progress: 100 }
    ];
    mountStatusBar();
    await flush();

    expect(wrapper!.text()).toContain('2 status.subscriptions');
    expect(wrapper!.text()).toContain('2 status.activeDownloads');
  });

  it('shows download speed on the downloads route', async () => {
    state.route.name = 'downloads';
    state.youtube.downloads = [
      { id: 'd1', status: 'downloading', title: 'Video 1', progress: 42, speed: '1 MB/s' }
    ];
    mountStatusBar();
    await flush();

    expect(wrapper!.text()).toContain('1 status.activeDownloads · 1 MB/s');
  });

  it('shows nothing extra when no downloads are active', async () => {
    state.route.name = 'downloads';
    state.youtube.downloads = [{ id: 'd1', status: 'done', title: 'Done', progress: 100 }];
    mountStatusBar();
    await flush();

    expect(wrapper!.text()).not.toContain('status.activeDownloads');
  });
});

describe('action buttons', () => {
  it('opens downloads from the active download button', async () => {
    state.youtube.downloads = [
      { id: 'd1', status: 'downloading', title: 'Video 1', progress: 42, speed: '' }
    ];
    mountStatusBar();
    await flush();

    expect(wrapper!.text()).toContain('Video 1');
    expect(wrapper!.text()).toContain('42%');
    await wrapper!.get('[aria-label="status.openDownloads"]').trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/downloads');
  });

  it('switches the online button by auth state', async () => {
    state.authStatus.value = { loggedIn: true };
    mountStatusBar();
    await flush();

    expect(wrapper!.text()).toContain('status.loggedIn');
    await wrapper!.get('[aria-label="status.openOnline"]').trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/online');
  });

  it('lists outdated dependencies sorted and opens settings', async () => {
    state.settings.dependencies = {
      ffmpeg: { installed: true, updateAvailable: true, name: 'ffmpeg', latestVersion: '6.0' },
      ytdlp: { installed: true, updateAvailable: false, name: 'yt-dlp', latestVersion: '2.0' },
      deno: { installed: false, updateAvailable: true, name: 'deno', latestVersion: '1.0' },
      aria2: { installed: true, updateAvailable: true, name: 'aria2' }
    };
    mountStatusBar();
    await flush();

    const button = wrapper!.get('[aria-label="status.openDependencies"]');
    expect(button.text()).toContain('↑ aria2, ffmpeg 6.0');
    await button.trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/settings?tab=dependencies');
  });

  it('opens about from the version button and forwards playing opens', async () => {
    mountStatusBar();
    await flush();

    await wrapper!.get('[aria-label="status.openAbout"]').trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/settings?tab=about');

    await wrapper!.get('[data-testid="playing"]').trigger('click');
    expect(state.router.push).toHaveBeenCalledWith('/player');
  });
});

describe('context menu and keyboard', () => {
  it('builds the sections menu and applies actions', async () => {
    mountStatusBar();
    await flush();

    await wrapper!.get('[data-app-statusbar]').trigger('contextmenu');
    expect(state.open).toHaveBeenCalledTimes(1);

    const [, defs] = state.open.mock.calls[0];
    expect(defs).toHaveLength(ALL_SECTIONS.length + 2);
    expect(defs[0].label).toBe('✓ status.sections.playing');
    expect(defs[ALL_SECTIONS.length]).toEqual({ separator: true, label: '' });

    defs[0].action();
    expect(state.settings.updateStatusBar).toHaveBeenCalledWith({
      sections: ALL_SECTIONS.filter((s) => s !== 'playing')
    });

    defs[ALL_SECTIONS.length + 1].action();
    expect(state.settings.updateStatusBar).toHaveBeenCalledWith({ visible: false });
  });

  it('restores canonical section order when enabling one', async () => {
    state.settings.statusBar.sections = ['playing', 'clock'];
    mountStatusBar();
    await flush();

    await wrapper!.get('[data-app-statusbar]').trigger('contextmenu');
    const [, defs] = state.open.mock.calls[0];
    defs[2].action();
    expect(state.settings.updateStatusBar).toHaveBeenCalledWith({
      sections: ['playing', 'viewCounts', 'clock']
    });
  });

  it('opens the menu with the keyboard context menu key and Shift+F10', async () => {
    mountStatusBar();
    await flush();

    const bar = wrapper!.get('[data-app-statusbar]');
    const first = new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true });
    const prevent = vi.spyOn(first, 'preventDefault');
    bar.element.dispatchEvent(first);
    expect(prevent).toHaveBeenCalled();
    expect(state.open).toHaveBeenCalledTimes(1);
    expect(state.open.mock.calls[0][0]).toMatchObject({ clientX: 8, clientY: -8 });

    const second = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true });
    bar.element.dispatchEvent(second);
    expect(state.open).toHaveBeenCalledTimes(2);
  });

  it('ignores other keys', async () => {
    mountStatusBar();
    await flush();

    await wrapper!.get('[data-app-statusbar]').trigger('keydown', { key: 'F10' });
    await wrapper!.get('[data-app-statusbar]').trigger('keydown', { key: 'a' });
    expect(state.open).not.toHaveBeenCalled();
  });
});
