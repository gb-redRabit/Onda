import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import VideoClipperToolView from '../VideoClipperToolView.vue';
import { formatTimecode } from '@renderer/utils/videoClipper';

const state = vi.hoisted(() => ({
  context: null as any,
  sendToMain: vi.fn(),
  dropped: [] as string[],
  thumbs: null as any,
  thumbsOptions: null as any,
  invoke: vi.fn(),
  clipVideo: vi.fn(),
  cancelVideoClip: vi.fn(),
  on: vi.fn(),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  offProgress: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useToolBridge', () => ({
  useToolBridge: () => ({ context: state.context, sendToMain: state.sendToMain })
}));
vi.mock('@renderer/utils/fileDrag', () => ({
  getDroppedFilePaths: () => state.dropped
}));
vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (path: string) => `media://${path}`
}));
vi.mock('@renderer/composables/useVideoThumbnails', () => ({
  useVideoThumbnails: (options: unknown) => {
    state.thumbsOptions = options;
    return state.thumbs;
  }
}));

const SelectStub = {
  name: 'Select',
  props: ['modelValue', 'size', 'disabled'],
  emits: ['update:modelValue'],
  template: '<div v-bind="$attrs"><slot /></div>'
};
const PathInputStub = {
  name: 'PathInput',
  props: ['modelValue', 'readonly', 'label', 'placeholder', 'disabled'],
  emits: ['update:modelValue', 'browse'],
  template: '<div v-bind="$attrs">{{ modelValue }}</div>'
};
const ButtonStub = {
  name: 'Button',
  props: ['variant', 'disabled', 'loading'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot name="leading" /><slot /></button>'
};
const IconButtonStub = {
  name: 'IconButton',
  props: ['icon', 'label', 'size'],
  emits: ['click'],
  template: '<button v-bind="$attrs" :aria-label="label" @click="$emit(\'click\')" />'
};
const EmptyStub = {
  name: 'EmptyState',
  props: ['title', 'description', 'icon'],
  template: '<div data-testid="empty">{{ title }}</div>'
};
const SpinnerStub = { name: 'Spinner', template: '<span data-testid="spinner" />' };
const ShellStub = {
  name: 'ToolWindowShell',
  props: ['title', 'icon'],
  template: '<div><slot /><footer><slot name="footer" /></footer></div>'
};

let wrapper: VueWrapper | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  await nextTick();
}

function mountView() {
  wrapper = mount(VideoClipperToolView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ToolWindowShell: ShellStub,
        EmptyState: EmptyStub,
        Spinner: SpinnerStub,
        Button: ButtonStub,
        IconButton: IconButtonStub,
        PathInput: PathInputStub,
        Select: SelectStub
      }
    }
  });
  return wrapper;
}

function select(testid: string) {
  return wrapper!
    .findAllComponents(SelectStub)
    .find((component) => (component.attributes()['data-testid'] ?? '') === testid)!;
}

function pathInput() {
  return wrapper!.findComponent(PathInputStub);
}

function setMedia(video: HTMLVideoElement, duration: number) {
  let paused = true;
  let time = 0;
  Object.defineProperty(video, 'duration', { configurable: true, get: () => duration });
  Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value;
    }
  });
  video.play = vi.fn(async () => {
    paused = false;
    video.dispatchEvent(new Event('play'));
  });
  video.pause = vi.fn(() => {
    paused = true;
    video.dispatchEvent(new Event('pause'));
  });
}

function stubTimeline() {
  const scroll = wrapper!.get('[data-testid="clip-timeline-scroll"]').element as HTMLElement;
  const timeline = wrapper!.get('[data-testid="clip-timeline"]').element as HTMLElement;
  Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 500 });
  Object.defineProperty(scroll, 'scrollWidth', { configurable: true, value: 1000 });
  scroll.scrollLeft = 0;
  Object.defineProperty(timeline, 'clientWidth', { configurable: true, value: 800 });
  scroll.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 500, height: 100, right: 500, bottom: 100, x: 0, y: 0 }) as DOMRect;
  timeline.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 100, right: 800, bottom: 100, x: 0, y: 0 }) as DOMRect;
}

async function mountLoaded(duration = 120, path = 'C:\\videos\\a.mp4') {
  state.context.value = { params: { path } };
  mountView();
  await flush();
  stubTimeline();
  const video = wrapper!.get('video').element as HTMLVideoElement;
  setMedia(video, duration);
  video.dispatchEvent(new Event('loadedmetadata'));
  await flush();
  return video;
}

async function timeTo(video: HTMLVideoElement, seconds: number) {
  video.currentTime = seconds;
  video.dispatchEvent(new Event('timeupdate'));
  await flush();
}

