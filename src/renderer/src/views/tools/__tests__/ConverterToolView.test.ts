import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import ConverterToolView from '../ConverterToolView.vue';

const state = vi.hoisted(() => ({
  context: null as any,
  sendToMain: vi.fn(),
  filesForTool: vi.fn((_tool: string, paths: string[]) => paths),
  toolContextPaths: vi.fn((ctx: { paths?: string[] } | null) => ctx?.paths ?? []),
  inputKindOfPath: vi.fn((path: string) => (path.endsWith('.mp4') ? 'video' : 'audio')),
  dropped: vi.fn((): string[] => []),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  convertMedia: vi.fn(),
  cancelConvert: vi.fn(async () => true),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useToolBridge', () => ({
  useToolBridge: () => ({ context: state.context, sendToMain: state.sendToMain })
}));
vi.mock('@renderer/utils/fileDrag', () => ({ getDroppedFilePaths: state.dropped }));
vi.mock('@shared/tool-input', () => ({
  filesForTool: state.filesForTool,
  toolContextPaths: state.toolContextPaths,
  inputKindOfPath: state.inputKindOfPath
}));

const ToolWindowShellStub = { template: '<div><slot /><slot name="footer" /></div>' };
const ButtonStub = { template: '<button><slot /><slot name="leading" /></button>' };
const IconButtonStub = { template: '<button><slot /></button>' };
const SelectStub = {
  props: ['modelValue', 'disabled', 'size'],
  emits: ['update:modelValue'],
  template: '<select><slot /></select>'
};
const PathInputStub = {
  props: ['modelValue'],
  emits: ['update:modelValue', 'browse'],
  template: '<input />'
};
const SegmentedStub = {
  props: ['modelValue', 'options'],
  emits: ['update:modelValue'],
  template: '<div />'
};
const EmptyStateStub = { props: ['title'], template: '<div>{{ title }}</div>' };

let wrapper: VueWrapper | null = null;

function mountConverter() {
  wrapper = mount(ConverterToolView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ToolWindowShell: ToolWindowShellStub,
        Button: ButtonStub,
        IconButton: IconButtonStub,
        Select: SelectStub,
        PathInput: PathInputStub,
        SegmentedControl: SegmentedStub,
        EmptyState: EmptyStateStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  state.context = ref({ paths: [] as string[] });
  state.sendToMain.mockClear();
  state.filesForTool.mockClear();
  state.toolContextPaths.mockClear();
  state.inputKindOfPath.mockClear();
  state.dropped.mockReset();
  state.dropped.mockReturnValue([]);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ canceled: true, filePaths: [] });
  state.off.mockClear();
  state.on.mockReset();
  state.on.mockReturnValue(state.off);
  state.convertMedia.mockReset();
  state.convertMedia.mockResolvedValue({ success: true, outputPath: '/out/result' });
  state.cancelConvert.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    on: state.on,
    convertMedia: state.convertMedia,
    cancelMediaConvert: state.cancelConvert
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('context and file list', () => {
  it('adopts kind and files from the tool context', async () => {
    state.context.value = { paths: ['C:\\a.mp3', 'C:\\b.txt'] };
    mountConverter();
    await flush();
    expect(wrapper!.text()).toContain('a.mp3');
    expect(wrapper!.text()).not.toContain('b.txt');

    state.context.value = { paths: ['C:\\v.mp4'] };
    await flush();
    expect(wrapper!.findComponent(SegmentedStub).props('modelValue')).toBe('video');
    expect(wrapper!.text()).toContain('v.mp4');
  });

  it('ignores repeated context without duplicating files', async () => {
    mountConverter();
    await flush();

    state.context.value = { paths: ['C:\\a.mp3'] };
    await flush();
    state.context.value = { paths: ['C:\\a.mp3'] };
    await flush();

    const occurrences = wrapper!.text().split('a.mp3').length - 1;
    expect(occurrences).toBe(1);
  });

  it('clears the list when switching kind', async () => {
    state.context.value = { paths: ['C:\\a.mp3'] };
    mountConverter();
    await flush();
    expect(wrapper!.text()).toContain('a.mp3');

    wrapper!.findComponent(SegmentedStub).vm.$emit('update:modelValue', 'video');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('tools.empty');
  });

  it('adds accepted files from the dialog and rejects duplicates', async () => {
    state.context.value = { paths: ['C:\\a.mp3'] };
    mountConverter();
    await flush();
    state.invoke.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:\\a.mp3', 'C:\\b.flac', 'C:\\c.txt']
    });
    await wrapper!.get('[data-testid="tools-add-files"]').trigger('click');
    await flush();

    expect(wrapper!.text()).toContain('b.flac');
    expect(state.invoke).toHaveBeenCalledWith('dialog:openFile', {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'tools.audio', extensions: expect.any(Array) }]
    });
  });

  it('adds files by drag and drop, removes and clears', async () => {
    mountConverter();
    await flush();
    state.dropped.mockReturnValue(['C:\\a.mp3', 'C:\\b.mp3']);
    wrapper!.findAll('section')[0].trigger('drop');
    await flush();
    expect(wrapper!.text()).toContain('a.mp3');

    await wrapper!.findAllComponents(IconButtonStub)[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).not.toContain('a.mp3');

    await wrapper!.findAllComponents(ButtonStub)[1].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('tools.empty');
  });

  it('chooses the output directory', async () => {
    mountConverter();
    await flush();
    state.invoke.mockResolvedValueOnce(['C:\\out']);
    wrapper!.findComponent(PathInputStub).vm.$emit('browse');
    await flush();
    expect(wrapper!.findComponent(PathInputStub).props('modelValue')).toBe('C:\\out');
  });
});

