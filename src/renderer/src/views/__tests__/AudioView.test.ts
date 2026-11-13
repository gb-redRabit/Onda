import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, reactive, ref } from 'vue';

const state = vi.hoisted(() => ({
  player: null as any,
  settings: null as any,
  plugins: null as any,
  audioEngine: { clearSavedPosition: vi.fn() },
  audio: { seek: vi.fn(), play: vi.fn() },
  isCoreShell: vi.fn(() => false),
  nextVizMode: vi.fn(() => 'next-mode'),
  drag: null as any,
  immersive: null as any,
  immersiveOptions: null as any,
  dialogFocus: vi.fn(),
  resumeOptions: null as any,
  resume: null as any,
  pinned: null as any,
  togglePin: vi.fn(),
  cancel: vi.fn(),
  setPlaybackPosition: vi.fn(),
  clearPlaybackPosition: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/stores/plugins', () => ({ usePluginsStore: () => state.plugins }));
vi.mock('@renderer/modules/audioEngine', () => ({ audioEngine: state.audioEngine }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => state.audio }));
vi.mock('@renderer/utils/runtimeMode', () => ({ isCoreShell: state.isCoreShell }));
vi.mock('@renderer/utils/audioVisualizer', () => ({ nextVizMode: state.nextVizMode }));
vi.mock('@renderer/composables/useAudioElementDrag', () => ({
  useAudioElementDrag: () => state.drag
}));
vi.mock('@renderer/composables/useAudioImmersive', () => ({
  useAudioImmersive: (options: any) => {
    state.immersiveOptions = options;
    return state.immersive;
  }
}));
vi.mock('@renderer/composables/useDialogFocus', () => ({
  useDialogFocus: (...args: any[]) => state.dialogFocus(...args)
}));
vi.mock('@renderer/composables/useResumePrompt', () => ({
  useResumePrompt: (options: any) => {
    state.resumeOptions = options;
    return state.resume;
  }
}));
vi.mock('@renderer/composables/useAlwaysOnTop', () => ({
  useAlwaysOnTop: () => ({
    get pinned() {
      return state.pinned;
    },
    togglePin: state.togglePin
  })
}));

vi.mock('@renderer/components/audio/AudioLayoutEditor.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    __esModule: true,
    default: defineComponent({
      name: 'AudioLayoutEditorMock',
      setup(_props, { expose }) {
        expose({ cancel: state.cancel });
        return () => h('div', { 'data-testid': 'layout-editor' });
      }
    })
  };
});

const LayoutEditorStub = defineComponent({
  name: 'AudioLayoutEditorStub',
  setup(_props, { expose }) {
    expose({ cancel: state.cancel });
    return () => h('div', { 'data-testid': 'layout-editor' });
  }
});

const ResumeStub = defineComponent({
  name: 'ResumePromptStub',
  props: { position: Number },
  emits: ['continue', 'start', 'pause', 'resume'],
  template: `<div data-testid="resume-prompt">
    <button data-testid="resume-continue" @click="$emit('continue')" />
    <button data-testid="resume-start" @click="$emit('start')" />
    <button data-testid="resume-pause" @click="$emit('pause')" />
    <button data-testid="resume-resume" @click="$emit('resume')" />
  </div>`
});
const CanvasStub = defineComponent({
  name: 'AudioCanvasElementsStub',
  props: { elements: Array, dragPos: Object, isFullscreen: Boolean, uiVisible: Boolean },
  emits: ['element-mousedown', 'element-keydown'],
  template: `<div data-testid="canvas">
    <button data-testid="canvas-down" @click="$emit('element-mousedown', { id: 'el' }, { x: 1 })" />
    <button data-testid="canvas-key" @click="$emit('element-keydown', { id: 'el' }, { key: 'ArrowRight' })" />
  </div>`
});
const PluginSlotStub = defineComponent({
  name: 'PluginUiSlotStub',
  props: { slotId: String, visible: Boolean },
  template: '<div data-testid="plugin-slot" :data-visible="visible" />'
});
const ToolbarStub = defineComponent({
  name: 'AudioHudToolbarStub',
  props: {
    layoutEditorOpen: Boolean,
    vizSettingsOpen: Boolean,
    visible: Boolean,
    hudOpacity: Number,
    isFullscreen: Boolean,
    vizMode: String,
    commands: Array,
    pinned: Boolean
  },
  emits: [
    'update:layoutEditorOpen',
    'update:vizSettingsOpen',
    'cycle-viz',
    'toggle-fullscreen',
    'toggle-pin',
    'run-command'
  ],
  template: `<div data-testid="toolbar">
    <button data-testid="toolbar-layout" @click="$emit('update:layoutEditorOpen', true)" />
    <button data-testid="toolbar-viz" @click="$emit('update:vizSettingsOpen', true)" />
    <button data-testid="toolbar-cycle" @click="$emit('cycle-viz')" />
    <button data-testid="toolbar-fullscreen" @click="$emit('toggle-fullscreen')" />
    <button data-testid="toolbar-pin" @click="$emit('toggle-pin')" />
    <button data-testid="toolbar-command" @click="$emit('run-command', { id: 'cmd' })" />
  </div>`
});
const VizSettingsStub = defineComponent({
  name: 'AudioVizSettingsStub',
  emits: ['close'],
  template: '<button data-testid="viz-close" @click="$emit(\'close\')" />'
});
const PageHeaderStub = defineComponent({
  name: 'PageHeaderStub',
  props: { title: String, compact: Boolean },
  template: '<header><span>{{ title }}</span><slot name="actions" /></header>'
});
const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: { variant: String, size: String },
  template: '<button><slot /></button>'
});