beforeEach(() => {
  state.context = ref({ params: {} });
  state.sendToMain.mockReset();
  state.dropped = [];
  state.thumbs = {
    thumbnails: ref<string[]>([]),
    thumbsLoading: ref(false),
    thumbsRefreshing: ref(false),
    thumbsError: ref(''),
    frameStrip: ref<{ frames: string[]; startSec: number; stepSec: number } | null>(null),
    frameStripLoading: ref(false),
    cancelThumbnails: vi.fn(),
    cancelFrameStrip: vi.fn(),
    scheduleThumbnailRefresh: vi.fn(),
    scheduleFrameStrip: vi.fn(),
    generateThumbnails: vi.fn(async () => undefined)
  };
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.clipVideo.mockReset();
  state.clipVideo.mockResolvedValue({ success: true, outputPath: 'C:/out/a.mp4' });
  state.cancelVideoClip.mockReset();
  state.cancelVideoClip.mockResolvedValue(true);
  state.handlers = {};
  state.offProgress.mockReset();
  state.on.mockReset();
  state.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    state.handlers[event] = cb;
    return state.offProgress;
  });
  let uuid = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `uuid-${++uuid}`
  });
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    clipVideo: state.clipVideo,
    cancelVideoClip: state.cancelVideoClip,
    on: state.on
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('loading a video', () => {
  it('starts with the dropzone and picks a video through the dialog', async () => {
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\videos\\b.mkv'] });
    mountView();

    expect(wrapper!.get('[data-testid="empty"]').text()).toBe('tools.clipEmpty');
    await wrapper!.get('[data-testid="clip-pick"]').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('dialog:openFile', {
      properties: ['openFile'],
      filters: [{ name: 'tools.video', extensions: expect.any(Array) }]
    });
    expect(wrapper!.get('video').attributes('src')).toBe('media://C:\\videos\\b.mkv');
    expect(state.invoke).toHaveBeenCalledWith('media:grantAccess', 'C:\\videos\\b.mkv');
  });

  it('ignores a cancelled picker and shows a spinner while granting access', async () => {
    state.invoke.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    mountView();
    await wrapper!.get('[data-testid="clip-pick"]').trigger('click');
    await flush();
    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(true);

    let resolveAccess!: (value: unknown) => void;
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\videos\\a.mp4'] });
    state.invoke.mockReturnValueOnce(new Promise((resolve) => (resolveAccess = resolve)));
    await wrapper!.get('[data-testid="clip-pick"]').trigger('click');
    await flush();
    expect(wrapper!.findAll('[data-testid="spinner"]')).toHaveLength(1);

    resolveAccess(null);
    await flush();
    expect(wrapper!.findAll('video')).toHaveLength(1);
  });

  it('loads dropped videos and ignores other extensions', async () => {
    state.dropped = ['C:\\docs\\note.txt', 'C:\\videos\\drop.mp4'];
    mountView();
    await wrapper!.get('[data-testid="clip-view"]').trigger('drop', { dataTransfer: {} });
    await flush();
    expect(wrapper!.get('video').attributes('src')).toBe('media://C:\\videos\\drop.mp4');

    wrapper!.unmount();
    state.dropped = ['C:\\docs\\note.txt'];
    state.context.value = { params: {} };
    mountView();
    await wrapper!.get('[data-testid="clip-view"]').trigger('drop', { dataTransfer: {} });
    await flush();
    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(true);
  });

  it('loads a video from the tool context and normalises the container', async () => {
    await mountLoaded(120, 'C:\\videos\\b.webm');
    expect(wrapper!.get('video').attributes('src')).toBe('media://C:\\videos\\b.webm');
    expect(select('clip-container').props('modelValue')).toBe('mkv');
  });

  it('clears the video back to the dropzone', async () => {
    const video = await mountLoaded();
    await wrapper!
      .findAll('button')
      .find((button) => button.text().includes('tools.clipReplace'))!
      .trigger('click');
    await flush();

    expect(video.pause).toHaveBeenCalled();
    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(true);
  });
});

