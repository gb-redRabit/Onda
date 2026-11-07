import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import VideoConcatToolView from '../VideoConcatToolView.vue';

const state = vi.hoisted(() => ({
  context: null as any,
  sendToMain: vi.fn(),
  filesForTool: vi.fn((_tool: string, paths: string[]) => paths),
  toolContextPaths: vi.fn((ctx: { paths?: string[] } | null) => ctx?.paths ?? []),
  dropped: vi.fn((): string[] => []),
  invoke: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  concatVideos: vi.fn(),
  cancelConcat: vi.fn(async () => true),
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
  toolContextPaths: state.toolContextPaths
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
const EmptyStateStub = { props: ['title'], template: '<div>{{ title }}</div>' };

let wrapper: VueWrapper | null = null;

function mountConcat() {
  wrapper = mount(VideoConcatToolView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ToolWindowShell: ToolWindowShellStub,
        Button: ButtonStub,
        IconButton: IconButtonStub,
        Select: SelectStub,
        PathInput: PathInputStub,
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
  state.filesForTool.mockImplementation((_tool: string, paths: string[]) =>
    paths.filter((path) => /\.(mp4|mkv|webm|mov|avi|m4v)$/i.test(path))
  );
  state.toolContextPaths.mockClear();
  state.dropped.mockReset();
  state.dropped.mockReturnValue([]);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ canceled: true, filePaths: [] });
  state.off.mockClear();
  state.on.mockReset();
  state.on.mockReturnValue(state.off);
  state.concatVideos.mockReset();
  state.concatVideos.mockResolvedValue({ success: true, outputPath: '/out/joined.mp4' });
  state.cancelConcat.mockClear();
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    on: state.on,
    concatVideos: state.concatVideos,
    cancelVideoConcat: state.cancelConcat
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('files', () => {
  it('adopts context paths and replaces repeated selections', async () => {
    state.context.value = { paths: ['C:\\a.mp4', 'C:\\b.txt'] };
    mountConcat();
    await flush();
    expect(wrapper!.text()).toContain('a.mp4');
    expect(wrapper!.text()).not.toContain('b.txt');

    state.context.value = { paths: ['C:\\c.mp4'] };
    await flush();
    expect(wrapper!.text()).toContain('c.mp4');
    expect(wrapper!.text()).not.toContain('a.mp4');
  });

  it('adds video files from the dialog and ignores canceled ones', async () => {
    mountConcat();
    await flush();
    state.invoke.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['C:\\a.mp4', 'C:\\b.txt', 'C:\\c.mkv']
    });
    await wrapper!.get('[data-testid="concat-add"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('a.mp4');
    expect(wrapper!.text()).toContain('c.mkv');
    expect(wrapper!.text()).not.toContain('b.txt');

    state.invoke.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await wrapper!.get('[data-testid="concat-add"]').trigger('click');
    await flush();
    expect(state.invoke).toHaveBeenLastCalledWith('dialog:openFile', {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'tools.video', extensions: expect.any(Array) }]
    });
  });

  it('adds dropped files, reorders and removes them', async () => {
    mountConcat();
    await flush();
    state.dropped.mockReturnValue(['C:\\a.mp4', 'C:\\b.mp4']);
    await wrapper!.get('[data-testid="concat-view"]').trigger('drop');
    await flush();

    // Każdy wiersz: up, down, remove.
    await wrapper!.findAllComponents(IconButtonStub)[1].trigger('click');
    await wrapper!.vm.$nextTick();
    const items = wrapper!.findAll('[data-testid="concat-item"]');
    expect(items[0].text()).toContain('b.mp4');
    expect(items[1].text()).toContain('a.mp4');

    await wrapper!.findAllComponents(IconButtonStub)[2].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).not.toContain('b.mp4');
  });

  it('clears files and requires two inputs to export', async () => {
    mountConcat();
    await flush();
    expect(wrapper!.get('[data-testid="concat-export"]').attributes('disabled')).toBeDefined();

    state.dropped.mockReturnValue(['C:\\a.mp4']);
    await wrapper!.get('[data-testid="concat-view"]').trigger('drop');
    await flush();
    expect(wrapper!.get('[data-testid="concat-export"]').attributes('disabled')).toBeDefined();

    state.dropped.mockReturnValue(['C:\\b.mp4']);
    await wrapper!.get('[data-testid="concat-view"]').trigger('drop');
    await flush();
    expect(wrapper!.get('[data-testid="concat-export"]').attributes('disabled')).toBeUndefined();

    await wrapper!.findAllComponents(ButtonStub)[1].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('tools.concatEmpty');
  });

  it('picks the output directory', async () => {
    mountConcat();
    await flush();
    state.invoke.mockResolvedValueOnce(['C:\\out']);
    wrapper!.findComponent(PathInputStub).vm.$emit('browse');
    await flush();
    expect(wrapper!.findComponent(PathInputStub).props('modelValue')).toBe('C:\\out');
  });

  it('updates request options', async () => {
    state.context.value = { paths: ['C:\\a.mp4', 'C:\\b.mp4'] };
    mountConcat();
    await flush();
    const selects = wrapper!.findAllComponents(SelectStub);
    selects[0].vm.$emit('update:modelValue', 'mkv');
    selects[1].vm.$emit('update:modelValue', 'exact');
    selects[2].vm.$emit('update:modelValue', 'mute');
    wrapper!.findComponent(PathInputStub).vm.$emit('update:modelValue', '  C:\\out  ');
    await wrapper!.vm.$nextTick();

    await wrapper!.get('[data-testid="concat-export"]').trigger('click');
    await flush();

    expect(state.concatVideos).toHaveBeenCalledWith({
      jobId: expect.any(String),
      inputPaths: ['C:\\a.mp4', 'C:\\b.mp4'],
      outputDir: 'C:\\out',
      container: 'mkv',
      mode: 'exact',
      audio: 'mute'
    });
  });
});

