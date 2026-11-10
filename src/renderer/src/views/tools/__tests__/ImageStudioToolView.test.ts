import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import ImageStudioToolView from '../ImageStudioToolView.vue';

const state = vi.hoisted(() => ({
  context: null as any,
  dropped: [] as string[],
  imageRead: vi.fn(),
  imageSave: vi.fn(),
  imageEstimate: vi.fn(),
  writeCover: vi.fn(),
  invoke: vi.fn(),
  ctx: null as any,
  blob: null as any,
  toBlob: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useToolBridge', () => ({
  useToolBridge: () => ({ context: state.context })
}));
vi.mock('@renderer/utils/fileDrag', () => ({
  getDroppedFilePaths: () => state.dropped
}));
vi.mock('@shared/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

const SliderStub = {
  name: 'Slider',
  props: ['modelValue', 'label', 'min', 'max', 'valueText'],
  emits: ['update:modelValue'],
  template: '<div v-bind="$attrs" />'
};
const NumberFieldStub = {
  name: 'NumberField',
  props: ['modelValue', 'label', 'min', 'max', 'size'],
  emits: ['update:modelValue'],
  template: '<div v-bind="$attrs" />'
};
const SelectStub = {
  name: 'Select',
  props: ['modelValue', 'size'],
  emits: ['update:modelValue'],
  template: '<div v-bind="$attrs"><slot /></div>'
};
const PathInputStub = {
  name: 'PathInput',
  props: ['modelValue', 'readonly', 'label', 'placeholder'],
  emits: ['update:modelValue', 'browse'],
  template: '<div v-bind="$attrs">{{ modelValue }}</div>'
};
const ColorInputStub = {
  name: 'ColorInput',
  props: ['modelValue', 'label'],
  emits: ['update:modelValue'],
  template: '<div v-bind="$attrs" />'
};
const ButtonStub = {
  name: 'Button',
  props: ['variant', 'disabled', 'loading'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot name="leading" /><slot /></button>'
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

function fakeContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    clip: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4)
    })),
    putImageData: vi.fn(),
    imageSmoothingEnabled: true,
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    filter: 'none',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    font: '',
    textBaseline: 'alphabetic'
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  await nextTick();
}

const LOAD_RESULT = {
  success: true,
  dataUrl: 'data:image/png;base64,AAAA',
  width: 640,
  height: 480,
  bytes: 2048,
  format: 'png'
};

function mountView() {
  wrapper = mount(ImageStudioToolView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ToolWindowShell: ShellStub,
        EmptyState: EmptyStub,
        Spinner: SpinnerStub,
        Button: ButtonStub,
        ColorInput: ColorInputStub,
        NumberField: NumberFieldStub,
        PathInput: PathInputStub,
        Select: SelectStub,
        Slider: SliderStub
      }
    }
  });
  return wrapper;
}

async function mountLoaded() {
  state.context.value = { params: { path: 'C:\\pics\\a.png' } };
  state.imageRead.mockResolvedValue(LOAD_RESULT);
  mountView();
  await flush();
  return wrapper!;
}

function canvasEl(): HTMLCanvasElement {
  return wrapper!.get('[data-testid="image-studio-canvas"]').element as HTMLCanvasElement;
}

function cropAttr(): string {
  return canvasEl().getAttribute('data-crop') ?? '';
}

function outputAttr(): string {
  return canvasEl().getAttribute('data-output') ?? '';
}

function stubRect(): void {
  const canvas = canvasEl();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 720,
    height: 540,
    right: 720,
    bottom: 540,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect);
  canvas.setPointerCapture = vi.fn();
}

async function pointer(type: string, x: number, y: number): Promise<void> {
  canvasEl().dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })
  );
  await nextTick();
}

function slider(label: string) {
  return wrapper!
    .findAllComponents(SliderStub)
    .find((component) => component.props('label') === label)!;
}