describe('metadata and range', () => {
  it('reads duration and resets the selection', async () => {
    await mountLoaded(120);

    expect(wrapper!.get('[data-testid="clip-timeline"]').attributes('data-duration')).toBe('120');
    expect(wrapper!.get('[data-testid="clip-start-label"]').text()).toBe(formatTimecode(0, 30));
    expect(wrapper!.get('[data-testid="clip-end-label"]').text()).toBe(formatTimecode(120, 30));
    expect(state.thumbs.generateThumbnails).toHaveBeenCalled();
    expect(wrapper!.get('[data-testid="clip-export"]').attributes('disabled')).toBeUndefined();
  });

  it('sets start and end markers from the playhead', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    expect(wrapper!.get('[data-testid="clip-snap"]').attributes('aria-pressed')).toBe('false');

    await timeTo(video, 10);
    await wrapper!.get('[data-testid="clip-set-start"]').trigger('click');
    await timeTo(video, 20);
    await wrapper!.get('[data-testid="clip-set-end"]').trigger('click');
    await flush();

    expect(wrapper!.get('[data-testid="clip-start-label"]').text()).toBe(formatTimecode(10, 30));
    expect(wrapper!.get('[data-testid="clip-end-label"]').text()).toBe(formatTimecode(20, 30));
  });

  it('clamps the range and resets it', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    await timeTo(video, 120);
    await wrapper!.get('[data-testid="clip-set-start"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="clip-start-label"]').text()).toBe(
      formatTimecode(119.95, 30)
    );

    await wrapper!
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'tools.clipReset')!
      .trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="clip-start-label"]').text()).toBe(formatTimecode(0, 30));
    expect(wrapper!.get('[data-testid="clip-end-label"]').text()).toBe(formatTimecode(120, 30));
  });

  it('seeks with buttons, frames and the loop toggle', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');

    await wrapper!.get('[data-testid="clip-next-frame"]').trigger('click');
    expect(video.currentTime).toBeCloseTo(1 / 30, 4);
    await wrapper!.get('[data-testid="clip-prev-frame"]').trigger('click');
    expect(video.currentTime).toBeCloseTo(0, 4);

    await wrapper!.get('[data-testid="clip-loop"]').trigger('click');
    expect(wrapper!.get('[data-testid="clip-loop"]').attributes('aria-pressed')).toBe('true');

    await wrapper!.get('[data-testid="clip-play"]').trigger('click');
    await flush();
    expect(video.play).toHaveBeenCalled();
    await wrapper!.get('[data-testid="clip-play"]').trigger('click');
    expect(video.pause).toHaveBeenCalled();
  });

  it('loops back to the start when the range ends', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    await timeTo(video, 10);
    await wrapper!.get('[data-testid="clip-set-start"]').trigger('click');
    await timeTo(video, 20);
    await wrapper!.get('[data-testid="clip-set-end"]').trigger('click');
    await wrapper!.get('[data-testid="clip-loop"]').trigger('click');

    await wrapper!.get('[data-testid="clip-play"]').trigger('click');
    await flush();
    await timeTo(video, 20);
    expect(video.currentTime).toBe(10);
  });

  it('previews the selection and stops at the end', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    await timeTo(video, 10);
    await wrapper!.get('[data-testid="clip-set-start"]').trigger('click');
    await timeTo(video, 20);
    await wrapper!.get('[data-testid="clip-set-end"]').trigger('click');

    await wrapper!.get('[data-testid="clip-preview"]').trigger('click');
    await flush();
    expect(video.play).toHaveBeenCalled();
    expect(video.currentTime).toBe(10);

    await timeTo(video, 21);
    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(20);
  });
});

describe('clips list', () => {
  it('adds, removes and clears clips', async () => {
    await mountLoaded(120);

    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    expect(wrapper!.find('[data-testid="clip-list"]').exists()).toBe(true);
    expect(wrapper!.get('[data-testid="clip-list"]').text()).toContain('tools.clipList');
    expect(wrapper!.findAll('[data-testid="clip-export-list"]')).toHaveLength(1);

    await wrapper!.get('[aria-label="tools.remove"]').trigger('click');
    expect(wrapper!.findAll('[data-testid="clip-list"]')).toHaveLength(0);

    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    expect(wrapper!.findAll('[data-testid="clip-list"]')).toHaveLength(1);
    await wrapper!
      .findAll('button')
      .find((button) => button.text().includes('tools.clipClearList'))!
      .trigger('click');
    expect(wrapper!.findAll('[data-testid="clip-list"]')).toHaveLength(0);
  });

  it('does not add clips without a valid duration', async () => {
    state.context.value = { params: { path: 'C:\\videos\\a.mp4' } };
    mountView();
    await flush();

    expect(wrapper!.get('[data-testid="clip-add"]').attributes('disabled')).toBeDefined();
  });
});

describe('export options', () => {
  it('forces exact mode for GIF, mute, rotation and target size', async () => {
    await mountLoaded(120);
    const mode = () => select('clip-mode').props('modelValue');

    select('clip-format').vm.$emit('update:modelValue', 'gif');
    await flush();
    expect(mode()).toBe('exact');
    expect(select('clip-mode').props('disabled')).toBe(true);

    select('clip-format').vm.$emit('update:modelValue', 'video');
    await flush();
    select('clip-audio').vm.$emit('update:modelValue', 'mute');
    await flush();
    expect(mode()).toBe('exact');

    select('clip-rotation').vm.$emit('update:modelValue', '90');
    await flush();
    expect(select('clip-rotation').props('modelValue')).toBe(90);

    select('clip-target-size').vm.$emit('update:modelValue', '10');
    await flush();
    expect(select('clip-target-size').props('modelValue')).toBe(10);
  });

  it('picks the output folder', async () => {
    await mountLoaded(120);
    state.invoke.mockResolvedValueOnce(['D:\\clips']);
    pathInput().vm.$emit('browse');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('dialog:openFolder');
    expect(pathInput().props('modelValue')).toBe('D:\\clips');
  });

  it('ignores an empty output folder selection', async () => {
    await mountLoaded(120);
    state.invoke.mockResolvedValueOnce([]);
    pathInput().vm.$emit('browse');
    await flush();
    expect(pathInput().props('modelValue')).toBe('');
  });
});

