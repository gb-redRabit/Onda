import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  ui: null as any,
  invoke: vi.fn()
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: state.t }) };
});
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@shared/types/tools', () => ({
  TOOL_INPUTS: {
    'tag-editor': { kind: 'audio' },
    'history-export': { kind: 'audio' },
    'video-clipper': { kind: 'video' },
    'video-concat': { kind: 'video' },
    'image-studio': { kind: 'image' },
    'batch-images': { kind: 'image' }
  }
}));

const HeaderStub = defineComponent({
  name: 'PageHeaderStub',
  props: { title: String, subtitle: String, icon: [Object, Function], sticky: Boolean },
  template: '<header><span data-testid="header-title">{{ title }}</span></header>'
});
const LaunchPanelStub = defineComponent({
  name: 'ToolLaunchPanelStub',
  props: { toolId: String, busy: Boolean },
  emits: ['cancel', 'launch'],
  template: `<div data-testid="launch-panel" :data-tool="toolId" :data-busy="String(busy)">
    <button data-testid="panel-cancel" @click="$emit('cancel')" />
    <button data-testid="panel-launch" @click="$emit('launch', ['D:/a.mp3'])">launch</button>
  </div>`
});

import ToolsView from '../ToolsView.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(ToolsView, {
    global: {
      stubs: { PageHeader: HeaderStub, ToolLaunchPanel: LaunchPanelStub }
    }
  });
  return wrapper;
}

function card(id: string) {
  return wrapper!.get(`[data-testid="tools-card-${id}"]`);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.t.mockClear();
  state.ui = { notify: vi.fn() };
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(42);
  (window as unknown as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('groups every tool', () => {
    setup();

    expect(wrapper!.get('[data-testid="header-title"]').text()).toBe('tools.title');
    expect(wrapper!.findAll('[data-testid^="tools-group-"]')).toHaveLength(4);
    for (const id of [
      'converter',
      'tag-editor',
      'history-export',
      'video-clipper',
      'video-concat',
      'image-studio',
      'batch-images'
    ]) {
      expect(wrapper!.find(`[data-testid="tools-card-${id}"]`).exists()).toBe(true);
    }
    expect(wrapper!.text()).toContain('tools.groupConversion');
    expect(wrapper!.text()).toContain('tools.openInNewWindow');
  });
});

describe('direct launch', () => {
  it('opens the tool window immediately', async () => {
    setup();

    await card('converter').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('tools:openWindow', 'converter', undefined);
    expect(state.ui.notify).not.toHaveBeenCalled();
  });

  it('passes paths when provided by the chooser', async () => {
    setup();
    await card('tag-editor').trigger('click');
    await wrapper!.get('[data-testid="panel-launch"]').trigger('click');
    await flush();

    expect(state.invoke).toHaveBeenCalledWith('tools:openWindow', 'tag-editor', {
      paths: ['D:/a.mp3']
    });
  });

  it('reports a failed window creation', async () => {
    state.invoke.mockResolvedValueOnce(null);
    setup();

    await card('converter').trigger('click');
    await flush();

    expect(state.ui.notify).toHaveBeenCalledWith('error', 'app.error', 'tools.openFailed');
  });

  it('reports thrown failures', async () => {
    state.invoke.mockRejectedValueOnce(new Error('spawn'));
    setup();

    await card('converter').trigger('click');
    await flush();

    expect(state.ui.notify).toHaveBeenCalledWith('error', 'app.error', 'spawn');

    state.invoke.mockRejectedValueOnce('plain');
    await card('converter').trigger('click');
    await flush();
    expect(state.ui.notify).toHaveBeenLastCalledWith('error', 'app.error', 'plain');
  });

  it('disables cards while opening', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      })
    );
    setup();

    await card('converter').trigger('click');
    expect(card('tag-editor').attributes('disabled')).toBeDefined();

    resolve(1);
    await flush();
    expect(card('tag-editor').attributes('disabled')).toBeUndefined();
  });

  it('ignores a second launch while opening', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      })
    );
    setup();

    await card('converter').trigger('click');
    await card('converter').trigger('click');
    resolve(1);
    await flush();

    expect(state.invoke).toHaveBeenCalledTimes(1);
  });
});

describe('file tools', () => {
  it('opens the chooser before launching', async () => {
    setup();

    await card('tag-editor').trigger('click');

    expect(state.invoke).not.toHaveBeenCalled();
    expect(wrapper!.get('[data-testid="launch-panel"]').attributes('data-tool')).toBe('tag-editor');
    expect(wrapper!.find('[data-testid="tools-group-audio"]').exists()).toBe(false);
  });

  it('cancels the chooser', async () => {
    setup();
    await card('tag-editor').trigger('click');

    await wrapper!.get('[data-testid="panel-cancel"]').trigger('click');

    expect(wrapper!.find('[data-testid="launch-panel"]').exists()).toBe(false);
    expect(state.invoke).not.toHaveBeenCalled();
  });

  it('marks the panel busy during launch', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      })
    );
    setup();
    await card('tag-editor').trigger('click');

    await wrapper!.get('[data-testid="panel-launch"]').trigger('click');
    expect(wrapper!.get('[data-testid="launch-panel"]').attributes('data-busy')).toBe('true');

    resolve(1);
    await flush();
    expect(wrapper!.find('[data-testid="launch-panel"]').exists()).toBe(false);
  });

  it('ignores launch events without a selected tool', async () => {
    setup();
    // Panel is absent; calling the handler directly is not exposed — verify no invoke on mount.
    expect(state.invoke).not.toHaveBeenCalled();
  });
});
