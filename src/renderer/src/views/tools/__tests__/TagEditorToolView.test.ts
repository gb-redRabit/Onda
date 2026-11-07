import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import TagEditorToolView from '../TagEditorToolView.vue';

const state = vi.hoisted(() => ({
  context: null as any,
  filesForTool: vi.fn((_tool: string, paths: string[]) => paths),
  toolContextPaths: vi.fn((ctx: { paths?: string[] } | null) => ctx?.paths ?? []),
  tagEditorRead: vi.fn(),
  tagEditorWrite: vi.fn(),
  writeCover: vi.fn(),
  invoke: vi.fn(),
  dropped: vi.fn((): string[] => []),
  showConfirm: vi.fn(async () => true),
  prompt: null as any,
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useToolBridge', () => ({
  useToolBridge: () => ({ context: state.context })
}));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => state.prompt
}));
vi.mock('@renderer/utils/fileDrag', () => ({ getDroppedFilePaths: state.dropped }));
vi.mock('@shared/tool-input', () => ({
  filesForTool: state.filesForTool,
  toolContextPaths: state.toolContextPaths
}));

const ToolWindowShellStub = {
  template: '<div><slot /><slot name="footer" /></div>'
};
const ButtonStub = { template: '<button><slot /><slot name="leading" /></button>' };
const IconButtonStub = { template: '<button><slot /></button>' };
const InputStub = {
  props: ['modelValue', 'size'],
  emits: ['update:modelValue'],
  template: '<input />'
};
const SelectStub = {
  props: ['modelValue', 'size'],
  emits: ['update:modelValue'],
  template: '<select><slot /></select>'
};
const EmptyStateStub = { props: ['title'], template: '<div>{{ title }}</div>' };
const SpinnerStub = { template: '<div />' };
const PromptStub = { template: '<div />' };

let wrapper: VueWrapper | null = null;

function row(path: string, tags: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  return { path, tags, writable: true, ...extra };
}