describe('single export', () => {
  it('sends the request and reports success', async () => {
    await mountLoaded(120);
    pathInput().vm.$emit('update:modelValue', ' D:\\out ');
    select('clip-audio').vm.$emit('update:modelValue', 'mute');
    select('clip-rotation').vm.$emit('update:modelValue', '180');
    select('clip-target-size').vm.$emit('update:modelValue', '25');
    select('clip-container').vm.$emit('update:modelValue', 'webm');
    await flush();

    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();

    expect(state.clipVideo).toHaveBeenCalledTimes(1);
    expect(state.clipVideo.mock.calls[0][0]).toMatchObject({
      inputPath: 'C:\\videos\\a.mp4',
      outputDir: 'D:\\out',
      startSec: 0,
      endSec: 120,
      container: 'webm',
      mode: 'exact',
      format: 'video',
      audio: 'mute',
      rotation: 180,
      targetSizeMb: 25
    });
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('done');
    expect(state.sendToMain).toHaveBeenCalledWith('clip-complete', {
      name: 'a.mp4',
      outputPath: 'C:/out/a.mp4'
    });

    wrapper!.findComponent(IconButtonStub).vm.$emit('click');
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'C:/out/a.mp4');
  });

  it('reports progress for the current job only', async () => {
    let resolveClip!: (value: unknown) => void;
    state.clipVideo.mockReturnValueOnce(new Promise((resolve) => (resolveClip = resolve)));
    await mountLoaded(120);

    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('exporting');
    const jobId = state.clipVideo.mock.calls[0][0].jobId;

    state.handlers['tools:progress']({ jobId: 'other', percent: 10, speed: '9x' });
    expect(wrapper!.text()).not.toContain('9x');

    state.handlers['tools:progress']({ jobId, percent: 42, speed: '2x' });
    await flush();
    expect(wrapper!.text()).toContain('2x');
    expect(wrapper!.text()).toContain('tools.progress');

    resolveClip({ success: true, outputPath: 'C:/out/a.mp4' });
    await flush();
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('done');
  });

  it('handles cancellation, failure and thrown errors', async () => {
    await mountLoaded(120);

    state.clipVideo.mockResolvedValueOnce({ canceled: true });
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('canceled');

    state.clipVideo.mockResolvedValueOnce({ success: false, error: 'encoder failed' });
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('error');
    expect(wrapper!.text()).toContain('encoder failed');

    state.clipVideo.mockResolvedValueOnce({ success: false });
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('tools.clipFailed');

    state.clipVideo.mockRejectedValueOnce(new Error('bridge crashed'));
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('bridge crashed');

    state.clipVideo.mockResolvedValueOnce({ success: true });
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('done');
    expect(state.sendToMain).toHaveBeenCalledWith('clip-complete', {
      name: 'a.mp4',
      outputPath: undefined
    });

    state.clipVideo.mockRejectedValueOnce('plain crash');
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('plain crash');
  });

  it('cancels a running export', async () => {
    let resolveClip!: (value: unknown) => void;
    state.clipVideo.mockReturnValueOnce(new Promise((resolve) => (resolveClip = resolve)));
    await mountLoaded(120);

    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    const jobId = state.clipVideo.mock.calls[0][0].jobId;

    await wrapper!.get('[data-testid="clip-cancel"]').trigger('click');
    expect(state.cancelVideoClip).toHaveBeenCalledWith(jobId);

    resolveClip({ canceled: true });
    await flush();
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('canceled');
  });

  it('blocks export until a range is available', async () => {
    state.context.value = { params: { path: 'C:\\videos\\a.mp4' } };
    mountView();
    await flush();
    stubTimeline();

    expect(wrapper!.get('[data-testid="clip-export"]').attributes('disabled')).toBeDefined();
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    expect(state.clipVideo).not.toHaveBeenCalled();
  });
});

describe('list export', () => {
  it('exports every clip and reports the batch', async () => {
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');

    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();

    expect(state.clipVideo).toHaveBeenCalledTimes(2);
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('done');
    expect(wrapper!.text()).toContain('tools.done');
    expect(state.sendToMain).toHaveBeenCalledWith('clip-complete', {
      name: 'tools.clipListComplete',
      outputPath: 'C:/out/a.mp4'
    });
  });

  it('skips remaining clips after a cancellation', async () => {
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');

    state.clipVideo.mockResolvedValueOnce({ canceled: true });
    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();

    expect(state.clipVideo).toHaveBeenCalledTimes(1);
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('canceled');
  });

  it('reports batch errors', async () => {
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');

    state.clipVideo.mockResolvedValueOnce({ success: false, error: 'first failed' });
    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();

    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('error');
    expect(wrapper!.text()).toContain('first failed');

    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();
    state.clipVideo.mockRejectedValueOnce(new Error('list crash'));
    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('list crash');

    state.clipVideo.mockResolvedValue({ success: true });
    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();
    expect(state.sendToMain).toHaveBeenCalledWith('clip-complete', {
      name: 'tools.clipListComplete',
      outputPath: ''
    });

    state.clipVideo.mockRejectedValueOnce('plain list crash');
    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('plain list crash');
  });
});

