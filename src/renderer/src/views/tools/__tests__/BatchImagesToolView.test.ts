import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import BatchImagesToolView from '../BatchImagesToolView.vue';

const state = vi.hoisted(() => ({
  context: null as any,
  filesForTool: vi.fn((_tool: string, paths: string[]) => paths),
  toolContextPaths: vi.fn((ctx: { paths?: string[] } | null) => ctx?.paths ?? []),
  dropped: vi.fn((): string[] => []),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  batchConvertImages: vi.fn(),
  cancelBatchImages: vi.fn(async () => true),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useToolBridge', () => ({
  useToolBridge: () => ({ context: state.context })
}));
vi.mock('@renderer/utils/fileDrag', () => ({ getDroppedFilePaths: state.dropped }));
vi.mock('@shared/tool-input', () => ({
  filesForTool: state.filesForTool,
  toolContextPaths: state.toolContextPaths
}));

const ToolWindowShellStub = {
  props: ['title', 'status'],
  template: '<div><slot /><slot name="footer" /></div>'
};
const ButtonStub = { template: '<button><slot /><slot name="leading" /></button>' };
const IconButtonStub = { template: '<button><slot /></button>' };
const SelectStub = {
  props: ['modelValue', 'disabled', 'size'],
  emits: ['update:modelValue'],
  template: '<select><slot /></select>'
};
const NumberFieldStub = {
  props: ['modelValue', 'size', 'min', 'max', 'label', 'unit'],
  emits: ['update:modelValue'],
  template: '<input type="number" />'
};
const InputStub = {
  name: 'Input',
  props: ['modelValue', 'size', 'disabled', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input />'
};
const SliderStub = {
  name: 'Slider',
  props: ['modelValue', 'min', 'max', 'label', 'valueText'],
  emits: ['update:modelValue'],
  template: '<div />'
};

let wrapper: VueWrapper | null = null;

function mountBatch() {
  wrapper = mount(BatchImagesToolView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ToolWindowShell: ToolWindowShellStub,
        Button: ButtonStub,
        IconButton: IconButtonStub,
        Select: SelectStub,
        NumberField: NumberFieldStub,
        Input: InputStub,
        Slider: SliderStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.context = ref({ paths: [] as string[] });
  state.filesForTool.mockImplementation((_tool: string, paths: string[]) =>
    paths.filter((path) => /\.(jpg|jpeg|png|webp|bmp|gif|tiff|avif)$/i.test(path))
  );
  state.toolContextPaths.mockClear();
  state.dropped.mockReset();
  state.dropped.mockReturnValue([]);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ canceled: true, filePaths: [] });
  state.off.mockClear();
  state.on.mockReset();
  state.on.mockReturnValue(state.off);
  state.batchConvertImages.mockReset();
  state.batchConvertImages.mockResolvedValue({ success: true });
  state.cancelBatchImages.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    on: state.on,
    batchConvertImages: state.batchConvertImages,
    cancelBatchImages: state.cancelBatchImages
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('file list', () => {
  it('adopts image paths from the tool context', async () => {
    state.context.value = { paths: ['C:\\a.jpg', 'C:\\b.txt', 'C:\\c.png'] };
    mountBatch();
    await flush();

    expect(wrapper!.text()).toContain('a.jpg');
    expect(wrapper!.text()).toContain('c.png');
    expect(wrapper!.text()).not.toContain('b.txt');
  });

  it('replaces the list for a new context', async () => {
    state.context.value = { paths: ['C:\\a.jpg'] };
    mountBatch();
    await flush();
    state.context.value = { paths: ['C:\\b.png'] };
    await flush();
    expect(wrapper!.text()).toContain('b.png');
    expect(wrapper!.text()).not.toContain('a.jpg');
  });

  it('adds images from the dialog and ignores duplicates', async () => {
    state.context.value = { paths: ['C:\\a.jpg'] };
    mountBatch();
    await flush();
    state.invoke.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:\\a.jpg', 'C:\\b.png', 'C:\\c.txt']
    });

    await wrapper!.get('[data-testid="batch-images-add"]').trigger('click');
    await flush();

    expect(wrapper!.text()).toContain('b.png');
    expect(wrapper!.text()).not.toContain('c.txt');
    expect(state.invoke).toHaveBeenCalledWith('dialog:openFile', {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'tools.imageStudioTitle', extensions: expect.any(Array) }]
    });
  });

  it('adds dropped images and removes/clears rows', async () => {
    mountBatch();
    await flush();
    state.dropped.mockReturnValue(['C:\\a.jpg', 'C:\\b.png']);
    await wrapper!.get('[data-testid="batch-images-view"]').trigger('drop');
    await flush();
    expect(wrapper!.text()).toContain('a.jpg');

    await wrapper!.findAllComponents(IconButtonStub)[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).not.toContain('a.jpg');

    await wrapper!.get('[data-testid="batch-images-clear"]').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('tools.batchImagesEmpty');
  });

  it('picks an output directory', async () => {
    mountBatch();
    await flush();
    state.invoke.mockResolvedValueOnce(['C:\\out']);
    await wrapper!.findAllComponents(IconButtonStub)[0].trigger('click');
    await flush();
    expect(wrapper!.findAllComponents({ name: 'Input' })[0].props('modelValue')).toBe('C:\\out');
  });
});

