import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

// Miniatury: loader/API są podstawione, a IntersectionObserver jest globalnym
// stubem, więc możemy ręcznie wyzwolić widoczność elementu.
const state = vi.hoisted(() => ({
  tasks: [] as Array<() => void>,
  thumbs: new Map<string, string>(),
  icons: new Map<string, string>(),
  processQueue: vi.fn(),
  taskDone: vi.fn(),
  invoke: vi.fn(),
  loggerError: vi.fn()
}));

const observerState = {
  callback: null as null | ((entries: Array<{ target: Element; isIntersecting: boolean }>) => void),
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
};

class FakeIntersectionObserver {
  constructor(callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void) {
    observerState.callback = callback;
  }
  observe = observerState.observe;
  unobserve = observerState.unobserve;
  disconnect = observerState.disconnect;
}

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
vi.mock('@renderer/utils/thumbLoader', () => ({
  thumbTasks: state.tasks,
  cachedThumb: (path: string) => state.thumbs.get(path),
  setCachedThumb: (path: string, data: string) => state.thumbs.set(path, data),
  cachedIcon: (path: string) => state.icons.get(path),
  setCachedIcon: (path: string, data: string) => state.icons.set(path, data),
  isUsableImageDataUrl: (value: unknown) =>
    typeof value === 'string' && value.startsWith('data:image'),
  processThumbQueue: state.processQueue,
  thumbTaskDone: state.taskDone
}));
vi.mock('@shared/logger', () => ({
  logger: { error: state.loggerError, warn: vi.fn(), info: vi.fn() }
}));

const { useThumbnail } = await import('../useThumbnail');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let media: ReturnType<typeof deferred<string | null>>;
let icon: ReturnType<typeof deferred<string | null>>;

function mountThumb(
  options: {
    path?: string | (() => string) | ReturnType<typeof ref<string>>;
    isDirectory?: boolean | (() => boolean);
    isDriveList?: boolean | (() => boolean);
    thumbSize?: number;
  } = {}
) {
  const path = options.path ?? '/music/a.jpg';
  const isDirectory = options.isDirectory ?? false;
  const isDriveList = options.isDriveList ?? false;
  let thumb!: ReturnType<typeof useThumbnail>;
  let rootEl: HTMLElement | null = null;

  const Comp = defineComponent({
    setup() {
      thumb = useThumbnail(path as never, isDirectory, isDriveList, options.thumbSize);
      return () =>
        h('div', {
          ref: (el: unknown) => {
            thumb.rootEl.value = el as HTMLElement | null;
            rootEl = el as HTMLElement | null;
          }
        });
    }
  });

  const wrapper = mount(Comp, { attachTo: document.body });
  return {
    wrapper,
    thumb,
    getRoot: () => rootEl
  };
}

async function makeVisible(
  thumb: ReturnType<typeof useThumbnail>,
  _wrapper?: { unmount: () => void }
) {
  const element = thumb.rootEl.value;
  expect(element).not.toBeNull();
  observerState.callback!([{ target: element!, isIntersecting: true }]);
  await nextTick();
}

