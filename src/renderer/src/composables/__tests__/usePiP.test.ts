import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  getLastSubtitle: vi.fn(),
  on: vi.fn(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
  cleanups: [] as Array<() => void>,
  pipStart: vi.fn(),
  pipStop: vi.fn(),
  pipLoadTrack: vi.fn(),
  pipPreload: vi.fn(),
  pipUpdateSubtitle: vi.fn()
}));

vi.mock('@renderer/composables/useSubtitleRenderer', () => ({
  getLastSubtitleData: h.getLastSubtitle
}));

import { usePiP } from '../usePiP';

let wrapper: VueWrapper | null = null;
let api: ReturnType<typeof usePiP> | null = null;

function setup(callbacks?: Parameters<typeof usePiP>[0]) {
  const Comp = defineComponent({
    setup() {
      api = usePiP(callbacks);
      return () => null;
    }
  });
  wrapper = mount(Comp);
  return api!;
}

beforeEach(() => {
  h.listeners.clear();
  h.cleanups = [];
  h.getLastSubtitle.mockReset();
  h.getLastSubtitle.mockReturnValue({ subContent: 'subs', fonts: [] });
  h.on.mockReset();
  h.on.mockImplementation((channel: string, handler: (...args: unknown[]) => void) => {
    h.listeners.set(channel, handler);
    const cleanup = vi.fn();
    h.cleanups.push(cleanup);
    return cleanup;
  });
  h.pipStart.mockReset();
  h.pipStart.mockResolvedValue(true);
  h.pipStop.mockReset();
  h.pipStop.mockResolvedValue(true);
  h.pipLoadTrack.mockReset();
  h.pipPreload.mockReset();
  h.pipUpdateSubtitle.mockReset();
  (window as unknown as { api?: unknown }).api = {
    on: h.on,
    pipStart: h.pipStart,
    pipStop: h.pipStop,
    pipLoadTrack: h.pipLoadTrack,
    pipPreload: h.pipPreload,
    pipUpdateSubtitle: h.pipUpdateSubtitle
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  api = null;
  delete (window as unknown as { api?: unknown }).api;
});

describe('listeners', () => {
  it('registers PiP listeners on mount', () => {
    setup();

    expect(h.on).toHaveBeenCalledWith('pip:closed', expect.any(Function));
    expect(h.on).toHaveBeenCalledWith('pip:maximize', expect.any(Function));
  });

  it('updates state and callbacks on close', () => {
    const onClosed = vi.fn();
    const pip = setup({ onClosed });

    h.listeners.get('pip:closed')!(90);
    expect(pip.currentTime.value).toBe(90);
    expect(pip.isActive.value).toBe(false);
    expect(onClosed).toHaveBeenCalledWith(90);

    h.listeners.get('pip:closed')!(null);
    expect(pip.currentTime.value).toBe(0);
    expect(onClosed).toHaveBeenLastCalledWith(0);
  });

  it('forwards maximize times', () => {
    const onMaximize = vi.fn();
    setup({ onMaximize });

    h.listeners.get('pip:maximize')!(45);
    h.listeners.get('pip:maximize')!(undefined);

    expect(onMaximize).toHaveBeenNthCalledWith(1, 45);
    expect(onMaximize).toHaveBeenNthCalledWith(2, 0);
  });

  it('runs every cleanup on unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;

    expect(h.cleanups).toHaveLength(2);
    for (const cleanup of h.cleanups) expect(cleanup).toHaveBeenCalled();
  });

  it('does nothing without a preload bridge', () => {
    delete (window as unknown as { api?: unknown }).api;
    const pip = setup();

    expect(h.on).not.toHaveBeenCalled();
    expect(pip.isActive.value).toBe(false);
  });
});

describe('actions', () => {
  it('starts PiP with defaults and subtitle data', async () => {
    const pip = setup();

    await expect(pip.start('https://video/1')).resolves.toBe(true);

    expect(h.getLastSubtitle).toHaveBeenCalled();
    expect(h.pipStart).toHaveBeenCalledWith('https://video/1', {
      position: undefined,
      width: undefined,
      height: undefined,
      startTime: 0,
      subtitle: { subContent: 'subs', fonts: [] }
    });
  });

  it('passes options and can skip subtitles', async () => {
    const pip = setup();

    await pip.start('https://video/2', {
      position: 'top-left',
      width: 640,
      height: 360,
      startTime: 30,
      subtitle: false
    });

    expect(h.getLastSubtitle).not.toHaveBeenCalled();
    expect(h.pipStart).toHaveBeenCalledWith('https://video/2', {
      position: 'top-left',
      width: 640,
      height: 360,
      startTime: 30,
      subtitle: null
    });
  });

  it('stops PiP', async () => {
    const pip = setup();
    await expect(pip.stop()).resolves.toBe(true);
    expect(h.pipStop).toHaveBeenCalled();
  });

  it('forwards track, preload and subtitle updates', () => {
    const pip = setup();
    const data = { subContent: 's', fonts: [], availableFonts: {} };

    pip.loadTrack('https://video/3', data);
    pip.preload('https://video/4', data);
    pip.updateSubtitle(data);

    expect(h.pipLoadTrack).toHaveBeenCalledWith('https://video/3', data);
    expect(h.pipPreload).toHaveBeenCalledWith('https://video/4', data);
    expect(h.pipUpdateSubtitle).toHaveBeenCalledWith(data);
  });

  it('loads the track from the first video element', () => {
    const pip = setup();
    pip.loadTrackFromCurrent();
    expect(h.pipLoadTrack).not.toHaveBeenCalled();

    const video = document.createElement('video');
    document.body.append(video);
    pip.loadTrackFromCurrent();
    expect(h.pipLoadTrack).not.toHaveBeenCalled();

    video.src = 'https://video/5';
    pip.loadTrackFromCurrent();

    expect(h.pipLoadTrack).toHaveBeenCalledWith('https://video/5', {
      subContent: 'subs',
      fonts: []
    });
  });

  it('returns false without the bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const pip = setup();

    await expect(pip.start('https://video/6')).resolves.toBe(false);
    await expect(pip.stop()).resolves.toBe(false);
    expect(() => pip.loadTrack('x', null)).not.toThrow();
    expect(() => pip.preload('x', null)).not.toThrow();
    expect(() => pip.updateSubtitle(null)).not.toThrow();
  });
});
