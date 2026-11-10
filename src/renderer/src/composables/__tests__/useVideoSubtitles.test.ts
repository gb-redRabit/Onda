import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, type EffectScope } from 'vue';

const h = vi.hoisted(() => ({
  init: vi.fn(),
  load: vi.fn(async () => undefined),
  remove: vi.fn(),
  destroy: vi.fn(),
  loggerError: vi.fn(),
  player: null as any
}));

vi.mock('@renderer/composables/useSubtitleRenderer', () => ({
  initSubtitleRenderer: h.init,
  loadSubtitleTrack: h.load,
  removeSubtitleTrack: h.remove,
  destroySubtitleRenderer: h.destroy
}));
vi.mock('@shared/logger', () => ({
  logger: { error: h.loggerError, warn: vi.fn(), info: vi.fn() }
}));

import { useVideoSubtitles } from '../useVideoSubtitles';

let api: ReturnType<typeof useVideoSubtitles> | null = null;
let scope: EffectScope | null = null;

function setup() {
  scope = effectScope();
  scope.run(() => {
    api = useVideoSubtitles(h.player);
  });
  return api!;
}

function embeddedTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    source: 'embedded',
    content: '',
    format: 'ass',
    fonts: [] as unknown[],
    ...overrides
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await nextTick();
}

beforeEach(() => {
  h.init.mockReset();
  h.load.mockReset();
  h.load.mockResolvedValue(undefined);
  h.remove.mockReset();
  h.destroy.mockReset();
  h.loggerError.mockReset();
  h.player = reactive({
    pipActive: false,
    activeSubtitleId: null as string | null,
    currentTrack: { path: 'D:/video.mkv' } as { path: string } | null,
    subtitleTracks: [] as Array<Record<string, unknown>>,
    clearSubtitles: vi.fn(),
    loadSubtitles: vi.fn(),
    loadEmbeddedSubtitle: vi.fn(async () => null)
  });
});

afterEach(() => {
  scope?.stop();
  scope = null;
  api = null;
});

describe('PiP sync', () => {
  it('removes subtitles while PiP is active', () => {
    h.player.pipActive = true;
    h.player.activeSubtitleId = 'sub-1';
    const subtitles = setup();

    subtitles.syncSubtitlesWithPiP();

    expect(h.remove).toHaveBeenCalled();
    expect(h.load).not.toHaveBeenCalled();
  });

  it('does nothing without an active subtitle', () => {
    const subtitles = setup();
    subtitles.syncSubtitlesWithPiP();
    expect(h.load).not.toHaveBeenCalled();
  });

  it('loads the selected track and ignores missing ones', () => {
    const track = { id: 'sub-1', content: 'x' };
    h.player.activeSubtitleId = 'sub-1';
    h.player.subtitleTracks = [track];
    const subtitles = setup();

    subtitles.syncSubtitlesWithPiP();
    expect(h.load).toHaveBeenCalledWith(track);

    h.player.activeSubtitleId = 'missing';
    subtitles.syncSubtitlesWithPiP();
    expect(h.load).toHaveBeenCalledTimes(1);
  });
});

describe('lifecycle helpers', () => {
  it('destroys the renderer and clears tracks', () => {
    const subtitles = setup();
    subtitles.destroySubtitles();

    expect(h.destroy).toHaveBeenCalled();
    expect(h.player.clearSubtitles).toHaveBeenCalled();
  });

  it('initialises the renderer and loads subtitles for the current track', () => {
    const subtitles = setup();
    const video = {} as HTMLVideoElement;

    subtitles.onVideoReady(video);

    expect(h.init).toHaveBeenCalledWith(video);
    expect(h.player.loadSubtitles).toHaveBeenCalledWith('D:/video.mkv');
  });

  it('skips loading subtitles without a current track', () => {
    h.player.currentTrack = null;
    const subtitles = setup();

    subtitles.onVideoReady({} as HTMLVideoElement);

    expect(h.init).toHaveBeenCalled();
    expect(h.player.loadSubtitles).not.toHaveBeenCalled();
  });
});

describe('subtitle watcher', () => {
  it('removes subtitles when the selection is cleared', async () => {
    h.player.activeSubtitleId = 'sub-1';
    const subtitles = setup();
    subtitles.registerSubtitleWatcher();

    h.player.activeSubtitleId = null;
    await nextTick();

    expect(h.remove).toHaveBeenCalled();
  });

  it('removes subtitles without a current track', async () => {
    h.player.currentTrack = null;
    h.player.subtitleTracks = [embeddedTrack()];
    const subtitles = setup();
    subtitles.registerSubtitleWatcher();

    h.player.activeSubtitleId = 'sub-1';
    await nextTick();

    expect(h.remove).toHaveBeenCalled();
  });

  it('ignores a missing track', async () => {
    h.player.activeSubtitleId = 'sub-1';
    const subtitles = setup();
    subtitles.registerSubtitleWatcher();

    h.player.activeSubtitleId = 'missing';
    await nextTick();

    expect(h.load).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('extracts embedded subtitles before loading them', async () => {
    const track = embeddedTrack();
    h.player.activeSubtitleId = 'sub-1';
    h.player.subtitleTracks = [track];
    const extraction = {
      content: 'ass content',
      format: 'ass',
      fonts: [{ name: 'Arial' }]
    };
    h.player.loadEmbeddedSubtitle.mockResolvedValue(extraction);
    const subtitles = setup();
    subtitles.registerSubtitleWatcher();

    h.player.activeSubtitleId = null;
    await nextTick();
    h.player.activeSubtitleId = 'sub-1';
    await flush();

    expect(h.player.loadEmbeddedSubtitle).toHaveBeenCalledWith('sub-1', 'D:/video.mkv');
    expect(track.content).toBe('ass content');
    expect(track.format).toBe('ass');
    expect(track.fonts).toEqual([{ name: 'Arial' }]);
    expect(h.load).toHaveBeenCalledWith(track);
  });

  it('logs failed extraction', async () => {
    const track = embeddedTrack();
    h.player.activeSubtitleId = 'sub-1';
    h.player.subtitleTracks = [track];
    h.player.loadEmbeddedSubtitle.mockResolvedValue(null);
    const subtitles = setup();
    subtitles.registerSubtitleWatcher();

    h.player.activeSubtitleId = null;
    await nextTick();
    h.player.activeSubtitleId = 'sub-1';
    await flush();

    expect(h.loggerError).toHaveBeenCalledWith('Subtitles', 'extraction returned null');
    expect(h.load).not.toHaveBeenCalled();
  });

  it('loads ready embedded and external tracks directly', async () => {
    const embedded = embeddedTrack({ content: 'ready' });
    h.player.subtitleTracks = [embedded, { id: 'sub-2', source: 'external' }];
    const subtitles = setup();
    subtitles.registerSubtitleWatcher();

    h.player.activeSubtitleId = 'sub-1';
    await flush();
    expect(h.load).toHaveBeenCalledWith(embedded);

    h.player.activeSubtitleId = 'sub-2';
    await flush();
    expect(h.load).toHaveBeenCalledWith({ id: 'sub-2', source: 'external' });
  });
});