function pathInput(label: string) {
  return wrapper!
    .findAllComponents(PathInputStub)
    .find((component) => component.props('label') === label)!;
}

function getContextMock() {
  return HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 640;
  height = 480;
  private currentSrc = '';
  set src(value: string) {
    this.currentSrc = value;
    queueMicrotask(() => this.onload?.());
  }
  get src(): string {
    return this.currentSrc;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Image', FakeImage);
  state.context = ref({ params: {} });
  state.dropped = [];
  state.imageRead.mockReset();
  state.imageRead.mockResolvedValue(LOAD_RESULT);
  state.imageSave.mockReset();
  state.imageSave.mockResolvedValue({
    success: true,
    outputPath: 'D:/out/a-edited.webp',
    bytes: 1234
  });
  state.imageEstimate.mockReset();
  state.imageEstimate.mockResolvedValue({ success: true, bytes: 1234 });
  state.writeCover.mockReset();
  state.writeCover.mockResolvedValue({ success: true });
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ canceled: true, filePaths: [] });
  state.ctx = fakeContext();
  state.blob = {
    arrayBuffer: async () => new Uint8Array([1, 2]).buffer
  };
  state.toBlob = vi.fn((cb: BlobCallback) => cb(state.blob as Blob));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => state.ctx as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
    state.toBlob(cb)
  );
  let uuid = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `uuid-${++uuid}`
  });
  (window as { api?: unknown }).api = {
    imageRead: state.imageRead,
    imageSave: state.imageSave,
    imageEstimate: state.imageEstimate,
    writeCover: state.writeCover,
    invoke: state.invoke
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('empty state and loading', () => {
  it('renders the empty state until an image is loaded', () => {
    mountView();

    expect(wrapper!.findAll('[data-testid="image-studio-view"]')).toHaveLength(1);
    expect(wrapper!.get('[data-testid="empty"]').text()).toBe('tools.imageStudioEmpty');
    expect(wrapper!.get('[data-testid="image-studio-open"]').text()).toBe('tools.imageStudioOpen');
  });

  it('opens the dialog and ignores cancellation', async () => {
    mountView();
    await wrapper!.get('[data-testid="image-studio-open"]').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('dialog:openImage');
    expect(state.imageRead).not.toHaveBeenCalled();
  });

  it('loads a picked image and reveals the editor', async () => {
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\pics\\a.png'] });
    mountView();
    await wrapper!.get('[data-testid="image-studio-open"]').trigger('click');
    await flush();

    expect(state.imageRead).toHaveBeenCalledWith('C:\\pics\\a.png');
    expect(canvasEl().getAttribute('data-image')).toBe('640,480');
    expect(canvasEl().getAttribute('data-crop')).toBe('0,0,640,480');
    expect(outputAttr()).toBe('640,480');
    expect(wrapper!.text()).toContain('a.png');
    expect(wrapper!.text()).toContain('640×480 · png');
    expect(wrapper!.text()).toContain('2.0 KB');
    expect(pathInput('tools.imageStudioPath').props('modelValue')).toBe('C:/pics/a-edited.webp');
  });

  it('shows a spinner while the image is loading', async () => {
    let resolveRead!: (value: unknown) => void;
    state.imageRead.mockReturnValueOnce(new Promise((resolve) => (resolveRead = resolve)));
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\pics\\a.png'] });
    mountView();

    await wrapper!.get('[data-testid="image-studio-open"]').trigger('click');
    await flush();
    expect(wrapper!.find('[data-testid="spinner"]').exists()).toBe(true);

    resolveRead(LOAD_RESULT);
    await flush();
    expect(wrapper!.findAll('[data-testid="image-studio-canvas"]')).toHaveLength(1);
    expect(wrapper!.find('[data-testid="spinner"]').exists()).toBe(false);
  });

  it('keeps the empty state when loading fails', async () => {
    state.imageRead.mockResolvedValueOnce({ success: false, error: 'bad file' });
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\pics\\a.png'] });
    mountView();
    await wrapper!.get('[data-testid="image-studio-open"]').trigger('click');
    await flush();

    expect(wrapper!.findAll('[data-testid="image-studio-canvas"]')).toHaveLength(0);
    expect(wrapper!.findAll('[data-testid="image-studio-open"]')).toHaveLength(1);
  });

  it('shows a load error thrown by the bridge', async () => {
    state.imageRead.mockRejectedValueOnce(new Error('bridge down'));
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\pics\\a.png'] });
    mountView();
    await wrapper!.get('[data-testid="image-studio-open"]').trigger('click');
    await flush();

    expect(wrapper!.find('[data-testid="image-studio-canvas"]').exists()).toBe(false);
  });

  it('keeps the empty state when the image cannot be decoded', async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailingImage);
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\pics\\a.png'] });
    mountView();
    await wrapper!.get('[data-testid="image-studio-open"]').trigger('click');
    await flush();

    expect(state.imageRead).toHaveBeenCalledWith('C:\\pics\\a.png');
    expect(wrapper!.find('[data-testid="image-studio-canvas"]').exists()).toBe(false);
  });
});