describe('export', () => {
  beforeEach(async () => {
    state.context.value = { paths: ['C:\\a.mp4', 'C:\\b.mp4'] };
    mountConcat();
    await flush();
  });

  it('reports progress for the current job and completion', async () => {
    let listener: ((payload: unknown) => void) | null = null;
    state.on.mockImplementation((_channel: string, cb: (payload: unknown) => void) => {
      listener = cb;
      return state.off;
    });
    const pending = deferred<{ success: boolean; outputPath?: string }>();
    state.concatVideos.mockReturnValueOnce(pending.promise);

    await wrapper!.get('[data-testid="concat-export"]').trigger('click');
    await flush();
    const jobId = state.concatVideos.mock.calls[0][0].jobId as string;

    listener!({ jobId: 'other', percent: 10 });
    listener!({ jobId, percent: 55, speed: '3x' });
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('tools.progress');
    expect(wrapper!.text()).toContain('3x');

    pending.resolve({ success: true, outputPath: '/out/joined.mp4' });
    await flush();

    expect(state.sendToMain).toHaveBeenCalledWith('concat-complete', {
      name: 'a.mp4',
      outputPath: '/out/joined.mp4'
    });
    expect(wrapper!.get('[data-testid="concat-job"]').attributes('data-status')).toBe('done');
    expect(state.off).toHaveBeenCalled();
  });

  it('reports result errors, thrown errors and cancellation', async () => {
    state.concatVideos.mockResolvedValueOnce({ success: false, error: 'codec mismatch' });
    await wrapper!.get('[data-testid="concat-export"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('codec mismatch');

    state.concatVideos.mockRejectedValueOnce(new Error('ffmpeg crashed'));
    await wrapper!.get('[data-testid="concat-export"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('ffmpeg crashed');

    state.concatVideos.mockResolvedValueOnce({ canceled: true });
    await wrapper!.get('[data-testid="concat-export"]').trigger('click');
    await flush();
    expect(wrapper!.get('[data-testid="concat-job"]').attributes('data-status')).toBe('canceled');
  });

  it('cancels the running job', async () => {
    const pending = deferred<{ success: boolean }>();
    state.concatVideos.mockReturnValueOnce(pending.promise);
    await wrapper!.get('[data-testid="concat-export"]').trigger('click');
    await flush();

    await wrapper!.get('[data-testid="concat-cancel"]').trigger('click');
    expect(state.cancelConcat).toHaveBeenCalledWith(state.concatVideos.mock.calls[0][0].jobId);

    pending.resolve({ success: true });
    await flush();
  });

  it('opens the finished output', async () => {
    await wrapper!.get('[data-testid="concat-export"]').trigger('click');
    await flush();
    state.invoke.mockClear();
    await wrapper!.findAllComponents(IconButtonStub).at(-1)!.trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', '/out/joined.mp4');
  });
});