describe('timeline interaction', () => {
  it('drags the start marker', async () => {
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    const marker = wrapper!.get('[data-testid="clip-marker-start"]').element;

    marker.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 64, clientY: 20, bubbles: true })
    );
    window.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 232, clientY: 20, bubbles: true })
    );
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    await flush();

    expect(wrapper!.get('[data-testid="clip-start-label"]').text()).toBe(formatTimecode(30, 30));
  });

  it('seeks from the timeline and follows scrolls', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    const timeline = wrapper!.get('[data-testid="clip-timeline"]').element;

    timeline.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 400, clientY: 20, bubbles: true })
    );
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    await flush();
    expect(video.currentTime).toBeCloseTo(60, 0);

    state.thumbs.scheduleFrameStrip.mockClear();
    await wrapper!.get('[data-testid="clip-timeline-scroll"]').trigger('scroll');
    expect(state.thumbs.scheduleFrameStrip).toHaveBeenCalled();
  });

  it('zooms with buttons, fit actions and Ctrl+wheel', async () => {
    await mountLoaded(120);
    const zoom = () => wrapper!.get('[data-testid="clip-zoom-label"]').text();

    expect(wrapper!.get('[data-testid="clip-zoom-out"]').attributes('disabled')).toBeDefined();
    await wrapper!.get('[data-testid="clip-zoom-in"]').trigger('click');
    expect(zoom()).toBe('1.5×');
    await wrapper!.get('[data-testid="clip-zoom-out"]').trigger('click');
    expect(zoom()).toBe('1×');

    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    const video = wrapper!.get('video').element as HTMLVideoElement;
    await timeTo(video, 10);
    await wrapper!.get('[data-testid="clip-set-start"]').trigger('click');
    await timeTo(video, 20);
    await wrapper!.get('[data-testid="clip-set-end"]').trigger('click');
    await wrapper!.get('[data-testid="clip-fit-selection"]').trigger('click');
    expect(zoom()).toBe('12×');

    await wrapper!.get('[data-testid="clip-fit-second"]').trigger('click');
    expect(zoom()).toBe('142.9×');

    await wrapper!.get('[data-testid="clip-fit"]').trigger('click');
    expect(zoom()).toBe('1×');

    const wheel = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true });
    wrapper!.get('[data-testid="clip-timeline-scroll"]').element.dispatchEvent(wheel);
    await flush();
    expect(zoom()).toBe('1.2×');

    const plain = new Event('wheel', { cancelable: true }) as WheelEvent;
    Object.defineProperty(plain, 'ctrlKey', { value: false });
    Object.defineProperty(plain, 'deltaY', { value: -100 });
    wrapper!.get('[data-testid="clip-timeline-scroll"]').element.dispatchEvent(plain);
    await flush();
    expect(zoom()).toBe('1.2×');
  });

  it('refreshes timeline metrics on window resize', async () => {
    await mountLoaded(120);
    state.thumbs.scheduleThumbnailRefresh.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(state.thumbs.scheduleThumbnailRefresh).toHaveBeenCalledWith(300);
    expect(state.thumbs.scheduleFrameStrip).toHaveBeenCalledWith(300);
  });

  it('handles keyboard shortcuts', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    const key = (init: KeyboardEventInit) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));

    key({ code: 'Space', key: ' ' });
    await flush();
    expect(video.play).toHaveBeenCalled();

    key({ key: 'ArrowRight' });
    await flush();
    expect(video.currentTime).toBeCloseTo(1, 5);

    key({ key: 'ArrowRight', altKey: true, shiftKey: true });
    await flush();
    expect(video.currentTime).toBeCloseTo(1 + 10 / 30, 5);

    key({ key: 'i' });
    await flush();
    expect(wrapper!.get('[data-testid="clip-start-label"]').text()).toBe(
      formatTimecode(video.currentTime, 30)
    );
    key({ key: 'ArrowRight' });
    await flush();
    key({ key: 'o' });
    await flush();
    expect(wrapper!.get('[data-testid="clip-end-label"]').text()).toBe(
      formatTimecode(video.currentTime, 30)
    );

    key({ key: '+' });
    await flush();
    expect(wrapper!.get('[data-testid="clip-zoom-label"]').text()).toBe('1.5×');
  });

  it('ignores shortcuts from form controls', async () => {
    const video = await mountLoaded(120);
    (video.play as ReturnType<typeof vi.fn>).mockClear();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(video.play).not.toHaveBeenCalled();
  });
});