describe('canvas guards', () => {
  it('skips preview rendering without a 2d context', async () => {
    await mountLoaded();
    getContextMock().mockImplementationOnce(() => null);

    slider('tools.imageStudioBrightness').vm.$emit('update:modelValue', 130);
    await flush();

    expect(wrapper!.find('[data-testid="image-studio-canvas"]').exists()).toBe(true);
  });

  it('returns the unscaled canvas when its context is missing', async () => {
    await mountLoaded();
    getContextMock()
      .mockImplementationOnce(() => state.ctx)
      .mockImplementationOnce(() => null);

    slider('tools.imageStudioBrightness').vm.$emit('update:modelValue', 130);
    await flush();

    expect(wrapper!.find('[data-testid="image-studio-canvas"]').exists()).toBe(true);
  });

  it('skips sharpening without a context or readable pixels', async () => {
    await mountLoaded();
    getContextMock()
      .mockImplementationOnce(() => state.ctx)
      .mockImplementationOnce(() => state.ctx)
      .mockImplementationOnce(() => null);
    slider('tools.imageStudioSharpen').vm.$emit('update:modelValue', 50);
    await flush();

    state.ctx.putImageData.mockClear();
    state.ctx.getImageData.mockImplementationOnce(() => {
      throw new Error('tainted');
    });
    slider('tools.imageStudioSharpen').vm.$emit('update:modelValue', 60);
    await flush();

    expect(state.ctx.putImageData).not.toHaveBeenCalled();
  });

  it('skips sharpening tiny canvases', async () => {
    state.context.value = { params: { path: 'C:\\pics\\tiny.png' } };
    state.imageRead.mockResolvedValue({
      success: true,
      dataUrl: 'data:image/png;base64,AAAA',
      width: 2,
      height: 2,
      bytes: 10,
      format: 'png'
    });
    mountView();
    await flush();

    slider('tools.imageStudioSharpen').vm.$emit('update:modelValue', 50);
    await flush();

    expect(state.ctx.putImageData).not.toHaveBeenCalled();
  });

  it('skips export and estimates without a 2d context', async () => {
    await mountLoaded();
    state.imageEstimate.mockClear();
    getContextMock().mockImplementationOnce(() => null);

    await wrapper!.get('[data-testid="image-studio-estimate"]').trigger('click');
    await flush();

    expect(state.imageEstimate).not.toHaveBeenCalled();
  });
});

