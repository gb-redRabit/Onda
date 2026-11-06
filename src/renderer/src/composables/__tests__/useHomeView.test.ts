import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import type { MediaFile } from '@renderer/types/media';

// Home: store'y, router i mostek są podstawione; testy montują właściciela,
// żeby `onMounted` i `watch` działały naturalnie.
const state = vi.hoisted(() => ({
  player: null as any,
  library: null as any,
  settings: null as any,
  router: { push: vi.fn() },
  locale: { value: 'pl' },
  openMediaFiles: vi.fn(),
  audioSeek: vi.fn(),
  clearSavedPosition: vi.fn(),
  isCoreShell: vi.fn(() => false),
  plural: vi.fn((count: number) => (count === 1 ? 'one' : count < 5 ? 'few' : 'many')),
  openFileResult: null as unknown,
  openFolderResult: null as unknown,
  positionResult: 0 as number,
  positionRejects: false,
  clearPosition: vi.fn(),
  t: vi.fn((key: string, params?: { count?: number }) =>
    params && params.count !== undefined ? `${key}:${params.count}` : key
  )
}));

vi.mock('vue-router', () => ({ useRouter: () => state.router }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t, locale: state.locale }) }));
vi.mock('@lucide/vue', () => ({
  FolderOpen: {},
  Disc3: {},
  Radio: {},
  FolderUp: {},
  LibraryBig: {},
  Music2: {},
  Film: {},
  Image: {},
  ListMusic: {}
}));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/modules/audioEngine', () => ({
  audioEngine: { seek: state.audioSeek, clearSavedPosition: state.clearSavedPosition }
}));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: () => state.isCoreShell() }));
vi.mock('@renderer/composables/useOpenMedia', () => ({
  openMediaFiles: state.openMediaFiles
}));
vi.mock('@renderer/composables/useHomeContextMenu', () => ({
  useHomeContextMenu: () => ({ open: vi.fn() })
}));
vi.mock('@renderer/utils/homeSections', () => ({
  orderedHomeSections: (sections: string[]) => sections
}));
vi.mock('@renderer/utils/plural', () => ({
  pluralCategory: (_locale: string, count: number) => state.plural(count)
}));

const { useHomeView, playCountBadge } = await import('../useHomeView');

function track(name: string, overrides: Record<string, unknown> = {}): MediaFile {
  return {
    path: `/music/${name}`,
    name,
    extension: 'mp3',
    type: 'audio',
    duration: 0,
    playCount: 0,
    metadata: {},
    ...overrides
  } as MediaFile;
}

function makeLibrary(tracks: ReturnType<typeof track>[]) {
  return {
    totalCount: 10,
    audioCount: 6,
    videoCount: 3,
    imageCount: 1,
    tracks,
    audioTracks: tracks.filter((t) => t.type === 'audio'),
    recentTracks: tracks,
    mostPlayed: [] as ReturnType<typeof track>[],
    playlists: [] as unknown[],
    albums: [] as unknown[],
    artists: [] as unknown[]
  };
}

function makePlayer() {
  return {
    favorites: new Set<string>(),
    currentTrack: null as ReturnType<typeof track> | null,
    isPlaying: false,
    currentTime: 0,
    clearQueue: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn(),
    seek: vi.fn(),
    ensureFavorites: vi.fn()
  };
}

let wrappers: Array<{ unmount: () => void }> = [];

function createHome() {
  let api!: ReturnType<typeof useHomeView>;
  const Comp = defineComponent({
    setup() {
      api = useHomeView();
      return () => h('div');
    }
  });
  const wrapper = mount(Comp, { attachTo: document.body });
  wrappers.push(wrapper);
  return api;
}

async function flush(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  const tracks = [track('a.mp3'), track('b.mp3'), track('c.mp3', { type: 'video' })];
  state.library = reactive(makeLibrary(tracks));
  state.player = reactive(makePlayer());
  state.settings = reactive({ home: { sections: ['recent', 'stats'] } });
  state.router.push.mockClear();
  state.locale.value = 'pl';
  state.openMediaFiles.mockReset();
  state.openMediaFiles.mockResolvedValue(undefined);
  state.audioSeek.mockClear();
  state.clearSavedPosition.mockClear();
  state.isCoreShell.mockReset();
  state.isCoreShell.mockReturnValue(false);
  state.plural.mockClear();
  state.openFileResult = null;
  state.openFolderResult = null;
  state.positionResult = 0;
  state.positionRejects = false;
  state.clearPosition.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    invoke: vi.fn(async (channel: string) =>
      channel === 'dialog:openFile' ? state.openFileResult : state.openFolderResult
    ),
    getPlaybackPosition: vi.fn(async () => {
      if (state.positionRejects) throw new Error('db');
      return state.positionResult;
    }),
    clearPlaybackPosition: state.clearPosition
  };
  wrappers = [];
});

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers = [];
  delete (window as { api?: unknown }).api;
});

describe('playCountBadge', () => {
  it('shows a badge from the second play only', () => {
    expect(playCountBadge(undefined)).toBe('');
    expect(playCountBadge(0)).toBe('');
    expect(playCountBadge(1)).toBe('');
    expect(playCountBadge(2)).toBe('2×');
  });
});

