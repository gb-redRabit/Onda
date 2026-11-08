import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';
import HistoryExportToolView from '../HistoryExportToolView.vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  invoke: vi.fn(),
  exportHistory: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));

const ShellStub = defineComponent({
  props: ['title', 'icon', 'status'],
  template: '<div data-testid="shell"><slot /><slot name="footer" /></div>'
});
const ButtonStub = defineComponent({
  props: ['variant', 'size', 'disabled', 'loading'],
  emits: ['click'],
  template:
    '<button :disabled="disabled" @click="$emit(\'click\')"><slot name="leading" /><slot /></button>'
});
const IconButtonStub = defineComponent({
  props: ['icon', 'label', 'size', 'disabled'],
  emits: ['click'],
  template: '<button :aria-label="label" :disabled="disabled" @click="$emit(\'click\')" />'
});
const InputStub = defineComponent({
  props: ['modelValue', 'size', 'disabled', 'placeholder'],
  emits: ['update:modelValue'],
  template: '<input :value="modelValue" />'
});
const SelectStub = defineComponent({
  props: ['modelValue', 'size', 'disabled'],
  emits: ['update:modelValue'],
  template: '<select :value="modelValue"><slot /></select>'
});
const CheckboxStub = defineComponent({
  props: ['modelValue', 'label', 'disabled'],
  emits: ['update:modelValue'],
  template: '<label><input type="checkbox" :checked="modelValue" />{{ label }}</label>'
});

let wrapper: VueWrapper | null = null;

function mountView() {
  wrapper = mount(HistoryExportToolView, {
    global: {
      mocks: { $t: (key: string, params?: Record<string, unknown>) => state.t(key, params) },
      stubs: {
        ToolWindowShell: ShellStub,
        Button: ButtonStub,
        Checkbox: CheckboxStub,
        IconButton: IconButtonStub,
        Input: InputStub,
        Select: SelectStub
      }
    }
  });
  return wrapper;
}

function runButton() {
  return wrapper!.get('[data-testid="history-export-run"]');
}

function selects() {
  return wrapper!.findAllComponents(SelectStub);
}

function success(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    canceled: false,
    path: 'C:/out/onda-history.csv',
    rows: 12,
    bytes: 2048,
    ...overrides
  };
}