describe('drop and context', () => {
  it('loads the first dropped image file', async () => {
    state.dropped = ['C:\\docs\\note.txt', 'C:\\pics\\drop.png'];
    mountView();
    await wrapper!.get('[data-testid="image-studio-view"]').trigger('drop', {
      dataTransfer: {}
    });
    await flush();

    expect(state.imageRead).toHaveBeenCalledWith('C:\\pics\\drop.png');
  });

  it('ignores drops without an image', async () => {
    state.dropped = ['C:\\docs\\note.txt'];
    mountView();
    await wrapper!.get('[data-testid="image-studio-view"]').trigger('drop', {
      dataTransfer: {}
    });
    await flush();
    expect(state.imageRead).not.toHaveBeenCalled();
  });

  it('loads images passed through the tool context', async () => {
    state.context.value = { params: { path: 'C:\\ctx\\first.png' } };
    mountView();
    await flush();
    expect(state.imageRead).toHaveBeenCalledWith('C:\\ctx\\first.png');

    state.context.value = { params: { paths: ['C:\\ctx\\second.png'] } };
    await flush();
    expect(state.imageRead).toHaveBeenLastCalledWith('C:\\ctx\\second.png');

    state.context.value = { params: { path: 'C:\\ctx\\note.txt' } };
    await flush();
    expect(state.imageRead).toHaveBeenCalledTimes(2);
  });
});

describe('crop and orientation', () => {
  beforeEach(async () => {
    await mountLoaded();
    stubRect();
  });

  it('applies aspect presets', async () => {
    await wrapper!.get('[data-testid="image-studio-aspect-1:1"]').trigger('click');
    expect(cropAttr()).toBe('80,0,480,480');
    expect(outputAttr()).toBe('480,480');
    expect(wrapper!.text()).toContain('tools.imageStudioCrop: 480×480');

    await wrapper!.get('[data-testid="image-studio-aspect-16:9"]').trigger('click');
    expect(cropAttr()).toBe('0,60,640,360');
    expect(outputAttr()).toBe('640,360');

    await wrapper!.get('[data-testid="image-studio-aspect-4:3"]').trigger('click');
    expect(cropAttr()).toBe('0,0,640,480');

    await wrapper!.get('[data-testid="image-studio-aspect-free"]').trigger('click');
    expect(cropAttr()).toBe('0,0,640,480');
  });

  it('rotates the image and resets crop and annotations', async () => {
    await wrapper!.get('[data-testid="image-studio-tool-rect"]').trigger('click');
    await pointer('pointerdown', 200, 150);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');

    await wrapper!.get('[data-testid="image-studio-rotate-right"]').trigger('click');
    expect(canvasEl().getAttribute('data-image')).toBe('480,640');
    expect(cropAttr()).toBe('0,0,480,640');
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('0');

    for (let i = 0; i < 3; i += 1) {
      await wrapper!.get('[data-testid="image-studio-rotate-right"]').trigger('click');
    }
    expect(canvasEl().getAttribute('data-image')).toBe('640,480');
  });

  it('rotates left and flips both axes', async () => {
    await wrapper!.get('[data-testid="image-studio-rotate-left"]').trigger('click');
    expect(canvasEl().getAttribute('data-image')).toBe('480,640');
    await wrapper!.get('[data-testid="image-studio-rotate-right"]').trigger('click');
    expect(canvasEl().getAttribute('data-image')).toBe('640,480');

    await wrapper!.get('[data-testid="image-studio-flip-h"]').trigger('click');
    await wrapper!.get('[data-testid="image-studio-flip-v"]').trigger('click');
    expect(wrapper!.find('[data-testid="image-studio-canvas"]').exists()).toBe(true);
  });

  it('draws a new crop rectangle from outside the current crop', async () => {
    await wrapper!.get('[data-testid="image-studio-aspect-1:1"]').trigger('click');
    const before = cropAttr();

    await pointer('pointerdown', 10, 10);
    await pointer('pointermove', 220, 160);
    await pointer('pointerup', 220, 160);

    expect(cropAttr()).not.toBe(before);
    expect(canvasEl().getAttribute('data-crop')).toMatch(/^\d+,\d+,\d+,\d+$/);
  });

  it('moves and resizes the crop with handles', async () => {
    await wrapper!.get('[data-testid="image-studio-aspect-1:1"]').trigger('click');
    const before = cropAttr();

    await pointer('pointerdown', 360, 270);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);
    expect(cropAttr()).not.toBe(before);

    const resized = cropAttr();
    await pointer('pointerdown', 90, 0);
    await pointer('pointermove', 140, 50);
    await pointer('pointerup', 140, 50);
    expect(cropAttr()).not.toBe(resized);
  });

  it('reverts a too-small crop to the previous rectangle', async () => {
    await wrapper!.get('[data-testid="image-studio-aspect-1:1"]').trigger('click');
    const before = cropAttr();

    await pointer('pointerdown', 10, 10);
    await pointer('pointerup', 10, 10);
    expect(cropAttr()).toBe(before);
  });

  it('resizes the crop from a corner handle', async () => {
    await wrapper!.get('[data-testid="image-studio-aspect-1:1"]').trigger('click');

    await pointer('pointerdown', 90, 0);
    await pointer('pointermove', 130, 40);
    await pointer('pointerup', 130, 40);

    const [x, y, w, h] = cropAttr().split(',').map(Number);
    expect(x).toBeGreaterThan(80);
    expect(y).toBeGreaterThan(0);
    expect(w).toBeLessThan(480);
    expect(h).toBeLessThan(480);
  });

  it('forces the aspect ratio while drawing', async () => {
    await wrapper!.get('[data-testid="image-studio-aspect-16:9"]').trigger('click');
    await pointer('pointerdown', 10, 10);
    await pointer('pointermove', 400, 150);
    await pointer('pointerup', 400, 150);

    const [, , w, h] = cropAttr().split(',').map(Number);
    expect(w / h).toBeCloseTo(16 / 9, 1);
  });

  it('updates the cursor for crop handles and annotation tools', async () => {
    await pointer('pointermove', 0, 0);
    await nextTick();
    expect(canvasEl().style.cursor).toBe('nwse-resize');

    await wrapper!.get('[data-testid="image-studio-tool-rect"]').trigger('click');
    await pointer('pointermove', 300, 300);
    await nextTick();
    expect(canvasEl().style.cursor).toBe('crosshair');
  });
});