describe('sections and actions', () => {
  it('checks section visibility against settings order', () => {
    const home = createHome();
    expect(home.has('recent')).toBe(true);

    state.settings.home.sections = ['mostPlayed'];
    expect(home.has('recent')).toBe(false);
    expect(home.has('mostPlayed')).toBe(true);
  });

  it('opens files and ignores canceled dialogs', async () => {
    const home = createHome();
    state.openFileResult = { filePaths: ['/a.mp3'], canceled: false };

    await home.openFile();
    expect(state.openMediaFiles).toHaveBeenCalledWith(['/a.mp3'], state.router);

    state.openMediaFiles.mockClear();
    state.openFileResult = { filePaths: [], canceled: true };
    await home.openFile();
    expect(state.openMediaFiles).not.toHaveBeenCalled();
  });

  it('opens folders and ignores empty results', async () => {
    const home = createHome();
    state.openFolderResult = { filePaths: ['/b.mp3'], canceled: false };

    await home.openFolder();
    expect(state.openMediaFiles).toHaveBeenCalledWith(['/b.mp3'], state.router);

    state.openMediaFiles.mockClear();
    state.openFolderResult = null;
    await home.openFolder();
    expect(state.openMediaFiles).not.toHaveBeenCalled();
  });

  it('performs the quick action routes', async () => {
    const home = createHome();
    await home.actions.find((a) => a.id === 'library')!.route();
    expect(state.router.push).toHaveBeenCalledWith('/library');

    await home.actions.find((a) => a.id === 'online')!.route();
    expect(state.router.push).toHaveBeenCalledWith('/online');
  });

  it('exposes counters with values and target tabs', () => {
    const home = createHome();
    expect(home.counters.value.map((c) => [c.key, c.value, c.tab])).toEqual([
      ['home.statFiles', 10, 'overview'],
      ['home.statAudio', 6, 'tracks'],
      ['home.statVideo', 3, 'video'],
      ['home.statImages', 1, 'images'],
      ['home.statPlaylists', 0, 'playlists']
    ]);
  });

  it('navigates to a library tab', () => {
    const home = createHome();
    home.openLibrary('tracks');
    expect(state.router.push).toHaveBeenCalledWith({
      path: '/library',
      query: { tab: 'tracks' }
    });
  });
});

describe('shelves and labels', () => {
  it('limits recent, playlist, album and artist shelves to 12', () => {
    state.library.recentTracks = Array.from({ length: 20 }, (_, i) => track(`r${i}.mp3`));
    state.library.playlists = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    state.library.albums = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    state.library.artists = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const home = createHome();

    expect(home.quickPicks.value).toHaveLength(6);
    expect(home.playlists.value).toHaveLength(12);
    expect(home.albums.value).toHaveLength(12);
    expect(home.artists.value).toHaveLength(12);
  });

  it('filters most played tracks with at least one play', () => {
    state.library.mostPlayed = [
      track('zero.mp3', { playCount: 0 }),
      track('one.mp3', { playCount: 1 }),
      track('five.mp3', { playCount: 5 })
    ];
    const home = createHome();

    expect(home.mostPlayed.value.map((t) => t.name)).toEqual(['one.mp3', 'five.mp3']);
  });

  it('filters favorites by path', () => {
    state.player.favorites = new Set(['/music/a.mp3']);
    const home = createHome();
    expect(home.favoriteTracks.value.map((t) => t.name)).toEqual(['a.mp3']);

    state.player.favorites = new Set();
    expect(home.favoriteTracks.value).toEqual([]);
  });

  it('builds titles and subtitles from metadata', () => {
    const home = createHome();
    const withArtist = track('x.mp3', {
      name: 'x.mp3',
      metadata: { title: 'Title', artist: 'Artist' }
    });
    expect(home.trackTitle(withArtist)).toBe('Title');
    expect(home.trackSubtitle(withArtist)).toBe('Artist');

    const withDuration = track('y.mp3', { duration: 125 });
    expect(home.trackSubtitle(withDuration)).toBe('2:05');

    const metadataDuration = track('z.mp3', { metadata: { duration: 65 } });
    expect(home.trackSubtitle(metadataDuration)).toBe('1:05');

    const fallback = track('q.wav', { extension: 'wav' });
    expect(home.trackTitle(fallback)).toBe('q.wav');
    expect(home.trackSubtitle(fallback)).toBe('wav');
  });

  it('selects the plural form for the locale', () => {
    state.plural.mockImplementation((count: number) =>
      count === 1 ? 'one' : count < 5 ? 'few' : 'many'
    );
    const home = createHome();

    expect(home.trackCountLabel(1)).toBe('home.trackCountOne:1');
    expect(home.trackCountLabel(3)).toBe('home.trackCountFew:3');
    expect(home.trackCountLabel(10)).toBe('home.trackCountMany:10');
    expect(state.plural.mock.calls.map((call) => call[0])).toEqual([1, 3, 10]);
  });
});

