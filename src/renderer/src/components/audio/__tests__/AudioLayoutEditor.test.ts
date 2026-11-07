import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import AudioLayoutEditor from '../AudioLayoutEditor.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: (key: string) => key } } }));
vi.mock('@renderer/stores/plugins', () => ({
  usePluginsStore: () => ({ decorations: {}, layoutVariants: {} })
}));

const RightPanelStub = {
  props: ['elements', 'selected', 'selectedId', 'currentPreset'],
  emits: ['select', 'update', 'apply-preset'],
  template: '<div data-testid="right-panel" />'
};

let wrapper: VueWrapper | null = null;

function element(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cover',
    x: 20,
    y: 20,
    width: 30,
    height: 30,
    opacity: 1,
    layer: 2,
    visible: true,
    ...overrides
  };
}

function mountEditor() {
  wrapper = mount(AudioLayoutEditor, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      directives: { activate: {} },
      stubs: { AudioLayoutRightPanel: RightPanelStub }
    }
  });
  return wrapper;
}

function panel() {
  return wrapper!.findComponent(RightPanelStub);
}

function preview(): HTMLElement {
  return wrapper!.get('#audio-layout-preview').element as HTMLElement;
}

function stubRect(): void {
  vi.spyOn(preview(), 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 480,
    height: 320,
    right: 480,
    bottom: 320,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect);
}

function dragHandles() {
  return wrapper!.findAll('.cursor-move');
}

function readout(): string {
  return wrapper!.get('[data-testid="layout-readout"]').text();
}

function keydown(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  document.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  state.settings = reactive({
    appearance: {
      audioLayout: {
        preset: undefined,
        elements: [element(), element({ id: 'progress', x: 10, y: 70, layer: 4, visible: false })]
      }
    },
    updateAudioLayoutElements: vi.fn((next: unknown[]) => {
      state.settings.appearance.audioLayout.elements = next;
    }),
    applyAudioLayoutPreset: vi.fn(),
    resetAudioLayoutPreset: vi.fn()
  });
  state.t.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('rendering', () => {
  it('renders the preview, readout and right panel props', () => {
    mountEditor();

    expect(wrapper!.text()).toContain('audioView.layoutPreview');
    expect(readout()).toContain('audioView.elementCover');
    expect(readout()).toContain('20%, 20% · 30×30 · L2');
    expect(panel().props('selectedId')).toBe('cover');
    expect((panel().props('selected') as { id: string }).id).toBe('cover');
    expect(panel().props('currentPreset')).toBe('full');
    expect((panel().props('elements') as unknown[]).length).toBe(2);
  });

  it('sorts draggable elements by layer and hides invisible ones', () => {
    mountEditor();
    const handles = dragHandles();
    expect(handles).toHaveLength(2);
    expect(handles[1].attributes('style')).toContain('display: none');
  });

  it('selects elements from the preview and the right panel', async () => {
    mountEditor();

    await dragHandles()[0].trigger('click');
    expect(panel().props('selectedId')).toBe('cover');

    panel().vm.$emit('select', 'progress');
    await wrapper!.vm.$nextTick();
    expect(panel().props('selectedId')).toBe('progress');
    expect(readout()).toContain('audioView.elementProgress');

    await dragHandles()[1].trigger('click');
    expect(panel().props('selectedId')).toBe('progress');
  });
});

describe('editing and history', () => {
  it('updates elements through the right panel and supports undo', async () => {
    mountEditor();
    const undo = wrapper!.findAll('button').find((b) => b.text() === 'common.undo')!;
    expect(undo.attributes('disabled')).toBeDefined();

    panel().vm.$emit('update', 'cover', { x: 40 });
    await wrapper!.vm.$nextTick();
    expect(state.settings.updateAudioLayoutElements).toHaveBeenCalledTimes(1);
    const first = state.settings.updateAudioLayoutElements.mock.calls[0][0];
    expect(first.find((e: { id: string }) => e.id === 'cover').x).toBe(40);
    expect(undo.attributes('disabled')).toBeUndefined();

    await undo.trigger('click');
    const last = state.settings.updateAudioLayoutElements.mock.calls.at(-1)![0];
    expect(last.find((e: { id: string }) => e.id === 'cover').x).toBe(20);
    expect(undo.attributes('disabled')).toBeDefined();
  });

  it('sanitises updates through element constraints', async () => {
    mountEditor();
    panel().vm.$emit('update', 'cover', { x: 200, width: 5 });
    await wrapper!.vm.$nextTick();

    const next = state.settings.updateAudioLayoutElements.mock.calls.at(-1)![0];
    const cover = next.find((e: { id: string }) => e.id === 'cover');
    expect(cover.width).toBe(15);
    expect(cover.x).toBeLessThanOrEqual(85);
  });

  it('restores the opening snapshot on cancel and clears history', async () => {
    mountEditor();
    panel().vm.$emit('update', 'cover', { x: 60 });
    await wrapper!.vm.$nextTick();

    (wrapper!.vm as unknown as { cancel: () => void }).cancel();
    await wrapper!.vm.$nextTick();

    const last = state.settings.updateAudioLayoutElements.mock.calls.at(-1)![0];
    expect(last.find((e: { id: string }) => e.id === 'cover').x).toBe(20);
  });

  it('resets and applies presets with history entries', async () => {
    mountEditor();

    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'audioView.resetLayout')!
      .trigger('click');
    expect(state.settings.resetAudioLayoutPreset).toHaveBeenCalled();

    panel().vm.$emit('apply-preset', 'compact');
    await wrapper!.vm.$nextTick();
    expect(state.settings.applyAudioLayoutPreset).toHaveBeenCalledWith('compact');

    const undo = wrapper!.findAll('button').find((b) => b.text() === 'common.undo')!;
    expect(undo.attributes('disabled')).toBeUndefined();
  });
});