describe('options', () => {
  it('disables bitrate for lossless formats', async () => {
    mountConverter();
    await flush();
    const selects = wrapper!.findAllComponents(SelectStub);
    expect(selects[1].props('disabled')).toBe(false);

    selects[0].vm.$emit('update:modelValue', 'flac');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAllComponents(SelectStub)[1].props('disabled')).toBe(true);
  });

  it('shows video options after switching kind', async () => {
    mountConverter();
    await flush();
    wrapper!.findComponent(SegmentedStub).vm.$emit('update:modelValue', 'video');
    await wrapper!.vm.$nextTick();

    const container = wrapper!.find('[data-testid="tools-video-format"]');
    expect(container.exists()).toBe(true);
    expect(wrapper!.findAllComponents(SelectStub)).toHaveLength(2);
  });
});

describe('conversion', () => {
  async function prepareFiles(paths = ['C:\\a.mp3', 'C:\\b.flac']) {
    state.context.value = { paths };
    mountConverter();
    await flush();
  }

  it('runs the queue and reports completion to main', async () => {
    await prepareFiles();
    let progressListener: ((payload: unknown) => void) | null = null;
    state.on.mockImplementation((_channel: string, listener: (payload: unknown) => void) => {
      progressListener = listener;
      return state.off;
    });

    await wrapper!.get('[data-testid="tools-convert"]').trigger('click');
    expect(state.on).toHaveBeenCalledWith('tools:progress', expect.any(Function));
    await flush();
    const jobId = state.convertMedia.mock.calls[0][0].jobId as string;
    progressListener!({ jobId, percent: 40, speed: '2x' });
    await flush();
    expect(state.convertMedia).toHaveBeenCalledTimes(2);
    expect(state.convertMedia.mock.calls[0][0]).toMatchObject({
      kind: 'audio',
      inputPath: 'C:\\a.mp3',
      audioFormat: 'mp3',
      audioBitrate: 192
    });
    expect(state.sendToMain).toHaveBeenCalledWith('conversion-complete', {
      name: 'a.mp3',
      outputPath: '/out/result'
    });
    expect(document.body.querySelector('[data-testid="tools-job-done"]')).not.toBeNull();
    expect(state.off).toHaveBeenCalled();
  });

  it('builds video requests with container and quality', async () => {
    await prepareFiles(['C:\\v.mp4']);
    await wrapper!.get('[data-testid="tools-convert"]').trigger('click');
    await flush();
    expect(state.convertMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'video',
        videoContainer: 'mp4',
        videoQuality: 'medium'
      })
    );
  });

  it('stores errors and continues with the next file', async () => {
    await prepareFiles();
    state.convertMedia
      .mockResolvedValueOnce({ success: false, error: 'bad codec' })
      .mockResolvedValueOnce({ success: true, outputPath: '/out/b.flac' });

    await wrapper!.get('[data-testid="tools-convert"]').trigger('click');
    await flush();

    expect(wrapper!.text()).toContain('bad codec');
    expect(document.body.querySelector('[data-testid="tools-job-error"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="tools-job-done"]')).not.toBeNull();
  });

  it('handles thrown errors and canceled results', async () => {
    await prepareFiles(['C:\\a.mp3', 'C:\\b.mp3', 'C:\\c.mp3']);
    state.convertMedia
      .mockRejectedValueOnce(new Error('ffmpeg crash'))
      .mockResolvedValueOnce({ canceled: true })
      .mockResolvedValue({ success: true, outputPath: '/out/x' });

    await wrapper!.get('[data-testid="tools-convert"]').trigger('click');
    await flush();

    expect(wrapper!.text()).toContain('ffmpeg crash');
    expect(document.body.querySelector('[data-testid="tools-job-canceled"]')).not.toBeNull();
  });

  it('cancels the running job and marks the rest canceled', async () => {
    await prepareFiles(['C:\\a.mp3', 'C:\\b.mp3']);
    const pending = deferred<{ success: boolean }>();
    state.convertMedia.mockReturnValueOnce(pending.promise);

    await wrapper!.get('[data-testid="tools-convert"]').trigger('click');
    await flush();

    const cancelButton = wrapper!
      .findAllComponents(ButtonStub)
      .find((b) => b.text().includes('tools.cancel'))!;
    await cancelButton.trigger('click');
    expect(state.cancelConvert).toHaveBeenCalled();
    expect(state.convertMedia).toHaveBeenCalledTimes(1);

    pending.resolve({ success: true });
    await flush();
    expect(document.body.querySelectorAll('[data-testid="tools-job-canceled"]')).toHaveLength(1);
  });

  it('does nothing without files', async () => {
    mountConverter();
    await flush();
    await wrapper!.get('[data-testid="tools-convert"]').trigger('click');
    await flush();
    expect(state.convertMedia).not.toHaveBeenCalled();
  });

  it('opens a finished output in the file manager', async () => {
    await prepareFiles(['C:\\a.mp3']);
    await wrapper!.get('[data-testid="tools-convert"]').trigger('click');
    await flush();
    state.invoke.mockClear();

    const openButton = wrapper!.findAllComponents(IconButtonStub).at(-1)!;
    await openButton.trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', '/out/result');
  });
});