describe('thumbnails and cleanup', () => {
  it('renders fetched thumbnails and frame strips', async () => {
    await mountLoaded(2);
    state.thumbs.thumbnails.value = ['a.png', 'b.png'];
    await flush();
    expect(wrapper!.findAll('img')).toHaveLength(2);

    state.thumbs.frameStrip.value = {
      frames: ['f1.png', 'f2.png'],
      startSec: 0,
      stepSec: 0.5
    };
    await flush();
    expect(wrapper!.findAll('[data-testid="clip-frame"]')).toHaveLength(2);
  });

  it('shows loading, refreshing and error states', async () => {
    await mountLoaded(120);
    state.thumbs.thumbsLoading.value = true;
    await flush();
    expect(wrapper!.find('.animate-pulse').exists()).toBe(true);

    state.thumbs.thumbsLoading.value = false;
    state.thumbs.thumbnails.value = ['a.png'];
    state.thumbs.thumbsRefreshing.value = true;
    await flush();
    expect(wrapper!.findAll('.animate-pulse').length).toBeGreaterThan(0);

    state.thumbs.thumbsRefreshing.value = false;
    state.thumbs.thumbnails.value = [];
    state.thumbs.thumbsError.value = 'thumb error';
    await flush();
    expect(wrapper!.text()).toContain('tools.clipThumbnailsUnavailable');
  });

  it('cleans up listeners, thumbnails and playback on unmount', async () => {
    const video = await mountLoaded(120);
    wrapper!.unmount();
    wrapper = null;

    expect(state.thumbs.cancelThumbnails).toHaveBeenCalled();
    expect(state.thumbs.cancelFrameStrip).toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalled();
  });
});

describe('edge interactions', () => {
  it('keeps the loaded video while a list export is running', async () => {
    let resolveClip!: (value: unknown) => void;
    state.clipVideo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClip = resolve;
      })
    );
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    await flush();

    const calls = state.clipVideo.mock.calls.length;
    state.invoke.mockClear();

    await wrapper!.get('[data-testid="clip-view"]').trigger('drop', { dataTransfer: {} });
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    await wrapper!.get('[aria-label="tools.remove"]').trigger('click');
    await wrapper!.get('[data-testid="clip-export-list"]').trigger('click');
    wrapper!
      .get('[data-testid="clip-marker-start"]')
      .element.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 64, clientY: 20, bubbles: true })
      );

    expect(state.clipVideo.mock.calls.length).toBe(calls);
    expect(wrapper!.findAll('[data-testid="clip-list"]')).toHaveLength(1);

    resolveClip({ canceled: true });
    await flush();
  });

  it('ignores partial progress payloads', async () => {
    let resolveClip!: (value: unknown) => void;
    state.clipVideo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClip = resolve;
      })
    );
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    await flush();
    const jobId = state.clipVideo.mock.calls[0][0].jobId;

    state.handlers['tools:progress']({ jobId, percent: -1, speed: '' });
    await flush();
    expect(wrapper!.text()).not.toContain('9x');

    resolveClip({ success: false, error: 'failed' });
    await flush();
  });

  it('runs fits and drags before metadata is available', async () => {
    state.context.value = { params: { path: 'C:\\videos\\a.mp4' } };
    mountView();
    await flush();
    stubTimeline();

    await wrapper!.get('[data-testid="clip-fit-second"]').trigger('click');
    await wrapper!.get('[data-testid="clip-fit-selection"]').trigger('click');
    await wrapper!.get('[data-testid="clip-export"]').trigger('click');
    wrapper!
      .get('[data-testid="clip-timeline"]')
      .element.dispatchEvent(
        new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true })
      );
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 10 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await flush();

    expect(state.clipVideo).not.toHaveBeenCalled();
  });

  it('clamps zoom at both limits and handles wheel directions', async () => {
    await mountLoaded(120);
    const zoom = () => wrapper!.get('[data-testid="clip-zoom-label"]').text();

    for (let i = 0; i < 16; i += 1) {
      await wrapper!.get('[data-testid="clip-zoom-in"]').trigger('click');
    }
    expect(zoom()).toBe('256×');

    await wrapper!.get('[data-testid="clip-zoom-in"]').trigger('click');
    expect(zoom()).toBe('256×');

    const scroll = wrapper!.get('[data-testid="clip-timeline-scroll"]');
    scroll.element.dispatchEvent(
      new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true })
    );
    await flush();
    expect(zoom()).toBe('256×');

    scroll.element.dispatchEvent(
      new WheelEvent('wheel', { ctrlKey: true, deltaY: 100, cancelable: true })
    );
    await flush();
    expect(zoom()).not.toBe('256×');

    scroll.element.scrollLeft = 900;
    await scroll.trigger('scroll');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', cancelable: true }));
    await flush();
    expect(zoom()).not.toBe('1×');
  });

  it('drags the end marker and ignores stray pointer moves', async () => {
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 10 }));

    const marker = wrapper!.get('[data-testid="clip-marker-end"]').element;
    marker.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 800, clientY: 20, bubbles: true })
    );
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600, clientY: 20 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await flush();

    expect(wrapper!.get('[data-testid="clip-end-label"]').text()).not.toBe(formatTimecode(120, 30));
  });

  it('ignores resize events before the timeline exists', () => {
    mountView();
    window.dispatchEvent(new Event('resize'));
    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(true);
  });

  it('ignores media shortcuts without a loaded video', async () => {
    mountView();
    await flush();
    const key = (init: KeyboardEventInit) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));

    key({ code: 'Space', key: ' ' });
    key({ key: 'ArrowRight' });
    key({ key: '+' });
    key({ key: '-' });
    key({ key: '[' });
    key({ key: ']' });
    await flush();

    expect(wrapper!.find('[data-testid="empty"]').exists()).toBe(true);
  });
});