describe('keyboard', () => {
  it('moves the selected element with the arrow keys and clamps bounds', async () => {
    mountEditor();

    keydown({ key: 'ArrowRight' });
    await wrapper!.vm.$nextTick();
    let next = state.settings.updateAudioLayoutElements.mock.calls.at(-1)![0];
    expect(next.find((e: { id: string }) => e.id === 'cover').x).toBe(21);

    keydown({ key: 'ArrowDown', shiftKey: true });
    await wrapper!.vm.$nextTick();
    next = state.settings.updateAudioLayoutElements.mock.calls.at(-1)![0];
    expect(next.find((e: { id: string }) => e.id === 'cover').y).toBe(25);

    keydown({ key: 'ArrowLeft', shiftKey: true });
    await wrapper!.vm.$nextTick();
    next = state.settings.updateAudioLayoutElements.mock.calls.at(-1)![0];
    expect(next.find((e: { id: string }) => e.id === 'cover').x).toBe(16);
  });

  it('prevents the default action for handled keys and ignores others', async () => {
    mountEditor();

    const handled = keydown({ key: 'ArrowRight' });
    expect(handled.defaultPrevented).toBe(true);

    const ignored = keydown({ key: 'a' });
    expect(ignored.defaultPrevented).toBe(false);
  });

  it('undoes with Ctrl+Z and Meta+Z', async () => {
    mountEditor();
    keydown({ key: 'ArrowRight' });
    await wrapper!.vm.$nextTick();
    const calls = state.settings.updateAudioLayoutElements.mock.calls.length;

    const undo = keydown({ key: 'z', ctrlKey: true });
    expect(undo.defaultPrevented).toBe(true);
    await wrapper!.vm.$nextTick();
    const restored = state.settings.updateAudioLayoutElements.mock.calls.at(-1)![0];
    expect(restored.find((e: { id: string }) => e.id === 'cover').x).toBe(20);
    expect(state.settings.updateAudioLayoutElements.mock.calls.length).toBe(calls + 1);

    keydown({ key: 'Z', metaKey: true });
  });

  it('stops handling keys after unmount', async () => {
    mountEditor();
    wrapper!.unmount();
    const calls = state.settings.updateAudioLayoutElements.mock.calls.length;
    keydown({ key: 'ArrowRight' });
    expect(state.settings.updateAudioLayoutElements.mock.calls.length).toBe(calls);
    wrapper = null;
  });
});

describe('dragging', () => {
  it('previews, commits and clears the drag state', async () => {
    mountEditor();
    stubRect();
    const handle = dragHandles()[0];

    await handle.trigger('mousedown', { clientX: 96, clientY: 64 });

    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 240, clientY: 160, shiftKey: true })
    );
    await wrapper!.vm.$nextTick();
    expect(readout()).toContain('50%, 50%');
    expect(readout()).toContain('L2');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(state.settings.updateAudioLayoutElements).toHaveBeenCalledTimes(1);
    const committed = state.settings.updateAudioLayoutElements.mock.calls[0][0];
    const cover = committed.find((e: { id: string }) => e.id === 'cover');
    expect(cover.x).toBe(50);
    expect(cover.y).toBe(50);

    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 400, clientY: 200, shiftKey: true })
    );
    expect(state.settings.updateAudioLayoutElements).toHaveBeenCalledTimes(1);
    handle.trigger('mouseup');
  });

  it('snaps to the grid unless shift is held', async () => {
    mountEditor();
    stubRect();
    const handle = dragHandles()[0];

    await handle.trigger('mousedown', { clientX: 96, clientY: 64 });
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    await wrapper!.vm.$nextTick();
    expect(readout()).toContain('0%, 0%');

    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 1000, clientY: 1000, shiftKey: true })
    );
    await wrapper!.vm.$nextTick();
    expect(readout()).toContain('70%, 70%');

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await wrapper!.vm.$nextTick();
    const cover = state.settings.updateAudioLayoutElements.mock.calls[0][0].find(
      (e: { id: string }) => e.id === 'cover'
    );
    expect(cover.x).toBe(70);
    expect(cover.y).toBe(70);
  });

  it('ignores a drag start for an unknown element', async () => {
    state.settings.appearance.audioLayout.elements = [];
    mountEditor();
    expect(dragHandles()).toHaveLength(0);
  });

  it('does nothing when the preview container is missing', async () => {
    mountEditor();
    const handle = dragHandles()[0];
    const previewEl = preview();
    previewEl.remove();
    await handle.trigger('mousedown', { clientX: 10, clientY: 10 });

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(state.settings.updateAudioLayoutElements).not.toHaveBeenCalled();
  });
});