async function runTask(): Promise<void> {
  const task = state.tasks.shift();
  expect(task).toBeDefined();
  task!();
  await Promise.resolve();
  await Promise.resolve();
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

beforeEach(() => {
  state.tasks.length = 0;
  state.thumbs.clear();
  state.icons.clear();
  state.processQueue.mockClear();
  state.taskDone.mockClear();
  state.invoke.mockReset();
  state.loggerError.mockClear();
  observerState.observe.mockClear();
  observerState.unobserve.mockClear();
  media = deferred<string | null>();
  icon = deferred<string | null>();
  state.invoke.mockImplementation((channel: string) =>
    channel === 'media:getThumbnail' ? media.promise : icon.promise
  );
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.useRealTimers();
});

describe('visibility and guards', () => {
  it('observes the root element on mount', () => {
    const { thumb, wrapper } = mountThumb();
    expect(observerState.observe).toHaveBeenCalledWith(thumb.rootEl.value);
    wrapper.unmount();
  });

  it('requests a thumbnail when the root becomes visible', async () => {
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);

    expect(state.tasks).toHaveLength(1);
    expect(state.processQueue).toHaveBeenCalled();

    await runTask();
    expect(state.invoke).toHaveBeenCalledWith('media:getThumbnail', '/music/a.jpg', 320);

    media.resolve('data:image/jpeg;base64,thumb');
    await flush();

    expect(thumb.mediaThumb.value).toBe('data:image/jpeg;base64,thumb');
    expect(state.thumbs.get('/music/a.jpg')).toBe('data:image/jpeg;base64,thumb');
    expect(state.taskDone).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('skips directories, drive lists and empty paths', async () => {
    const directory = mountThumb({ isDirectory: true });
    await makeVisible(directory.thumb, directory.wrapper);
    expect(state.tasks).toHaveLength(0);
    directory.wrapper.unmount();

    const drive = mountThumb({ isDriveList: () => true });
    await makeVisible(drive.thumb, drive.wrapper);
    expect(state.tasks).toHaveLength(0);
    drive.wrapper.unmount();

    const empty = mountThumb({ path: '' });
    await makeVisible(empty.thumb, empty.wrapper);
    expect(state.tasks).toHaveLength(0);
    empty.wrapper.unmount();
  });

  it('supports getter and ref path sources', async () => {
    const path = ref('/music/ref.jpg');
    const byRef = mountThumb({ path });
    await makeVisible(byRef.thumb, byRef.wrapper);
    expect(state.tasks).toHaveLength(1);
    state.tasks.length = 0;
    byRef.wrapper.unmount();

    const byGetter = mountThumb({ path: () => '/music/getter.jpg', thumbSize: 128 });
    await makeVisible(byGetter.thumb, byGetter.wrapper);
    await runTask();
    expect(state.invoke).toHaveBeenCalledWith('media:getThumbnail', '/music/getter.jpg', 128);
    byGetter.wrapper.unmount();
  });

  it('uses a cached thumbnail without queuing work', async () => {
    state.thumbs.set('/music/cached.jpg', 'data:image/jpeg;base64,cached');
    const { thumb, wrapper } = mountThumb({ path: '/music/cached.jpg' });

    await makeVisible(thumb, wrapper);

    expect(thumb.mediaThumb.value).toBe('data:image/jpeg;base64,cached');
    expect(state.tasks).toHaveLength(0);
    wrapper.unmount();
  });

  it('requests only once until the path changes', async () => {
    const path = ref('/music/a.jpg');
    const { thumb, wrapper } = mountThumb({ path });
    await makeVisible(thumb, wrapper);
    expect(state.tasks).toHaveLength(1);

    await makeVisible(thumb, wrapper);
    expect(state.tasks).toHaveLength(1);

    state.tasks.length = 0;
    path.value = '/music/b.jpg';
    await nextTick();
    expect(state.tasks).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('icon fallback', () => {
  it('uses a cached icon when the thumbnail is not an image', async () => {
    state.icons.set('/music/a.jpg', 'data:image/png;base64,icon');
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);
    await runTask();

    media.resolve(null);
    await flush();

    expect(thumb.systemIcon.value).toBe('data:image/png;base64,icon');
    expect(state.invoke).not.toHaveBeenCalledWith('shell:getFileIcon', '/music/a.jpg');
    wrapper.unmount();
  });

  it('falls back to a system icon request', async () => {
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);
    await runTask();

    media.resolve(null);
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('shell:getFileIcon', '/music/a.jpg');

    icon.resolve('data:image/png;base64,icon');
    await flush();

    expect(thumb.systemIcon.value).toBe('data:image/png;base64,icon');
    expect(state.icons.get('/music/a.jpg')).toBe('data:image/png;base64,icon');
    wrapper.unmount();
  });

  it('uses the icon fallback when the thumbnail request fails', async () => {
    state.icons.set('/music/a.jpg', 'data:image/png;base64,cached-icon');
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);
    await runTask();

    media.reject(new Error('ffmpeg'));
    await flush();

    expect(state.loggerError).toHaveBeenCalledWith('Thumbnail', 'getThumbnail', expect.any(Error));
    expect(thumb.systemIcon.value).toBe('data:image/png;base64,cached-icon');
    wrapper.unmount();
  });

  it('requests the system icon after a failure without a cached one', async () => {
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);
    await runTask();

    media.reject(new Error('ffmpeg'));
    await flush();
    expect(state.invoke).toHaveBeenCalledWith('shell:getFileIcon', '/music/a.jpg');

    icon.resolve('data:image/png;base64,fallback');
    await flush();
    expect(thumb.systemIcon.value).toBe('data:image/png;base64,fallback');
    wrapper.unmount();
  });

  it('logs a failing icon request', async () => {
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);
    await runTask();

    media.resolve(null);
    await flush();
    icon.reject(new Error('icon'));
    await flush();

    expect(state.loggerError).toHaveBeenCalledWith(
      'Thumbnail',
      'getFileIcon (fallback)',
      expect.any(Error)
    );
    wrapper.unmount();
  });
});

describe('stale requests and teardown', () => {
  it('ignores a queued task after the path changed', async () => {
    const path = ref('/music/old.jpg');
    const { thumb, wrapper } = mountThumb({ path });
    await makeVisible(thumb, wrapper);

    path.value = '/music/new.jpg';
    await nextTick();
    state.invoke.mockClear();

    await runTask();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.taskDone).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('ignores a queued task after unmount and unobserves', async () => {
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);
    const element = thumb.rootEl.value;

    wrapper.unmount();
    expect(observerState.unobserve).toHaveBeenCalledWith(element);

    await runTask();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(state.taskDone).toHaveBeenCalled();
  });

  it('finishes the task when the preload bridge is missing', async () => {
    const { thumb, wrapper } = mountThumb();
    await makeVisible(thumb, wrapper);
    delete (window as { api?: unknown }).api;

    await runTask();
    expect(state.taskDone).toHaveBeenCalled();
    wrapper.unmount();
  });
});