function press(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function buttonWithText(text: string) {
  return wrapper!.findAll('button').find((button) => button.text().includes(text))!;
}

describe('clipper guards and alternate controls', () => {
  async function mountWithPendingExport() {
    let resolveClip!: (value: unknown) => void;
    state.clipVideo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClip = resolve;
      })
    );
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    press(wrapper!.get('[data-testid="clip-export"]').element);
    await flush();
    return resolveClip;
  }

  it('ignores edits while an export is running', async () => {
    const resolveClip = await mountWithPendingExport();
    const calls = state.clipVideo.mock.calls.length;

    press(buttonWithText('tools.clipReplace').element);
    await flush();
    expect(wrapper!.findAll('video')).toHaveLength(1);

    state.context.value = { params: { path: 'C:\\videos\\other.mp4' } };
    await flush();
    expect(wrapper!.get('video').attributes('src')).toBe('media://C:\\videos\\a.mp4');

    press(wrapper!.get('[data-testid="clip-add"]').element);
    press(wrapper!.get('[aria-label="tools.remove"]').element);
    press(buttonWithText('tools.clipClearList').element);
    await flush();
    expect(wrapper!.findAll('[data-testid="clip-list"]')).toHaveLength(1);

    press(wrapper!.get('[data-testid="clip-export-list"]').element);
    expect(state.clipVideo.mock.calls.length).toBe(calls);

    press(wrapper!.get('[data-testid="clip-follow"]').element);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[data-testid="clip-follow"]').attributes('aria-pressed')).toBe('false');

    resolveClip({ success: true, outputPath: 'C:/out/a.mp4' });
    await flush();
  });

  it('keeps the playhead still when follow is disabled', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-follow"]').trigger('click');
    expect(wrapper!.get('[data-testid="clip-follow"]').attributes('aria-pressed')).toBe('false');

    await wrapper!.get('[data-testid="clip-play"]').trigger('click');
    await flush();
    await timeTo(video, 100);
    expect(video.currentTime).toBe(100);
  });

  it('seeks by seconds, arrows and alternate zoom keys', async () => {
    const video = await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-snap"]').trigger('click');
    await timeTo(video, 60);

    const secondButtons = wrapper!.findAll('button').filter((button) => /1 s/.test(button.text()));
    await secondButtons[0].trigger('click');
    expect(video.currentTime).toBeCloseTo(59, 4);
    await secondButtons[1].trigger('click');
    expect(video.currentTime).toBeCloseTo(60, 4);

    const key = (init: KeyboardEventInit) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { cancelable: true, ...init }));
    key({ key: 'ArrowLeft' });
    await flush();
    expect(video.currentTime).toBeCloseTo(59, 4);

    key({ key: 'ArrowLeft', altKey: true });
    await flush();
    expect(video.currentTime).toBeCloseTo(59 - 1 / 30, 4);

    key({ key: '=' });
    await flush();
    expect(wrapper!.get('[data-testid="clip-zoom-label"]').text()).toMatch(/^1\.5/);
    key({ key: '_' });
    await flush();
    expect(wrapper!.get('[data-testid="clip-zoom-label"]').text()).toMatch(/^1(?!\.5)/);
  });

  it('ignores rejected play promises', async () => {
    const video = await mountLoaded(120);
    (video.play as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('blocked'));
    await wrapper!.get('[data-testid="clip-play"]').trigger('click');
    await flush();

    (video.play as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('blocked'));
    await wrapper!.get('[data-testid="clip-preview"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="clip-preview"]').text()).toBe('tools.clipPreview');
  });

  it('reports list progress and falls back for errors without a message', async () => {
    let resolveClip!: (value: unknown) => void;
    state.clipVideo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveClip = resolve;
      })
    );
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    press(wrapper!.get('[data-testid="clip-export-list"]').element);
    await flush();
    const jobId = state.clipVideo.mock.calls[0][0].jobId as string;

    state.handlers['tools:progress']({ jobId: 'other', percent: 10, speed: '9x' });
    state.handlers['tools:progress']({ jobId, percent: 25, speed: '4x' });
    await flush();
    expect(wrapper!.text()).toContain('4x');

    state.handlers['tools:progress']({ jobId, percent: -1, speed: '' });
    resolveClip({ success: false });
    await flush();
    expect(wrapper!.text()).toContain('tools.clipFailed');
    expect(wrapper!.get('[data-testid="clip-job"]').attributes('data-status')).toBe('error');
  });

  it('opens a finished list output', async () => {
    await mountLoaded(120);
    await wrapper!.get('[data-testid="clip-add"]').trigger('click');
    press(wrapper!.get('[data-testid="clip-export-list"]').element);
    await flush();

    state.invoke.mockClear();
    press(wrapper!.get('[aria-label="tools.openOutput"]').element);
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'C:/out/a.mp4');
  });

  it('guards export clicks before metadata and sets the clip mode', async () => {
    state.context.value = { params: { path: 'C:\\videos\\a.mp4' } };
    mountView();
    await flush();

    press(wrapper!.get('[data-testid="clip-export"]').element);
    await flush();
    expect(state.clipVideo).not.toHaveBeenCalled();

    select('clip-mode').vm.$emit('update:modelValue', 'copy');
    await flush();
    expect(select('clip-mode').props('modelValue')).toBe('copy');
  });
});