function mountEditor() {
  wrapper = mount(TagEditorToolView, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ToolWindowShell: ToolWindowShellStub,
        Button: ButtonStub,
        IconButton: IconButtonStub,
        Input: InputStub,
        Select: SelectStub,
        EmptyState: EmptyStateStub,
        Spinner: SpinnerStub,
        ExplorerPromptDialog: PromptStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function textInputs() {
  return wrapper!.findAll('tbody input[type="text"]');
}

beforeEach(() => {
  state.context = ref({ paths: [] as string[] });
  state.filesForTool.mockClear();
  state.toolContextPaths.mockClear();
  state.tagEditorRead.mockReset();
  state.tagEditorRead.mockImplementation(async (paths: string[]) =>
    paths.map((path) => row(path, { title: `title ${path}` }))
  );
  state.tagEditorWrite.mockReset();
  state.tagEditorWrite.mockImplementation(async (entries: Array<{ path: string }>) =>
    entries.map((entry) => ({ path: entry.path, success: true }))
  );
  state.writeCover.mockReset();
  state.writeCover.mockResolvedValue({ success: true });
  state.invoke.mockReset();
  state.invoke.mockResolvedValue({ canceled: true, filePaths: [] });
  state.dropped.mockReset();
  state.dropped.mockReturnValue([]);
  state.showConfirm.mockReset();
  state.showConfirm.mockResolvedValue(true);
  state.prompt = {
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    showConfirm: state.showConfirm,
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    tagEditorRead: state.tagEditorRead,
    tagEditorWrite: state.tagEditorWrite,
    writeCover: state.writeCover,
    invoke: state.invoke
  };
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('loading files', () => {
  it('loads paths from the tool context immediately', async () => {
    state.context.value = { paths: ['C:\\music\\one.mp3'] };
    mountEditor();
    await flush();

    expect(state.filesForTool).toHaveBeenCalledWith('tag-editor', ['C:\\music\\one.mp3']);
    expect(state.tagEditorRead).toHaveBeenCalledWith(['C:\\music\\one.mp3']);
    expect(wrapper!.text()).toContain('one.mp3');
    expect((textInputs()[0].element as HTMLInputElement).value).toBe('title C:\\music\\one.mp3');
  });

  it('ignores an empty context and repeated keys', async () => {
    mountEditor();
    await flush();
    expect(state.tagEditorRead).not.toHaveBeenCalled();

    state.context.value = { paths: ['C:\\a.mp3'] };
    await flush();
    expect(state.tagEditorRead).toHaveBeenCalledTimes(1);

    state.context.value = { paths: ['C:\\a.mp3'] };
    await flush();
    expect(state.tagEditorRead).toHaveBeenCalledTimes(1);
  });

  it('replaces the list after confirmation when dirty', async () => {
    state.context.value = { paths: ['C:\\a.mp3'] };
    mountEditor();
    await flush();
    await textInputs()[0].setValue('changed');

    state.context.value = { paths: ['C:\\b.mp3'] };
    await flush();
    expect(state.showConfirm).toHaveBeenCalledWith('tools.tagReplaceDirty');
    expect(wrapper!.text()).toContain('b.mp3');

    await textInputs()[0].setValue('dirty again');
    state.showConfirm.mockResolvedValueOnce(false);
    state.context.value = { paths: ['C:\\c.mp3'] };
    await flush();
    expect(wrapper!.text()).toContain('b.mp3');

    state.showConfirm.mockResolvedValueOnce(true);
    state.context.value = { paths: ['C:\\d.mp3'] };
    await flush();
    expect(wrapper!.text()).toContain('d.mp3');
  });

  it('shows a load error', async () => {
    state.context.value = { paths: ['C:\\a.mp3'] };
    state.tagEditorRead.mockRejectedValue(new Error('cannot read'));
    mountEditor();
    await flush();
    expect(wrapper!.text()).toContain('cannot read');
  });

  it('adds valid dropped audio files only', async () => {
    mountEditor();
    await flush();
    state.dropped.mockReturnValue(['C:\\a.mp3', 'C:\\b.txt', 'C:\\A.FLAC']);
    wrapper!.get('[data-testid="tools-tag-drop"]').trigger('drop');
    await flush();

    expect(state.tagEditorRead).toHaveBeenCalledWith(['C:\\a.mp3', 'C:\\A.FLAC']);
  });

  it('picks files from the dialog and ignores cancellation', async () => {
    mountEditor();
    await flush();
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\a.mp3'] });
    await wrapper!.get('[data-testid="tools-tag-add"]').trigger('click');
    await flush();
    expect(state.tagEditorRead).toHaveBeenCalledWith(['C:\\a.mp3']);

    state.invoke.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await wrapper!.get('[data-testid="tools-tag-add"]').trigger('click');
    await flush();
    expect(state.tagEditorRead).toHaveBeenCalledTimes(1);
  });
});

describe('editing and batch', () => {
  beforeEach(async () => {
    state.context.value = { paths: ['C:\\a.mp3', 'C:\\b.flac'] };
    mountEditor();
    await flush();
  });

  it('marks edited rows dirty and saves them', async () => {
    await textInputs()[0].setValue('New title');
    expect(wrapper!.text()).toContain('tools.tagEditorChanged');

    await wrapper!.get('[data-testid="tools-tag-save"]').trigger('click');
    await flush();

    expect(state.tagEditorWrite).toHaveBeenCalledWith([
      { path: 'C:\\a.mp3', tags: expect.objectContaining({ title: 'New title' }) }
    ]);
    expect(wrapper!.text()).toContain('tools.tagEditorSaved');
  });

  it('applies a batch field to selected rows', async () => {
    const selects = wrapper!.findAllComponents(SelectStub);
    selects[0].vm.$emit('update:modelValue', 'genre');
    wrapper!.findAllComponents(InputStub)[0].vm.$emit('update:modelValue', 'Rock');
    await wrapper!.vm.$nextTick();
    await wrapper!.get('[data-testid="tools-tag-apply"]').trigger('click');
    await flush();

    await wrapper!.get('[data-testid="tools-tag-save"]').trigger('click');
    await flush();
    const entries = state.tagEditorWrite.mock.calls[0][0];
    expect(entries).toHaveLength(2);
    expect(entries[0].tags.genre).toBe('Rock');
    expect(entries[1].tags.genre).toBe('Rock');
  });

  it('reports partial save failures', async () => {
    await textInputs()[0].setValue('x');
    state.tagEditorWrite.mockResolvedValueOnce([
      { path: 'C:\\a.mp3', success: false, error: 'denied' }
    ]);
    await wrapper!.get('[data-testid="tools-tag-save"]').trigger('click');
    await flush();

    expect(wrapper!.text()).toContain('denied');
    expect(wrapper!.text()).toContain('tools.tagEditorSaveFailedCount');
  });

  it('reports a save exception', async () => {
    await textInputs()[0].setValue('x');
    state.tagEditorWrite.mockRejectedValueOnce(new Error('disk'));
    await wrapper!.get('[data-testid="tools-tag-save"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('disk');
  });

  it('toggles all rows and clears the list', async () => {
    const checkboxes = wrapper!.findAll('tbody input[type="checkbox"]');
    checkboxes[0].setValue(false);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAll('tbody input[type="checkbox"]')[0].element).toHaveProperty(
      'checked',
      false
    );

    const selectAll = wrapper!.find('thead input[type="checkbox"]');
    await selectAll.setValue(true);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAll('tbody input[type="checkbox"]')[0].element).toHaveProperty(
      'checked',
      true
    );

    await wrapper!.findAllComponents(ButtonStub)[1].trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('tools.tagEditorEmpty');
  });

  it('removes a single row', async () => {
    await wrapper!.findAllComponents(IconButtonStub)[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).not.toContain('a.mp3');
    expect(wrapper!.text()).toContain('b.flac');
  });
});

describe('covers', () => {
  beforeEach(async () => {
    state.context.value = { paths: ['C:\\a.mp3', 'C:\\video.mp4', 'C:\\b.flac'] };
    state.tagEditorRead.mockImplementation(async (paths: string[]) =>
      paths.map((path) => row(path))
    );
    mountEditor();
    await flush();
  });

  it('picks a cover and applies it to supported audio rows', async () => {
    state.invoke.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\cover.png'] });
    await wrapper!.findAllComponents(ButtonStub)[3].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findAllComponents(InputStub)[1].props('modelValue')).toBe('C:\\cover.png');
    await wrapper!.get('[data-testid="tools-tag-cover-apply"]').trigger('click');
    await flush();

    expect(state.writeCover).toHaveBeenCalledTimes(2);
    expect(state.writeCover).toHaveBeenCalledWith('C:\\a.mp3', 'C:\\cover.png');
    expect(state.writeCover).toHaveBeenCalledWith('C:\\b.flac', 'C:\\cover.png');
    expect(wrapper!.text()).toContain('tools.tagEditorCoverApplied');
  });

  it('reports cover failures and errors', async () => {
    wrapper!.findAllComponents(InputStub)[1].vm.$emit('update:modelValue', 'C:\\cover.png');
    await wrapper!.vm.$nextTick();
    state.writeCover.mockResolvedValueOnce({ success: false, error: 'unsupported' });
    await wrapper!.get('[data-testid="tools-tag-cover-apply"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('unsupported');

    state.writeCover.mockRejectedValueOnce(new Error('cover io'));
    await wrapper!.get('[data-testid="tools-tag-cover-apply"]').trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('cover io');
  });

  it('does nothing without a cover path', async () => {
    await wrapper!.get('[data-testid="tools-tag-cover-apply"]').trigger('click');
    await flush();
    expect(state.writeCover).not.toHaveBeenCalled();
  });
});
