import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { usePipVideoIpc } from '../usePipVideoIpc';

const state = vi.hoisted(() => ({
  sub: null as any,
  send: vi.fn(),
  on: vi.fn(),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  cleanups: [] as Array<ReturnType<typeof vi.fn>>,
  setProperty: vi.fn()
}));

vi.mock('@renderer/utils/formatters', () => ({
  formatDuration: (seconds: number) => `${Math.floor(seconds)}s`
}));

const Harness = defineComponent({
  setup() {
    const videoRef = ref<HTMLVideoElement | null>(null);
    const progressRef = ref<HTMLDivElement | null>(null);
    const api = usePipVideoIpc(state.sub, { videoRef, progressRef });
    return { ...api, videoRef, progressRef };
  },
  template: '<div><video ref="videoRef" /><div ref="progressRef" /></div>'
});

let wrapper: VueWrapper | null = null;

function mountPip() {
  wrapper = mount(Harness, { attachTo: document.body });
  return wrapper;
}

function vm(): Record<string, any> {
  return wrapper!.vm as unknown as Record<string, any>;
}

function video(): HTMLVideoElement {
  return wrapper!.get('video').element as HTMLVideoElement;
}

function setupVideo(durationValue = 100, currentTimeValue = 0) {
  const el = video();
  const duration = durationValue;
  let currentTime = currentTimeValue;
  let src = '';
  Object.defineProperty(el, 'duration', { configurable: true, get: () => duration });
  Object.defineProperty(el, 'currentTime', {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    }
  });
  Object.defineProperty(el, 'src', {
    configurable: true,
    get: () => src,
    set: (value: string) => {
      src = value;
    }
  });
  el.play = vi.fn(async () => undefined);
  el.pause = vi.fn();
  el.load = vi.fn();
  el.removeAttribute = vi.fn();
  return el;
}

beforeEach(() => {
  state.sub = { clearSubtitle: vi.fn(), receiveSubtitle: vi.fn() };
  state.handlers = {};
  state.cleanups = [];
  state.send.mockReset();
  state.on.mockReset();
  state.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    state.handlers[event] = cb;
    const cleanup = vi.fn();
    state.cleanups.push(cleanup);
    return cleanup;
  });
  state.setProperty.mockReset();
  vi.spyOn(document.documentElement.style, 'setProperty').mockImplementation(state.setProperty);
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: 'en-US'
  });
  (window as { api?: unknown }).api = { on: state.on, send: state.send };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('setup and labels', () => {
  it('translates labels for English and Polish', () => {
    mountPip();
    expect(vm().t('settings')).toBe('Settings');

    wrapper!.unmount();
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'pl-PL'
    });
    mountPip();
    expect(vm().t('settings')).toBe('Ustawienia');
    expect(vm().t('close')).toBe('Zamknij');
  });

  it('derives the CSS filter from adjustments', async () => {
    mountPip();
    expect(vm().videoFilter).toBe('none');

    vm().brightness = 110;
    await wrapper!.vm.$nextTick();
    expect(vm().videoFilter).toBe('brightness(110%)');

    vm().contrast = 90;
    await wrapper!.vm.$nextTick();
    expect(vm().videoFilter).toBe('brightness(110%) contrast(90%)');

    vm().brightness = 100;
    vm().contrast = 100;
    await wrapper!.vm.$nextTick();
    expect(vm().videoFilter).toBe('none');
  });

  it('sets crossOrigin and registers all IPC listeners', () => {
    mountPip();
    const el = setupVideo();

    expect(el.crossOrigin).toBe('anonymous');
    expect(state.on).toHaveBeenCalledTimes(9);
    for (const event of [
      'pip:videoSrc',
      'pip:play',
      'pip:requestTime',
      'pip:pause',
      'pip:clear',
      'pip:subtitle',
      'pip:clearSubtitle',
      'pip:theme',
      'pip:locale'
    ]) {
      expect(state.handlers[event]).toBeTypeOf('function');
    }
  });

  it('works without the preload bridge', () => {
    delete (window as { api?: unknown }).api;
    mountPip();
    setupVideo();
    expect(state.on).not.toHaveBeenCalled();
  });
});

