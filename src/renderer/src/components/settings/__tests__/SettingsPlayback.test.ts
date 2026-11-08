import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import SettingsPlayback from '../SettingsPlayback.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  loudness: null as any,
  readSelect: vi.fn(),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useLoudnessAnalysis', () => ({
  useLoudnessAnalysis: () => state.loudness
}));
vi.mock('@renderer/utils/selectOptions', () => ({ readSelect: state.readSelect }));

const RowStub = defineComponent({
  props: ['label', 'description', 'path', 'anchor', 'wide'],
  template: '<div :data-path="path" :data-description="description"><slot /></div>'
});
const GroupStub = defineComponent({
  props: ['title'],
  template: '<section :data-title="title"><slot /></section>'
});
const ToggleStub = defineComponent({
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" />'
});

let wrapper: VueWrapper | null = null;

function playback(overrides: Record<string, unknown> = {}) {
  return {
    defaultVolume: 0.8,
    replayGainMode: 'track',
    gaplessPlayback: true,
    autoPauseOnFocusLoss: false,
    rememberPosition: true,
    cursorHide: true,
    cursorTimeout: 3,
    resumePromptTimeout: 8,
    playbackSpeed: 1.25,
    videoFilter: 'none',
    visualization: {
      mode: 'bars',
      primaryColor: '#112233',
      secondaryColor: '#445566',
      sensitivity: 0.5
    },
    ...overrides
  };
}

function mountView() {
  wrapper = mount(SettingsPlayback, {
    global: {
      mocks: { $t: (key: string, params?: Record<string, unknown>) => state.t(key, params) },
      stubs: { SettingsRow: RowStub, SettingsGroup: GroupStub, SettingsToggle: ToggleStub }
    }
  });
  return wrapper;
}

function rangeByLabel(label: string) {
  return wrapper!.get(`input[type="range"][aria-label="${label}"]`);
}

function selects() {
  return wrapper!.findAll('select');
}

beforeEach(() => {
  state.settings = reactive({
    playback: playback(),
    updatePlayback: vi.fn()
  });
  state.loudness = {
    running: ref(false),
    current: ref(0),
    total: ref(0),
    error: ref(''),
    result: ref(null),
    analyze: vi.fn(),
    cancel: vi.fn()
  };
  state.readSelect.mockReset();
  state.readSelect.mockImplementation((event: Event, allowed: readonly string[]) => {
    const value = (event.target as HTMLSelectElement).value;
    return allowed.includes(value) ? value : '';
  });
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('volume and speed', () => {
  it('renders the volume percentage and updates the store', async () => {
    mountView();
    const range = rangeByLabel('settings.defaultVolume');
    expect(range.attributes('value')).toBe('80');
    expect(
      wrapper!.get('[data-path="playback.defaultVolume"]').attributes('data-description')
    ).toBe('80%');

    await range.setValue('55');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ defaultVolume: 0.55 });
  });

  it('renders and updates the default playback speed', async () => {
    mountView();
    const range = rangeByLabel('settings.defaultSpeed');
    expect(range.attributes('value')).toBe('1.25');
    expect(
      wrapper!.get('[data-path="playback.playbackSpeed"]').attributes('data-description')
    ).toBe('1.25x');

    await range.setValue('2.5');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ playbackSpeed: 2.5 });
  });
});

describe('replay gain', () => {
  it('renders the mode select and forwards changes', async () => {
    mountView();
    const select = selects()[0];
    expect(select.attributes('value')).toBe('track');
    expect(select.findAll('option')).toHaveLength(3);

    await select.setValue('album');
    expect(state.readSelect).toHaveBeenCalled();
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ replayGainMode: 'album' });
  });

  it('analyzes loudness when idle', async () => {
    mountView();
    const button = wrapper!.get('[data-testid="analyze-loudness"]');
    expect(button.text()).toContain('settings.analyzeLoudness');
    await button.trigger('click');
    expect(state.loudness.analyze).toHaveBeenCalled();
    expect(wrapper!.find('[data-testid="cancel-loudness"]').exists()).toBe(false);
  });

  it('shows progress and cancels while running', async () => {
    state.loudness.running.value = true;
    state.loudness.current.value = 3;
    state.loudness.total.value = 4;
    mountView();

    expect(wrapper!.text()).toContain('3 / 4');
    const progress = wrapper!.get('[role="progressbar"]');
    expect(progress.attributes('aria-valuenow')).toBe('75');
    expect(progress.attributes('style')).toContain('width: 75%');

    await wrapper!.get('[data-testid="cancel-loudness"]').trigger('click');
    expect(state.loudness.cancel).toHaveBeenCalled();
  });

  it('clamps progress to 100 and guards a zero total', async () => {
    state.loudness.running.value = true;
    state.loudness.current.value = 10;
    state.loudness.total.value = 5;
    mountView();
    expect(wrapper!.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');

    state.loudness.total.value = 0;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('0');
  });

  it('renders the analysis error', () => {
    state.loudness.error.value = 'ffmpeg missing';
    mountView();
    expect(wrapper!.get('[data-testid="loudness-error"]').text()).toContain('ffmpeg missing');
    expect(wrapper!.find('[data-testid="loudness-done"]').exists()).toBe(false);
  });

  it('renders the completion summary', () => {
    state.loudness.result.value = { analyzed: 12, albums: 3, updated: 9 };
    mountView();
    const done = wrapper!.get('[data-testid="loudness-done"]');
    expect(done.text()).toContain('settings.analyzeLoudnessDone');
    expect(done.text()).toContain('12');
    expect(done.text()).toContain('3');
    expect(done.text()).toContain('9');
    expect(wrapper!.find('[data-testid="loudness-limited"]').exists()).toBe(false);
  });

  it('marks aborted or truncated analyses as limited', async () => {
    state.loudness.result.value = { analyzed: 1, albums: 0, updated: 0, aborted: true };
    mountView();
    expect(wrapper!.find('[data-testid="loudness-limited"]').exists()).toBe(true);

    state.loudness.result.value = { analyzed: 1, albums: 0, updated: 0, truncated: true };
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="loudness-limited"]').exists()).toBe(true);

    state.loudness.result.value = { analyzed: 1, albums: 0, updated: 0 };
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="loudness-limited"]').exists()).toBe(false);
  });

  it('hides the limited note while running', () => {
    state.loudness.result.value = { analyzed: 1, albums: 0, updated: 0, aborted: true };
    state.loudness.running.value = true;
    mountView();
    expect(wrapper!.find('[data-testid="loudness-limited"]').exists()).toBe(false);
  });
});