describe('playRandom', () => {
  it('prefers audio tracks and clears the queue', () => {
    const home = createHome();
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);

    home.playRandom();

    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.setTrack).toHaveBeenCalledWith(state.library.audioTracks[0]);
    expect(state.player.play).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('navigates to the player for a video pick', () => {
    state.library.audioTracks = [];
    state.library.tracks = [track('v.mp4', { type: 'video' })];
    const home = createHome();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    home.playRandom();

    expect(state.player.setTrack).toHaveBeenCalledWith(state.library.tracks[0]);
    expect(state.router.push).toHaveBeenCalledWith('/player');
  });

  it('does nothing with an empty library', () => {
    state.library.audioTracks = [];
    state.library.tracks = [track('i.jpg', { type: 'image' })];
    const home = createHome();
    home.playRandom();
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });
});

describe('continue card', () => {
  it('prefers a paused current track', () => {
    state.player.currentTrack = track('paused.mp3');
    state.player.isPlaying = false;
    const home = createHome();
    expect(home.continueTrack.value?.name).toBe('paused.mp3');
  });

  it('uses the newest recent track that is not playing', () => {
    state.player.currentTrack = track('a.mp3');
    state.player.isPlaying = true;
    const home = createHome();
    expect(home.continueTrack.value?.name).toBe('b.mp3');
  });

  it('falls back to the current track or null', () => {
    state.player.currentTrack = track('only.mp3');
    state.player.isPlaying = true;
    state.library.recentTracks = [];
    const home = createHome();
    expect(home.continueTrack.value?.name).toBe('only.mp3');

    state.player.currentTrack = null;
    expect(home.continueTrack.value).toBeNull();
  });

  it('loads the furthest of saved and live positions', async () => {
    state.player.currentTrack = track('a.mp3');
    state.player.isPlaying = false;
    state.player.currentTime = 20;
    state.positionResult = 45;
    const home = createHome();

    await flush();
    expect(home.continuePosition.value).toBe(45);

    state.positionResult = 5;
    state.player.currentTrack = track('a.mp3');
    state.player.currentTime = 30;
    await flush();
    expect(home.continuePosition.value).toBe(30);
  });

  it('falls back to the live position when reading fails', async () => {
    state.positionRejects = true;
    state.player.currentTrack = track('a.mp3');
    state.player.isPlaying = false;
    state.player.currentTime = 12.9;
    const home = createHome();

    await flush();
    expect(home.continuePosition.value).toBe(12);
  });

  it('resets the position without a track', async () => {
    state.player.currentTrack = null;
    state.library.recentTracks = [];
    const home = createHome();
    await flush();
    expect(home.continuePosition.value).toBe(0);
  });

  it('resumes a video at the saved position', () => {
    state.player.currentTrack = track('v.mp4', { type: 'video' });
    state.player.isPlaying = false;
    const home = createHome();
    home.continuePosition.value = 10;

    home.playContinue();

    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(state.player.seek).toHaveBeenCalledWith(10);
    expect(state.player.play).toHaveBeenCalled();
    expect(state.router.push).toHaveBeenCalledWith('/player');
  });

  it('seeks audio and the engine when already loaded', () => {
    state.player.currentTrack = track('a.mp3');
    state.player.isPlaying = false;
    const home = createHome();
    home.continuePosition.value = 30;

    home.playContinue();

    expect(state.player.seek).toHaveBeenCalledWith(30);
    expect(state.audioSeek).toHaveBeenCalledWith(30);
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });

  it('sets a new audio track with resume', () => {
    state.library.recentTracks = [track('new.mp3')];
    state.player.currentTrack = null;
    const home = createHome();
    home.continuePosition.value = 0;

    home.playContinue();

    expect(state.player.setTrack).toHaveBeenCalledWith(state.library.recentTracks[0], {
      resume: true
    });
    expect(state.player.play).toHaveBeenCalled();
  });

  it('does nothing without a continuation track', () => {
    state.player.currentTrack = null;
    state.library.recentTracks = [];
    const home = createHome();
    home.playContinue();
    expect(state.player.play).not.toHaveBeenCalled();
  });

  it('restarts audio from the beginning', () => {
    state.player.currentTrack = track('a.mp3');
    state.player.isPlaying = false;
    const home = createHome();
    home.continuePosition.value = 30;

    home.playContinueFromStart();

    expect(state.clearPosition).toHaveBeenCalledWith('/music/a.mp3');
    expect(state.clearSavedPosition).toHaveBeenCalledWith('/music/a.mp3');
    expect(state.player.seek).toHaveBeenCalledWith(0);
    expect(state.audioSeek).toHaveBeenCalledWith(0);
    expect(home.continuePosition.value).toBe(0);
  });

  it('skips local engine resets in Core shell', () => {
    state.isCoreShell.mockReturnValue(true);
    state.player.currentTrack = track('a.mp3');
    state.player.isPlaying = false;
    const home = createHome();

    home.playContinueFromStart();

    expect(state.clearSavedPosition).not.toHaveBeenCalled();
    expect(state.audioSeek).not.toHaveBeenCalled();
  });

  it('loads favorites on mount', () => {
    createHome();
    expect(state.player.ensureFavorites).toHaveBeenCalledTimes(1);
  });
});