describe('conversion', () => {
  async function prepare(paths = ['C:\\a.jpg', 'C:\\b.png']) {
    state.context.value = { paths };
    mountBatch();
    await flush();
  }

  it('sends options and updates rows from progress events', async () => {
    await prepare();
    const selects = wrapper!.findAllComponents(SelectStub);
    selects[0].vm.$emit('update:modelValue', 'avif');
    wrapper!.findAllComponents({ name: 'Slider' })[0].vm.$emit('update:modelValue', 70);
    const numbers = wrapper!.findAllComponents(NumberFieldStub);
    numbers[0].vm.$emit('update:modelValue', 1920);
    numbers[1].vm.$emit('update:modelValue', 1080);
    wrapper!.findAllComponents({ name: 'Input' })[0].vm.$emit('update:modelValue', ' C:\\out ');
    await wrapper!.vm.$nextTick();

    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();

    expect(state.batchConvertImages).toHaveBeenCalledWith({
      jobId: expect.any(String),
      inputPaths: ['C:\\a.jpg', 'C:\\b.png'],
      outputDir: 'C:\\out',
      format: 'avif',
      quality: 70,
      maxWidth: 1920,
      maxHeight: 1080
    });
  });

  it('applies progress only for the current job and tracks completion', async () => {
    await prepare();
    const pending = new Promise<{ success: boolean }>(() => undefined);
    state.batchConvertImages.mockReturnValueOnce(pending);
    let listener: ((payload: unknown) => void) | null = null;
    state.on.mockImplementation((_channel: string, callback: (payload: unknown) => void) => {
      listener = callback;
      return state.off;
    });

    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();
    const jobId = state.batchConvertImages.mock.calls[0][0].jobId as string;

    listener!({ jobId: 'other', path: 'C:\\a.jpg', status: 'done' });
    listener!({
      jobId,
      path: 'C:\\a.jpg',
      status: 'done',
      outputPath: '/out/a.webp',
      bytes: 2048,
      index: 0
    });
    await wrapper!.vm.$nextTick();
    expect(document.body.querySelector('[data-testid="batch-images-row-done"]')).not.toBeNull();
    expect(wrapper!.text()).toContain('2.0 KB');
    expect(wrapper!.text()).toContain('tools.done');

    listener!({
      jobId,
      path: 'C:\\b.png',
      status: 'error',
      error: 'decode failed',
      index: 1
    });
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('decode failed');
    expect(wrapper!.text()).toContain('tools.error');
  });

  it('marks pending rows canceled after a canceled result', async () => {
    await prepare();
    state.batchConvertImages.mockResolvedValueOnce({ success: false, canceled: true });
    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();
    expect(
      document.body.querySelectorAll('[data-testid="batch-images-row-canceled"]')
    ).toHaveLength(2);
  });

  it('reports result and thrown errors', async () => {
    await prepare();
    state.batchConvertImages.mockResolvedValueOnce({ success: false, error: 'unsupported' });
    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();
    expect(wrapper!.findComponent(ToolWindowShellStub).props('status')).toEqual({
      tone: 'error',
      text: 'unsupported'
    });

    state.batchConvertImages.mockRejectedValueOnce(new Error('ffmpeg crash'));
    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();
    expect(wrapper!.findComponent(ToolWindowShellStub).props('status')).toEqual({
      tone: 'error',
      text: 'ffmpeg crash'
    });
  });

  it('cancels the running job', async () => {
    await prepare();
    state.batchConvertImages.mockReturnValueOnce(new Promise(() => undefined));
    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();

    await wrapper!.get('[data-testid="batch-images-cancel"]').trigger('click');
    expect(state.cancelBatchImages).toHaveBeenCalledWith(
      state.batchConvertImages.mock.calls[0][0].jobId
    );
  });

  it('does nothing without files', async () => {
    mountBatch();
    await flush();
    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();
    expect(state.batchConvertImages).not.toHaveBeenCalled();
  });

  it('opens a finished output', async () => {
    await prepare(['C:\\a.jpg']);
    state.batchConvertImages.mockResolvedValueOnce({ success: true });
    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();

    // Progress event dostarcza outputPath; bez niego przycisk otwarcia nie istnieje.
    let listener: ((payload: unknown) => void) | null = null;
    state.on.mockImplementation((_channel: string, callback: (payload: unknown) => void) => {
      listener = callback;
      return state.off;
    });
    state.batchConvertImages.mockReturnValueOnce(new Promise(() => undefined));
    await wrapper!.get('[data-testid="batch-images-start"]').trigger('click');
    await flush();
    const jobId = state.batchConvertImages.mock.calls.at(-1)![0].jobId as string;
    listener!({
      jobId,
      path: 'C:\\a.jpg',
      status: 'done',
      outputPath: '/out/a.webp',
      bytes: 10,
      index: 0
    });
    await wrapper!.vm.$nextTick();
    state.invoke.mockClear();
    await wrapper!.findAllComponents(IconButtonStub)[0].trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', '/out/a.webp');
  });
});