const stubs = {
  ResumePrompt: ResumeStub,
  AudioCanvasElements: CanvasStub,
  PluginUiSlot: PluginSlotStub,
  AudioHudToolbar: ToolbarStub,
  AudioVizSettings: VizSettingsStub,
  AudioLayoutEditor: LayoutEditorStub,
  PageHeader: PageHeaderStub,
  Button: ButtonStub
};

import AudioView from '../AudioView.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(AudioView, {
    global: { stubs, mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  state.player = reactive({ currentTrack: null as any, currentTime: 0, resumePrompt: null as any });
  state.settings = reactive({
    playback: { visualization: { mode: 'bars' } },
    appearance: { audioLayout: { elements: [{ id: 'el-1' }], hudOpacity: 80 } },
    updatePlayback: vi.fn()
  });
  state.plugins = {
    commandsIn: vi.fn(() => [{ id: 'cmd' }]),
    dispatchCommand: vi.fn()
  };
  state.drag = {
    dragging: ref(false),
    dragPos: ref({ x: 1, y: 2 }),
    onElementMouseDown: vi.fn(),
    onDragMouseMove: vi.fn(),
    onDragMouseUp: vi.fn(),
    onElementKeydown: vi.fn()
  };
  state.immersive = {
    setViewEl: vi.fn(),
    showUI: ref(true),
    isFullscreen: ref(false),
    onMouseMove: vi.fn(),
    toggleFullscreen: vi.fn()
  };
  state.resume = {
    pause: vi.fn(),
    resume: vi.fn(),
    onContinue: vi.fn(() => state.resumeOptions.onContinue({ path: 'D:/a.mp3', position: 42 })),
    onStart: vi.fn(() => state.resumeOptions.onStart({ path: 'D:/a.mp3', position: 42 }))
  };
  state.pinned = ref(false);
  state.togglePin.mockReset();
  state.cancel.mockReset();
  state.setPlaybackPosition.mockReset();
  state.clearPlaybackPosition.mockReset();
  state.audioEngine.clearSavedPosition.mockReset();
  state.isCoreShell.mockReturnValue(false);
  state.nextVizMode.mockReset();
  state.nextVizMode.mockReturnValue('next-mode');
  state.plugins.commandsIn.mockClear();
  state.audio.seek.mockClear();
  state.audio.play.mockClear();
  state.dialogFocus.mockClear();
  (window as unknown as { api?: unknown }).api = {
    setPlaybackPosition: state.setPlaybackPosition,
    clearPlaybackPosition: state.clearPlaybackPosition
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('empty state', () => {
  it('shows a placeholder without a track', () => {
    setup();
    expect(wrapper!.find('[data-testid="audio-empty"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('audioView.noTrackTitle');
  });

  it('hides it once playback starts', () => {
    state.player.currentTrack = { id: 't1' };
    setup();
    expect(wrapper!.find('[data-testid="audio-empty"]').exists()).toBe(false);
  });
});

describe('canvas and toolbar', () => {
  it('passes layout state to the canvas', async () => {
    setup();

    const canvas = wrapper!.getComponent(CanvasStub);
    expect(canvas.props()).toMatchObject({
      elements: [{ id: 'el-1' }],
      dragPos: { x: 1, y: 2 },
      isFullscreen: false,
      uiVisible: true
    });

    await wrapper!.get('[data-testid="canvas-down"]').trigger('click');
    await wrapper!.get('[data-testid="canvas-key"]').trigger('click');
    expect(state.drag.onElementMouseDown).toHaveBeenCalledWith({ id: 'el' }, { x: 1 });
    expect(state.drag.onElementKeydown).toHaveBeenCalledWith({ id: 'el' }, { key: 'ArrowRight' });
  });

  it('derives HUD values and forwards toolbar actions', async () => {
    state.drag.dragging.value = false;
    setup();

    const toolbar = wrapper!.getComponent(ToolbarStub);
    expect(toolbar.props()).toMatchObject({
      hudOpacity: 0.8,
      vizMode: 'bars',
      visible: true,
      commands: [{ id: 'cmd' }],
      pinned: false
    });
    expect(state.plugins.commandsIn).toHaveBeenCalledWith('audio-view');

    await wrapper!.get('[data-testid="toolbar-cycle"]').trigger('click');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: { mode: 'next-mode' }
    });
    expect(state.nextVizMode).toHaveBeenCalledWith('bars');

    await wrapper!.get('[data-testid="toolbar-fullscreen"]').trigger('click');
    await wrapper!.get('[data-testid="toolbar-pin"]').trigger('click');
    await wrapper!.get('[data-testid="toolbar-command"]').trigger('click');

    expect(state.immersive.toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(state.togglePin).toHaveBeenCalledTimes(1);
    expect(state.plugins.dispatchCommand).toHaveBeenCalledWith({ id: 'cmd' });
  });

  it('tracks pointer movement and drag release', async () => {
    setup();

    await wrapper!.get('[data-testid="audio-view"]').trigger('mousemove');
    await wrapper!.get('[data-testid="audio-view"]').trigger('mouseup');

    expect(state.immersive.onMouseMove).toHaveBeenCalled();
    expect(state.drag.onDragMouseUp).toHaveBeenCalled();
  });

  it('registers the view element', () => {
    setup();
    const [element] = state.immersive.setViewEl.mock.calls[0];
    expect(element).toBe(wrapper!.get('[data-testid="audio-view"]').element);
  });

  it('exposes immersive callbacks for drag state, moves and HUD hold', async () => {
    setup();
    const options = state.immersiveOptions;

    expect(options.isDragging()).toBe(false);
    state.drag.dragging.value = true;
    expect(options.isDragging()).toBe(true);

    const event = { clientX: 5 };
    options.onDragMove(event);
    expect(state.drag.onDragMouseMove).toHaveBeenCalledWith(event);
    expect(options.holdUI()).toBe(false);

    await wrapper!.get('[data-testid="toolbar-viz"]').trigger('click');
    expect(options.holdUI()).toBe(true);
  });

  it('falls back to no elements and full HUD opacity without a layout', () => {
    state.settings.appearance.audioLayout = undefined;
    setup();

    expect(wrapper!.getComponent(CanvasStub).props('elements')).toEqual([]);
    expect(wrapper!.getComponent(ToolbarStub).props('hudOpacity')).toBe(1);
  });
});

describe('layout editor', () => {
  async function open() {
    setup();
    await wrapper!.get('[data-testid="toolbar-layout"]').trigger('click');
    await flush();
  }

  it('opens lazily and hides other overlays', async () => {
    await open();

    expect(wrapper!.find('[data-testid="layout-editor"]').exists()).toBe(true);
    expect(wrapper!.get('[role="dialog"]').attributes('aria-label')).toBe('audioView.layoutEditor');
    expect(wrapper!.getComponent(PluginSlotStub).props('visible')).toBe(false);
  });

  it('cancels and closes', async () => {
    await open();

    const cancel = wrapper!.findAll('button').find((button) => button.text() === 'common.cancel')!;
    await cancel.trigger('click');

    expect(state.cancel).toHaveBeenCalledTimes(1);
    expect(wrapper!.find('[data-testid="layout-editor"]').exists()).toBe(false);
  });

  it('closes with the done button', async () => {
    await open();

    const done = wrapper!
      .findAll('button')
      .find((button) => button.text() === 'audioView.layoutDone')!;
    await done.trigger('click');

    expect(wrapper!.find('[data-testid="layout-editor"]').exists()).toBe(false);
  });

  it('registers escape handling', async () => {
    await open();
    const [, options] = state.dialogFocus.mock.calls[0];

    expect(options.closeOnEscape).toBe(true);
    options.onEscape();
    await flush();

    expect(state.cancel).toHaveBeenCalledTimes(1);
    expect(wrapper!.find('[data-testid="layout-editor"]').exists()).toBe(false);
  });

  it('cancels safely before the lazy component mounted', async () => {
    setup();
    const [, options] = state.dialogFocus.mock.calls[0];

    expect(() => options.onEscape()).not.toThrow();
  });

  it('loads the lazy editor chunk when first opened', async () => {
    const { AudioLayoutEditor: _omit, ...otherStubs } = stubs;
    wrapper = mount(AudioView, {
      global: {
        stubs: otherStubs,
        mocks: { $t: (key: string) => key }
      }
    });

    await wrapper.get('[data-testid="toolbar-layout"]').trigger('click');
    await flush();
    await flush();

    expect(wrapper.find('[data-testid="layout-editor"]').exists()).toBe(true);
  });
});

describe('visualization settings', () => {
  it('opens, follows HUD visibility and closes', async () => {
    setup();
    await wrapper!.get('[data-testid="toolbar-viz"]').trigger('click');

    const panel = () => wrapper!.get('[data-testid="viz-close"]').element.parentElement;
    expect(panel()).toBeTruthy();

    state.immersive.showUI.value = false;
    await wrapper!.vm.$nextTick();
    expect(panel()!.className).toContain('opacity-0');

    state.immersive.showUI.value = true;
    await wrapper!.vm.$nextTick();
    expect(panel()!.className).toContain('opacity-100');

    await wrapper!.get('[data-testid="viz-close"]').trigger('click');
    expect(wrapper!.find('[data-testid="viz-close"]').exists()).toBe(false);
  });

  it('is hidden while the layout editor is open', async () => {
    setup();
    await wrapper!.get('[data-testid="toolbar-viz"]').trigger('click');
    expect(wrapper!.find('[data-testid="viz-close"]').exists()).toBe(true);

    await wrapper!.get('[data-testid="toolbar-layout"]').trigger('click');
    await flush();

    expect(wrapper!.find('[data-testid="viz-close"]').exists()).toBe(false);
  });
});

describe('resume prompt', () => {
  it('renders the saved position and forwards controls', async () => {
    state.player.resumePrompt = { path: 'D:/a.mp3', position: 42 };
    setup();

    expect(wrapper!.find('[data-testid="resume-prompt"]').exists()).toBe(true);
    expect(wrapper!.getComponent(ResumeStub).props('position')).toBe(42);

    await wrapper!.get('[data-testid="resume-pause"]').trigger('click');
    await wrapper!.get('[data-testid="resume-resume"]').trigger('click');
    expect(state.resume.pause).toHaveBeenCalledTimes(1);
    expect(state.resume.resume).toHaveBeenCalledTimes(1);
  });

  it('continues from the saved position', async () => {
    state.player.resumePrompt = { path: 'D:/a.mp3', position: 42 };
    setup();

    await wrapper!.get('[data-testid="resume-continue"]').trigger('click');

    expect(state.audio.seek).toHaveBeenCalledWith(42);
    expect(state.player.currentTime).toBe(42);
    expect(state.audio.play).toHaveBeenCalledTimes(1);
    expect(state.setPlaybackPosition).toHaveBeenCalledWith('D:/a.mp3', 42);
  });

  it('starts over and clears the saved position', async () => {
    state.player.resumePrompt = { path: 'D:/a.mp3', position: 42 };
    setup();

    await wrapper!.get('[data-testid="resume-start"]').trigger('click');

    expect(state.clearPlaybackPosition).toHaveBeenCalledWith('D:/a.mp3');
    expect(state.audioEngine.clearSavedPosition).toHaveBeenCalledWith('D:/a.mp3');
  });

  it('skips the engine reset in the core shell', async () => {
    state.isCoreShell.mockReturnValue(true);
    state.player.resumePrompt = { path: 'D:/a.mp3', position: 42 };
    setup();

    await wrapper!.get('[data-testid="resume-start"]').trigger('click');

    expect(state.audioEngine.clearSavedPosition).not.toHaveBeenCalled();
  });
});