describe('clipper deferred work', () => {
  it('resets the range before metadata arrives', async () => {
    state.context.value = { params: { path: 'C:\\videos\\a.mp4' } };
    mountView();
    await flush();
    stubTimeline();

    press(wrapper!.get('[aria-label="tools.clipReset"]').element);
    await flush();
    expect(wrapper!.get('[data-testid="clip-start-label"]').text()).toBe(formatTimecode(0, 30));
  });

  it('skips deferred timeline work after unmount', async () => {
    await mountLoaded(120);
    press(wrapper!.get('[data-testid="clip-fit"]').element);
    press(wrapper!.get('[data-testid="clip-fit-selection"]').element);
    press(wrapper!.get('[data-testid="clip-fit-second"]').element);
    wrapper!.unmount();
    wrapper = null;

    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    await nextTick();
    expect(document.body.querySelector('video')).toBeNull();
  });
});

describe('clipper metadata fallback', () => {
  it('uses zero duration for unusable metadata', async () => {
    state.context.value = { params: { path: 'C:\\videos\\a.mp4' } };
    mountView();
    await flush();
    const video = wrapper!.get('video').element as HTMLVideoElement;
    video.dispatchEvent(new Event('loadedmetadata'));
    await flush();

    expect(wrapper!.get('[data-testid="clip-export"]').attributes('disabled')).toBeDefined();
    expect(wrapper!.get('[data-testid="clip-add"]').attributes('disabled')).toBeDefined();
  });
});

describe('VideoClipperToolView guards', () => {
  type Vm = Record<string, any>;

  it('ignores media actions before a video is loaded', async () => {
    mountView();
    const vm = wrapper!.vm as Vm;

    expect(() => {
      vm.onTimeUpdate();
      vm.clampRange();
      vm.fitSelection();
      vm.fitSecond();
      vm.keepPlayheadVisible();
      vm.onPointerMove(new MouseEvent('pointermove'));
      vm.applyDrag(new MouseEvent('pointermove'));
      vm.openPath();
    }).not.toThrow();
    await vm.previewClip();

    expect(vm.ratioFromEvent(new MouseEvent('pointermove'))).toBeNull();
    expect(state.clipVideo).not.toHaveBeenCalled();
  });

  it('skips picking while busy', async () => {
    mountView();
    const vm = wrapper!.vm as Vm;
    vm.busy = true;
    state.invoke.mockClear();

    await vm.pickVideo();

    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('rejects clips shorter than one frame', async () => {
    mountView();
    const vm = wrapper!.vm as Vm;
    vm.duration = 10;
    vm.startSec = 5;
    vm.endSec = 5;

    vm.addClip();
    expect(vm.clips).toHaveLength(0);

    vm.videoPath = 'C:\\videos\\a.mp4';
    vm.duration = 0.06;
    vm.startSec = 0.02;
    vm.endSec = 0.07;
    await vm.startClip();

    expect(vm.error).toBe('tools.clipInvalidRange');
    expect(state.clipVideo).not.toHaveBeenCalled();
  });

  it('ignores cancelling without an active job', () => {
    mountView();
    const vm = wrapper!.vm as Vm;

    vm.cancelClip();

    expect(state.cancelVideoClip).not.toHaveBeenCalled();
  });

  it('formats fractional zoom and fps labels', () => {
    mountView();
    const vm = wrapper!.vm as Vm;
    vm.timelineZoom = 1.25;
    vm.videoFps = 29.97;

    expect(vm.zoomLabel).toBe('1.3');
    expect(vm.fpsLabel).toBe('29.97');
  });

  it('falls back to the maximum zoom level', () => {
    mountView();
    const vm = wrapper!.vm as Vm;
    vm.timelineZoom = 1000;

    vm.zoomBy(1);

    // No timeline elements yet, so applyZoom bails out without changing the value.
    expect(vm.timelineZoom).toBe(1000);
  });
});

describe('VideoClipperToolView option callbacks', () => {
  it('exposes the frame strip activity flag', () => {
    mountView();

    expect(state.thumbsOptions.frameStripActive()).toBe(false);
  });

  it('formats an integer zoom label and clamps a zero end time', () => {
    mountView();
    const vm = wrapper!.vm as Record<string, any>;
    vm.timelineZoom = 1;
    vm.duration = 10;
    vm.startSec = 0;
    vm.endSec = 0;

    vm.clampRange();

    expect(vm.zoomLabel).toBe('1');
    expect(vm.endSec).toBe(0.05);
  });
});