describe('toggles and conditional groups', () => {
  it('renders all toggles with their current values and forwards changes', async () => {
    mountView();
    const toggles = wrapper!.findAllComponents(ToggleStub);
    expect(toggles).toHaveLength(4);
    expect(toggles.map((t) => t.props('modelValue'))).toEqual([true, false, true, true]);

    toggles[0].vm.$emit('update:modelValue', false);
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ gaplessPlayback: false });
    toggles[1].vm.$emit('update:modelValue', true);
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ autoPauseOnFocusLoss: true });
    expect(state.t.mock.calls.some((call) => call[0] === 'settings.gapless')).toBe(true);
  });

  it('shows the cursor timeout only when cursor hiding is enabled', async () => {
    mountView();
    const group = wrapper!
      .findAll('section')
      .find((s) => (s.attributes('data-title') || '').includes('settings.cursorHideTimeout'));
    expect(group).toBeDefined();
    expect(group!.attributes('data-title')).toContain('3s');

    await rangeByLabel('settings.cursorHideTimeout').setValue('7');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ cursorTimeout: 7 });

    state.settings.playback.cursorHide = false;
    await wrapper!.vm.$nextTick();
    expect(
      wrapper!
        .findAll('section')
        .some((s) => (s.attributes('data-title') || '').includes('cursorHideTimeout'))
    ).toBe(false);
  });

  it('shows the resume prompt timeout only when remembering position', async () => {
    mountView();
    const group = wrapper!
      .findAll('section')
      .find((s) => (s.attributes('data-title') || '').includes('settings.resumePromptTimeout'));
    expect(group!.attributes('data-title')).toContain('8s');

    await rangeByLabel('settings.resumePromptTimeout').setValue('12');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ resumePromptTimeout: 12 });

    state.settings.playback.rememberPosition = false;
    await wrapper!.vm.$nextTick();
    expect(
      wrapper!
        .findAll('section')
        .some((s) => (s.attributes('data-title') || '').includes('resumePromptTimeout'))
    ).toBe(false);
  });
});

describe('video filter and visualization', () => {
  it('renders every video filter and updates the choice', async () => {
    mountView();
    const filter = selects()[1];
    expect(filter.findAll('option')).toHaveLength(9);
    expect(filter.attributes('value')).toBe('none');

    await filter.setValue('sepia(80%)');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({ videoFilter: 'sepia(80%)' });
  });

  it('updates the visualization mode while preserving the rest', async () => {
    mountView();
    const mode = selects()[2];
    expect(mode.findAll('option')).toHaveLength(9);
    expect(mode.attributes('value')).toBe('bars');

    await mode.setValue('rings');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: {
        mode: 'rings',
        primaryColor: '#112233',
        secondaryColor: '#445566',
        sensitivity: 0.5
      }
    });
  });

  it('updates the primary and secondary colours independently', async () => {
    mountView();
    const colors = wrapper!.findAll('input[type="color"]');
    expect(colors).toHaveLength(2);
    expect(colors[0].attributes('value')).toBe('#112233');

    await colors[0].setValue('#ffffff');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: {
        mode: 'bars',
        primaryColor: '#ffffff',
        secondaryColor: '#445566',
        sensitivity: 0.5
      }
    });

    await colors[1].setValue('#000000');
    expect(state.settings.updatePlayback).toHaveBeenLastCalledWith({
      visualization: {
        mode: 'bars',
        primaryColor: '#112233',
        secondaryColor: '#000000',
        sensitivity: 0.5
      }
    });
  });

  it('updates the sensitivity and shows its current value', async () => {
    mountView();
    const ranges = wrapper!.findAll('input[type="range"]');
    const sensitivity = ranges[ranges.length - 1];
    expect(wrapper!.text()).toContain('0.5');

    await sensitivity.setValue('0.9');
    expect(state.settings.updatePlayback).toHaveBeenCalledWith({
      visualization: {
        mode: 'bars',
        primaryColor: '#112233',
        secondaryColor: '#445566',
        sensitivity: 0.9
      }
    });
  });
});