describe('adjustments and output', () => {
  beforeEach(async () => {
    await mountLoaded();
  });

  it('updates sliders and estimates the size after a debounce', async () => {
    slider('tools.imageStudioBrightness').vm.$emit('update:modelValue', 130);
    await flush();
    expect(wrapper!.text()).toContain('130');

    expect(state.imageEstimate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    await flush();
    expect(state.imageEstimate).toHaveBeenCalledWith({
      png: [1, 2],
      format: 'webp',
      quality: 85
    });
  });

  it('rewrites the output extension and hides quality for PNG', async () => {
    const select = wrapper!.findComponent(SelectStub);
    select.vm.$emit('update:modelValue', 'jpeg');
    await flush();
    expect(pathInput('tools.imageStudioPath').props('modelValue')).toMatch(/\.jpg$/);
    expect(slider('tools.imageStudioQuality').exists()).toBe(true);

    select.vm.$emit('update:modelValue', 'png');
    await flush();
    expect(
      wrapper!
        .findAllComponents(SliderStub)
        .some((s) => s.props('label') === 'tools.imageStudioQuality')
    ).toBe(false);
  });

  it('updates output dimensions from the width field', async () => {
    const field = wrapper!.findComponent(NumberFieldStub);
    field.vm.$emit('update:modelValue', 320);
    await flush();

    expect(outputAttr()).toBe('320,240');
    expect(wrapper!.text()).toContain('→ 240 px');
  });

  it('applies temperature and sharpening', async () => {
    slider('tools.imageStudioTemperature').vm.$emit('update:modelValue', 60);
    slider('tools.imageStudioSharpen').vm.$emit('update:modelValue', 50);
    await flush();
    await vi.advanceTimersByTimeAsync(600);
    await flush();

    expect(state.ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(state.ctx.putImageData).toHaveBeenCalled();
    expect(state.imageEstimate).toHaveBeenCalled();
  });

  it('updates quality and the cover path', async () => {
    slider('tools.imageStudioQuality').vm.$emit('update:modelValue', 60);
    pathInput('tools.imageStudioCoverPick').vm.$emit('update:modelValue', 'C:/music/a.mp3');
    await flush();

    expect(wrapper!.text()).toContain('60');
    expect(pathInput('tools.imageStudioCoverPick').props('modelValue')).toBe('C:/music/a.mp3');
  });

  it('ignores color changes without a selection', async () => {
    wrapper!.findComponent(ColorInputStub).vm.$emit('update:modelValue', '#ff0000');
    await flush();

    expect(canvasEl().getAttribute('data-selected-width')).toBe('');
  });

  it('estimates on demand and handles failures', async () => {
    await wrapper!.get('[data-testid="image-studio-estimate"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('1.2 KB');

    state.imageEstimate.mockResolvedValueOnce({ success: false });
    await wrapper!.get('[data-testid="image-studio-estimate"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('tools.imageStudioEstimated: —');

    state.imageEstimate.mockRejectedValueOnce(new Error('nope'));
    await wrapper!.get('[data-testid="image-studio-estimate"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('tools.imageStudioEstimated: —');
  });

  it('picks the output directory', async () => {
    state.invoke.mockResolvedValueOnce(['D:\\out']);
    pathInput('tools.imageStudioPath').vm.$emit('browse');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('dialog:openFolder');
    expect(pathInput('tools.imageStudioPath').props('modelValue')).toBe('D:/out/a-edited.webp');
  });

  it('uses the default filename when the output path is empty', async () => {
    pathInput('tools.imageStudioPath').vm.$emit('update:modelValue', '');
    await flush();
    state.invoke.mockResolvedValueOnce(['D:\\out']);
    pathInput('tools.imageStudioPath').vm.$emit('browse');
    await flush();

    expect(pathInput('tools.imageStudioPath').props('modelValue')).toBe('D:/out/edited.webp');
  });

  it('ignores an empty folder selection', async () => {
    state.invoke.mockResolvedValueOnce([]);
    pathInput('tools.imageStudioPath').vm.$emit('browse');
    await flush();
    expect(pathInput('tools.imageStudioPath').props('modelValue')).toBe('C:/pics/a-edited.webp');
  });
});

describe('saving', () => {
  beforeEach(async () => {
    await mountLoaded();
  });

  it('saves the canvas and shows the result', async () => {
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();

    expect(state.imageSave).toHaveBeenCalledWith({
      png: [1, 2],
      outputPath: 'C:/pics/a-edited.webp',
      format: 'webp',
      quality: 85
    });
    expect(wrapper!.get('[data-testid="image-studio-saved"]').text()).toContain(
      'tools.imageStudioSaved'
    );
    expect(wrapper!.text()).toContain('tools.imageStudioSaved');
  });

  it('reports save failures and thrown errors', async () => {
    state.imageSave.mockResolvedValueOnce({ success: false, error: 'disk full' });
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('disk full');

    state.imageSave.mockResolvedValueOnce({ success: false });
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('tools.imageStudioSaveFailed');

    state.imageSave.mockRejectedValueOnce(new Error('crash'));
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('crash');
  });

  it('reports PNG conversion failures', async () => {
    state.toBlob.mockImplementationOnce((cb: BlobCallback) => cb(null));
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('PNG export failed');
    expect(state.imageSave).not.toHaveBeenCalled();
  });

  it('disables the save button while saving and without a path', async () => {
    let resolveSave!: (value: unknown) => void;
    state.imageSave.mockReturnValueOnce(new Promise((resolve) => (resolveSave = resolve)));
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="image-studio-save"]').attributes('disabled')).toBeDefined();

    resolveSave({ success: true });
    await flush();
    expect(
      wrapper!.get('[data-testid="image-studio-save"]').attributes('disabled')
    ).toBeUndefined();

    pathInput('tools.imageStudioPath').vm.$emit('update:modelValue', '');
    await flush();
    expect(wrapper!.get('[data-testid="image-studio-save"]').attributes('disabled')).toBeDefined();
  });

  it('does nothing when there is no exportable canvas', async () => {
    wrapper!.findComponent(NumberFieldStub).vm.$emit('update:modelValue', 0);
    await flush();
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    expect(state.imageSave).not.toHaveBeenCalled();
  });
});

describe('cover audio', () => {
  beforeEach(async () => {
    await mountLoaded();
  });

  it('picks and embeds the saved image as a cover', async () => {
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\music\\a.mp3'] });
    pathInput('tools.imageStudioCoverPick').vm.$emit('browse');
    await flush();
    expect(pathInput('tools.imageStudioCoverPick').props('modelValue')).toBe('C:\\music\\a.mp3');

    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    await wrapper!.get('[data-testid="image-studio-cover-set"]').trigger('click');
    await flush();

    expect(state.writeCover).toHaveBeenCalledWith('C:\\music\\a.mp3', 'D:/out/a-edited.webp');
    expect(wrapper!.text()).toContain('tools.imageStudioCoverSet');
  });

  it('reports cover failures and enforces the guard', async () => {
    expect(
      wrapper!.get('[data-testid="image-studio-cover-set"]').attributes('disabled')
    ).toBeDefined();

    const guard = wrapper!
      .findAllComponents(ButtonStub)
      .find((component) => component.attributes('data-testid') === 'image-studio-cover-set')!;
    guard.vm.$emit('click');
    await flush();
    expect(state.writeCover).not.toHaveBeenCalled();

    state.writeCover.mockResolvedValueOnce({ success: false, error: 'no cover support' });
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\music\\a.mp3'] });
    pathInput('tools.imageStudioCoverPick').vm.$emit('browse');
    await wrapper!.get('[data-testid="image-studio-save"]').trigger('click');
    await flush();
    await wrapper!.get('[data-testid="image-studio-cover-set"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('no cover support');

    state.writeCover.mockResolvedValueOnce({ success: false });
    await wrapper!.get('[data-testid="image-studio-cover-set"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('tools.imageStudioCoverFailed');
  });

  it('ignores a cancelled audio picker', async () => {
    state.invoke.mockResolvedValueOnce({ canceled: true, filePaths: ['C:\\music\\a.mp3'] });
    pathInput('tools.imageStudioCoverPick').vm.$emit('browse');
    await flush();
    expect(pathInput('tools.imageStudioCoverPick').props('modelValue')).toBe('');
  });
});

describe('annotations', () => {
  beforeEach(async () => {
    await mountLoaded();
    stubRect();
  });

  async function selectTool(tool: string): Promise<void> {
    await wrapper!.get(`[data-testid="image-studio-tool-${tool}"]`).trigger('click');
  }

  it('draws, selects and deletes a rectangle', async () => {
    await selectTool('rect');
    expect(wrapper!.get('[data-testid="image-studio-tool-rect"]').classes()).toContain(
      'border-primary'
    );
    await pointer('pointerdown', 200, 150);
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);

    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');
    expect(canvasEl().getAttribute('data-selected-width')).toBe('8');

    await pointer('pointerdown', 300, 225);
    await pointer('pointerup', 300, 225);
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');

    await wrapper!.get('[data-testid="image-studio-delete"]').trigger('click');
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('0');
  });

  it('drops zero-size shapes but keeps text clicks', async () => {
    await selectTool('arrow');
    await pointer('pointerdown', 200, 150);
    await pointer('pointerup', 200, 150);
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('0');

    await selectTool('text');
    const input = wrapper!.get('input[type="text"]');
    (input.element as HTMLInputElement).value = 'Hello';
    await input.trigger('input');
    await pointer('pointerdown', 200, 150);
    await pointer('pointerup', 200, 150);
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');
  });

  it('ignores text clicks without text', async () => {
    await selectTool('text');
    await pointer('pointerdown', 200, 150);
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('0');
  });

  it('draws blur and pixelate regions', async () => {
    await selectTool('blur');
    await pointer('pointerdown', 200, 150);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);

    await selectTool('pixelate');
    await pointer('pointerdown', 100, 100);
    await pointer('pointermove', 300, 250);
    await pointer('pointerup', 300, 250);

    expect(canvasEl().getAttribute('data-annotation-count')).toBe('2');
    expect(state.ctx.drawImage).toHaveBeenCalled();
  });

  it('updates color and stroke width of the selected annotation', async () => {
    await selectTool('rect');
    await pointer('pointerdown', 200, 150);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);

    wrapper!.findComponent(ColorInputStub).vm.$emit('update:modelValue', '#00ff00');
    await flush();
    slider('tools.imageStudioStroke').vm.$emit('update:modelValue', 12);
    await flush();

    expect(canvasEl().getAttribute('data-selected-width')).toBe('12');
  });

  it('undoes and clears annotations', async () => {
    await selectTool('rect');
    await pointer('pointerdown', 200, 150);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);
    await pointer('pointerdown', 100, 100);
    await pointer('pointermove', 250, 200);
    await pointer('pointerup', 250, 200);
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('2');

    const undo = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('tools.imageStudioUndo'))!;
    await undo.trigger('click');
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');

    const clear = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('tools.imageStudioClear'))!;
    await clear.trigger('click');
    expect(canvasEl().getAttribute('data-annotation-count')).toBe('0');
  });

  it('does nothing when deleting without a selection', async () => {
    const button = wrapper!.get('[data-testid="image-studio-delete"]');
    expect(button.attributes('disabled')).toBeDefined();

    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(canvasEl().getAttribute('data-annotation-count')).toBe('0');
  });

  it('renders annotations into the export canvas', async () => {
    await selectTool('rect');
    await pointer('pointerdown', 200, 150);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);
    state.imageEstimate.mockClear();

    await wrapper!.get('[data-testid="image-studio-estimate"]').trigger('click');
    await flush();

    expect(state.imageEstimate).toHaveBeenCalled();
    expect(state.ctx.strokeRect).toHaveBeenCalled();
  });

  it('skips blur scratch rendering without a context', async () => {
    await selectTool('blur');
    await pointer('pointerdown', 200, 150);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);

    getContextMock()
      .mockImplementationOnce(() => state.ctx)
      .mockImplementationOnce(() => null);
    wrapper!.findComponent(ColorInputStub).vm.$emit('update:modelValue', '#00ff00');
    await flush();

    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');
  });

  it('skips pixelate scratch rendering without a context', async () => {
    await selectTool('pixelate');
    await pointer('pointerdown', 200, 150);
    await pointer('pointermove', 400, 300);
    await pointer('pointerup', 400, 300);

    getContextMock()
      .mockImplementationOnce(() => state.ctx)
      .mockImplementationOnce(() => state.ctx)
      .mockImplementationOnce(() => null);
    wrapper!.findComponent(ColorInputStub).vm.$emit('update:modelValue', '#00ff00');
    await flush();

    expect(canvasEl().getAttribute('data-annotation-count')).toBe('1');
  });
});

describe('estimates and cleanup', () => {
  it('clears the pending estimate timer on unmount', async () => {
    await mountLoaded();
    slider('tools.imageStudioBrightness').vm.$emit('update:modelValue', 120);
    await flush();
    state.imageEstimate.mockClear();

    wrapper!.unmount();
    wrapper = null;
    await vi.advanceTimersByTimeAsync(600);
    expect(state.imageEstimate).not.toHaveBeenCalled();
  });
});
