import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, type EffectScope } from 'vue';

const h = vi.hoisted(() => ({
  prepare: vi.fn(),
  delay: null as any,
  player: null as any,
  settings: null as any,
  pip: {
    start: vi.fn(),
    stop: vi.fn(),
    preload: vi.fn(),
    updateSubtitle: vi.fn()
  },
  syncSubtitles: vi.fn()
}));

vi.mock('@renderer/composables/useSubtitleRenderer', () => ({
  preparePiPSubtitleData: h.prepare
}));
vi.mock('@renderer/composables/subtitleDelay', async () => {
  const { ref } = await import('vue');
  h.delay = ref(0);
  return { subtitleDelayMs: h.delay };
});

import { useVideoPiP } from '../useVideoPiP';

let api: ReturnType<typeof useVideoPiP> | null = null;
let scope: EffectScope | null = null;

function setup(
  getVideoRef: () => HTMLVideoElement | null = () => null,
  getSrc = (t: { path: string }) => `media:${t.path}`
) {
  scope = effectScope();
  scope.run(() => {
    api = useVideoPiP(h.player, h.settings, h.pip as never, getVideoRef, getSrc, h.syncSubtitles);
  });
  return api!;
}

function video(overrides: Record<string, unknown> = {}) {
  return {
    src: 'https://video/1',
    currentTime: 42,
    pause: vi.fn(),
    ...overrides
  } as unknown as HTMLVideoElement;
}

function player(overrides: Record<string, unknown> = {}) {
  return {
    pipActive: false,
    currentTime: 10,
    currentTrack: null as { path: string } | null,
    enterPiP: vi.fn(),
    ...overrides
  };
}

function settings(overrides: Record<string, unknown> = {}) {
  return {
    playback: {
      pipPreBuffer: false,
      pipPosition: 'bottom-right',
      pipWidth: 480,
      pipHeight: 270,
      ...overrides
    }
  };
}

beforeEach(() => {
  h.prepare.mockReset();
  h.prepare.mockResolvedValue({ subContent: 'subs', fonts: [], availableFonts: {} });
  h.delay.value = 0;
  h.player = player();
  h.settings = settings();
  h.pip.start.mockReset();
  h.pip.start.mockResolvedValue(true);
  h.pip.stop.mockReset();
  h.pip.preload.mockReset();
  h.pip.updateSubtitle.mockReset();
  h.syncSubtitles.mockReset();
});

afterEach(() => {
  scope?.stop();
  scope = null;
  api = null;
});

describe('togglePiP', () => {
  it('stops an active PiP session', async () => {
    h.player.pipActive = true;
    const pip = setup();

    await pip.togglePiP();

    expect(h.pip.stop).toHaveBeenCalled();
    expect(h.pip.start).not.toHaveBeenCalled();
  });

  it('starts PiP from the video source and promotes the player state', async () => {
    h.settings.playback.pipPreBuffer = true;
    const videoEl = video();
    const pip = setup(() => videoEl);
    h.player.currentTrack = { path: 'D:/v.mp4' };

    await pip.togglePiP();
    await nextTick();

    expect(h.pip.preload).toHaveBeenCalledWith('https://video/1', null);
    expect(h.pip.start).toHaveBeenCalledWith('https://video/1', {
      position: 'bottom-right',
      width: 480,
      height: 270,
      startTime: 42,
      subtitle: true
    });
    expect(h.player.enterPiP).toHaveBeenCalledWith(42);
    expect(videoEl.pause).toHaveBeenCalled();
    expect(h.syncSubtitles).toHaveBeenCalled();
    expect(h.prepare).toHaveBeenCalledWith('D:/v.mp4');
  });

  it('falls back to the current track source and player time', async () => {
    h.player.currentTrack = { path: 'D:/v.mp4' };
    const pip = setup();

    await pip.togglePiP();
    await nextTick();

    expect(h.pip.start).toHaveBeenCalledWith(
      'media:D:/v.mp4',
      expect.objectContaining({ startTime: 10 })
    );
  });

  it('does nothing without a source', async () => {
    const pip = setup();

    await pip.togglePiP();

    expect(h.pip.start).not.toHaveBeenCalled();
  });

  it('keeps the player untouched when PiP fails to start', async () => {
    h.pip.start.mockResolvedValueOnce(false);
    const pip = setup(() => video());

    await pip.togglePiP();

    expect(h.player.enterPiP).not.toHaveBeenCalled();
    expect(h.syncSubtitles).not.toHaveBeenCalled();
  });
});

describe('subtitles', () => {
  it('sends prepared subtitles with the current delay', async () => {
    const pip = setup();
    h.delay.value = 250;

    await pip.updatePiPSubtitles({ path: 'D:/v.mp4' } as never);
    await nextTick();

    expect(h.pip.updateSubtitle).toHaveBeenCalledWith({
      subContent: 'subs',
      fonts: [],
      availableFonts: {},
      subtitleDelayMs: 250
    });
  });

  it('skips extraction when PiP is inactive and the guard is on', async () => {
    const pip = setup();

    await pip.updatePiPSubtitles({ path: 'D:/v.mp4' } as never, true);

    expect(h.prepare).not.toHaveBeenCalled();
  });

  it('swallows extraction failures', async () => {
    h.prepare.mockRejectedValueOnce(new Error('ffmpeg'));
    const pip = setup();

    await expect(pip.updatePiPSubtitles({ path: 'D:/v.mp4' } as never)).resolves.toBeUndefined();
    expect(h.pip.updateSubtitle).not.toHaveBeenCalled();
  });

  it('resends the last data when the delay changes', async () => {
    h.player.pipActive = true;
    const pip = setup();
    await pip.updatePiPSubtitles({ path: 'D:/v.mp4' } as never);
    h.pip.updateSubtitle.mockClear();

    h.delay.value = 500;
    await nextTick();

    expect(h.pip.updateSubtitle).toHaveBeenCalledWith(
      expect.objectContaining({ subtitleDelayMs: 500 })
    );
  });

  it('ignores delay changes without an active PiP or cached data', async () => {
    setup();
    h.delay.value = 500;
    await nextTick();
    expect(h.pip.updateSubtitle).not.toHaveBeenCalled();

    h.player.pipActive = true;
    h.delay.value = 600;
    await nextTick();
    expect(h.pip.updateSubtitle).not.toHaveBeenCalled();
  });
});