describe('video events', () => {
  it('updates duration and resumes playback when ready', () => {
    mountPip();
    const el = setupVideo(65);

    vm().onVideoMeta();
    expect(vm().duration).toBe('65s');
    expect(el.play).toHaveBeenCalled();
  });

  it('applies a pending start and waits for an explicit play', () => {
    mountPip();
    const el = setupVideo(120);

    state.handlers['pip:videoSrc']({ src: 'https://video', start: 30 });
    expect(state.handlers['pip:videoSrc']).toBeTypeOf('function');
    expect(el.src).toBe('https://video');
    expect(state.sub.clearSubtitle).toHaveBeenCalled();

    vm().onVideoMeta();
    expect(el.currentTime).toBe(30);
    expect(el.play).not.toHaveBeenCalled();

    state.handlers['pip:play'](12);
    expect(el.currentTime).toBe(12);
    expect(el.play).toHaveBeenCalled();
  });

  it('updates progress and time labels', () => {
    mountPip();
    const el = setupVideo(100, 25);

    vm().onTimeUpdate();
    expect(vm().progress).toBe(25);
    expect(vm().currentTime).toBe('25s');

    Object.defineProperty(el, 'duration', { configurable: true, get: () => 0 });
    vm().onTimeUpdate();
    expect(vm().progress).toBe(0);
  });

  it('ignores events without a video element', () => {
    mountPip();
    vm().videoRef = null;

    expect(() => vm().onVideoMeta()).not.toThrow();
    expect(() => vm().onTimeUpdate()).not.toThrow();
    expect(() => vm().onProgressClick({ clientX: 10 } as MouseEvent)).not.toThrow();
    expect(() => vm().sendMaximize()).not.toThrow();
  });

  it('reports the end and maximizes', () => {
    mountPip();
    setupVideo(100, 42);

    // onVideoEnded is exposed directly rather than registered as an IPC event.
    vm().onVideoEnded();
    expect(state.send).toHaveBeenCalledWith('pip:ended');
    vm().sendMaximize();
    expect(state.send).toHaveBeenCalledWith('pip:maximize', 42);
  });

  it('seeks from the progress bar', () => {
    mountPip();
    const el = setupVideo(200);
    const bar = wrapper!.findAll('div')[1].element as HTMLElement;
    bar.getBoundingClientRect = () => ({ left: 10, top: 0, width: 100, height: 10 }) as DOMRect;

    vm().onProgressClick({ clientX: 60 } as MouseEvent);
    expect(el.currentTime).toBe(100);
  });
});

describe('IPC handlers', () => {
  beforeEach(() => {
    mountPip();
    setupVideo(100, 20);
  });

  it('sends the current time on request', () => {
    state.handlers['pip:requestTime']();
    expect(state.send).toHaveBeenCalledWith('pip:timeUpdate', 20);
  });

  it('pauses and clears the video', () => {
    const el = video();

    state.handlers['pip:pause']();
    expect(el.pause).toHaveBeenCalled();

    state.handlers['pip:clear']();
    expect(state.sub.clearSubtitle).toHaveBeenCalled();
    expect(el.pause).toHaveBeenCalledTimes(2);
    expect(el.removeAttribute).toHaveBeenCalledWith('src');
    expect(el.load).toHaveBeenCalled();
  });

  it('forwards subtitles', () => {
    const payload = { cues: [] } as never;
    state.handlers['pip:subtitle'](payload);
    expect(state.sub.receiveSubtitle).toHaveBeenCalledWith(payload);

    state.handlers['pip:clearSubtitle']();
    expect(state.sub.clearSubtitle).toHaveBeenCalled();
  });

  it('applies theme variables and ignores empty themes', () => {
    state.handlers['pip:theme']({ '--accent': '#fff' });
    expect(state.setProperty).toHaveBeenCalledWith('--accent', '#fff');

    expect(() => state.handlers['pip:theme'](undefined)).not.toThrow();
  });

  it('switches locale from IPC', () => {
    state.handlers['pip:locale']('pl-PL');
    expect(vm().t('settings')).toBe('Ustawienia');

    state.handlers['pip:locale']('de-DE');
    expect(vm().t('settings')).toBe('Settings');

    state.handlers['pip:locale']('');
    expect(vm().t('settings')).toBe('Settings');
  });

  it('handles commands without a video element', () => {
    vm().videoRef = null;
    expect(() => state.handlers['pip:videoSrc']({ src: 'x', start: 0 })).not.toThrow();
    expect(() => state.handlers['pip:play'](5)).not.toThrow();
    expect(() => state.handlers['pip:requestTime']()).not.toThrow();
    expect(() => state.handlers['pip:pause']()).not.toThrow();
    expect(() => state.handlers['pip:clear']()).not.toThrow();
  });
});

describe('cleanup', () => {
  it('runs every registered cleanup on unmount', () => {
    mountPip();
    setupVideo();
    expect(state.cleanups).toHaveLength(9);

    wrapper!.unmount();
    wrapper = null;
    for (const cleanup of state.cleanups) expect(cleanup).toHaveBeenCalled();
  });
});