beforeEach(() => {
  state.t.mockClear();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue([]);
  state.exportHistory.mockReset();
  state.exportHistory.mockResolvedValue(success());
  (window as { api?: unknown }).api = {
    invoke: state.invoke,
    exportHistory: state.exportHistory
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('initial state', () => {
  it('renders defaults and no status', () => {
    mountView();
    const shell = wrapper!.findComponent(ShellStub);
    expect(shell.props('title')).toBe('tools.historyExportTitle');
    expect(shell.props('status')).toBeNull();
    expect(wrapper!.text()).toContain('tools.historyExportHint');

    const [format, type, sort] = selects();
    expect(format.props('modelValue')).toBe('csv');
    expect(type.props('modelValue')).toBe('all');
    expect(sort.props('modelValue')).toBe('lastPlayed');
    expect(wrapper!.findComponent(CheckboxStub).props()).toMatchObject({
      modelValue: true,
      label: 'tools.historyExportOnlyPlayed'
    });
    expect(runButton().text()).toContain('tools.historyExportRun');
  });

  it('binds format, type, sort, checkbox and output controls', async () => {
    mountView();
    const [format, type, sort] = selects();
    format.vm.$emit('update:modelValue', 'json');
    type.vm.$emit('update:modelValue', 'audio');
    sort.vm.$emit('update:modelValue', 'title');
    wrapper!.findComponent(CheckboxStub).vm.$emit('update:modelValue', false);
    wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', 'C:/out/file.json');
    await wrapper!.vm.$nextTick();

    expect(selects()[0].props('modelValue')).toBe('json');
    expect(selects()[1].props('modelValue')).toBe('audio');
    expect(selects()[2].props('modelValue')).toBe('title');
    expect(wrapper!.findComponent(CheckboxStub).props('modelValue')).toBe(false);
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('C:/out/file.json');
  });
});

describe('running an export', () => {
  it('passes the selected options and shows the result', async () => {
    mountView();
    selects()[0].vm.$emit('update:modelValue', 'json');
    selects()[1].vm.$emit('update:modelValue', 'video');
    selects()[2].vm.$emit('update:modelValue', 'playCount');
    wrapper!.findComponent(CheckboxStub).vm.$emit('update:modelValue', false);
    wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', '  C:/out/x.csv  ');
    await wrapper!.vm.$nextTick();

    await runButton().trigger('click');
    await flushPromises();

    expect(state.exportHistory).toHaveBeenCalledWith({
      format: 'json',
      type: 'video',
      sort: 'playCount',
      onlyPlayed: false,
      outputPath: 'C:/out/x.csv'
    });
    expect(wrapper!.get('[data-testid="history-export-result"]').text()).toContain(
      'tools.historyExportResult'
    );
    expect(state.t).toHaveBeenCalledWith('tools.historyExportResult', {
      rows: 12,
      size: '2.0 KB'
    });
  });

  it('omits a blank output path', async () => {
    mountView();
    wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', '   ');
    await wrapper!.vm.$nextTick();
    await runButton().trigger('click');
    await flushPromises();
    expect(state.exportHistory.mock.calls[0][0].outputPath).toBeUndefined();
  });

  it('opens the produced file in its folder', async () => {
    state.exportHistory.mockResolvedValue(success({ path: 'C:/out/result.csv' }));
    mountView();
    await runButton().trigger('click');
    await flushPromises();
    await wrapper!.get('[data-testid="history-export-result"] button').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'C:/out/result.csv');
  });

  it('shows a busy status, disables controls and guards re-entry', async () => {
    let resolveExport: (value: unknown) => void = () => {};
    state.exportHistory.mockImplementation(
      () => new Promise((resolve) => (resolveExport = resolve))
    );
    mountView();

    await runButton().trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(ShellStub).props('status')).toEqual({
      tone: 'busy',
      text: 'tools.historyExportRunning'
    });
    expect(runButton().attributes('disabled')).toBeDefined();
    expect(runButton().text()).toContain('tools.historyExportRunning');
    expect(selects()[0].props('disabled')).toBe(true);
    expect(wrapper!.findComponent(CheckboxStub).props('disabled')).toBe(true);
    expect(wrapper!.findComponent(InputStub).props('disabled')).toBe(true);
    expect(wrapper!.findComponent(IconButtonStub).props('disabled')).toBe(true);

    await runButton().trigger('click');
    expect(state.exportHistory).toHaveBeenCalledTimes(1);

    resolveExport(success());
    await flushPromises();
    expect(runButton().attributes('disabled')).toBeUndefined();
    expect(wrapper!.findComponent(ShellStub).props('status')).toBeNull();
  });

  it('does not report success for canceled exports', async () => {
    state.exportHistory.mockResolvedValue({ success: false, canceled: true });
    mountView();
    await runButton().trigger('click');
    await flushPromises();
    expect(wrapper!.find('[data-testid="history-export-result"]').exists()).toBe(false);
    expect(wrapper!.findComponent(ShellStub).props('status')).toBeNull();
  });

  it('reports an error message from a failed export', async () => {
    state.exportHistory.mockResolvedValue({ success: false, error: 'disk full' });
    mountView();
    await runButton().trigger('click');
    await flushPromises();
    expect(wrapper!.findComponent(ShellStub).props('status')).toEqual({
      tone: 'error',
      text: 'disk full'
    });
    expect(wrapper!.find('[data-testid="history-export-result"]').exists()).toBe(false);
  });

  it('falls back to a translated error when none is provided', async () => {
    state.exportHistory.mockResolvedValue({ success: false });
    mountView();
    await runButton().trigger('click');
    await flushPromises();
    expect(wrapper!.findComponent(ShellStub).props('status')).toEqual({
      tone: 'error',
      text: 'tools.historyExportError'
    });
  });

  it('reports thrown errors as text', async () => {
    state.exportHistory.mockRejectedValueOnce(new Error('boom'));
    mountView();
    await runButton().trigger('click');
    await flushPromises();
    expect(wrapper!.findComponent(ShellStub).props('status')).toEqual({
      tone: 'error',
      text: 'boom'
    });

    state.exportHistory.mockRejectedValueOnce('plain failure');
    await runButton().trigger('click');
    await flushPromises();
    expect(wrapper!.findComponent(ShellStub).props('status')).toEqual({
      tone: 'error',
      text: 'plain failure'
    });
  });
});

describe('formatting file sizes', () => {
  async function resultText(bytes?: number) {
    state.exportHistory.mockResolvedValue(success({ bytes, rows: 0 }));
    mountView();
    await runButton().trigger('click');
    await flushPromises();
    return wrapper!.get('[data-testid="history-export-result"]').text();
  }

  it('renders every unit and skips empty sizes', async () => {
    expect(await resultText(500)).toContain('"size":"500 B"');
    wrapper!.unmount();
    expect(await resultText(2048)).toContain('"size":"2.0 KB"');
    wrapper!.unmount();
    expect(await resultText(10240)).toContain('"size":"10 KB"');
    wrapper!.unmount();
    expect(await resultText(5 * 1024 * 1024)).toContain('"size":"5.0 MB"');
    wrapper!.unmount();
    expect(await resultText(2 * 1024 * 1024 * 1024)).toContain('"size":"2.0 GB"');
    wrapper!.unmount();
    expect(await resultText(0)).toContain('"size":""');
    wrapper!.unmount();
    expect(await resultText(undefined)).toContain('"size":""');
  });
});

describe('folder picker and extension sync', () => {
  it('appends the history file with the current extension', async () => {
    state.invoke.mockResolvedValue(['C:\\Users\\me\\Exports']);
    mountView();
    await wrapper!.get('button[aria-label="tools.chooseFolder"]').trigger('click');
    await flushPromises();
    expect(state.invoke).toHaveBeenCalledWith('dialog:openFolder');
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe(
      'C:/Users/me/Exports/onda-history.csv'
    );
  });

  it('uses the JSON extension after switching format', async () => {
    state.invoke.mockResolvedValue(['D:/out']);
    mountView();
    selects()[0].vm.$emit('update:modelValue', 'json');
    await wrapper!.vm.$nextTick();
    await wrapper!.get('button[aria-label="tools.chooseFolder"]').trigger('click');
    await flushPromises();
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('D:/out/onda-history.json');
  });

  it('keeps the path unchanged when the picker is canceled', async () => {
    state.invoke.mockResolvedValue([]);
    mountView();
    wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', 'keep.csv');
    await wrapper!.vm.$nextTick();
    await wrapper!.get('button[aria-label="tools.chooseFolder"]').trigger('click');
    await flushPromises();
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('keep.csv');
  });

  it('rewrites known extensions when the format changes', async () => {
    mountView();
    wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', 'C:/out/a.csv');
    selects()[0].vm.$emit('update:modelValue', 'json');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('C:/out/a.json');

    selects()[0].vm.$emit('update:modelValue', 'csv');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('C:/out/a.csv');

    wrapper!.findComponent(InputStub).vm.$emit('update:modelValue', 'C:/out/a.txt');
    selects()[0].vm.$emit('update:modelValue', 'json');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(InputStub).props('modelValue')).toBe('C:/out/a.txt');
  });
});
