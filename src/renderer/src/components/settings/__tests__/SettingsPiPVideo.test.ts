import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  settings: null as any,
  updatePlayback: vi.fn(),
  previewStart: vi.fn(),
  previewStop: vi.fn(),
  previewUpdate: vi.fn(),
  on: vi.fn(),
  remove: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));

const GroupStub = defineComponent({
  name: 'SettingsGroup',
  template: '<div data-testid="group"><slot /></div>'
});
const TitleStub = defineComponent({
  name: 'SettingsSectionTitle',
  props: { title: String },
  template: '<div data-testid="section-title">{{ title }}</div>'
});
const RowStub = defineComponent({
  name: 'SettingsRow',
  props: { label: String },
  template: '<div><span>{{ label }}</span><slot /></div>'
});
const ToggleStub = defineComponent({
  name: 'SettingsToggle',
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  template: '<button data-testid="toggle" @click="$emit(\'update:modelValue\', true)" />'
});
const GridStub = defineComponent({
  name: 'SettingsPositionGrid',
  props: { modelValue: String, options: Array, selectedLabel: String },
  emits: ['update:modelValue'],
  template:
    '<div data-testid="positions" :data-count="options.length" :data-selected="selectedLabel" @click="$emit(\'update:modelValue\', \'top-right\')" />'
});

import SettingsPiPVideo from '../SettingsPiPVideo.vue';

let wrapper: VueWrapper | null = null;
let closedHandler: (() => void) | null = null;

function setup() {
  wrapper = mount(SettingsPiPVideo, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        SettingsSectionTitle: TitleStub,
        SettingsRow: RowStub,
        SettingsToggle: ToggleStub,
        SettingsPositionGrid: GridStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  closedHandler = null;
  h.t.mockClear();
  h.settings = reactive({
    playback: {
      pipPosition: 'bottom-right',
      pipWidth: 480,
      pipHeight: 270,
      pipPreBuffer: false
    },
    updatePlayback: h.updatePlayback
  });
  h.updatePlayback.mockReset();
  h.updatePlayback.mockImplementation((patch: Record<string, unknown>) => {
    Object.assign(h.settings.playback, patch);
  });
  h.previewStart.mockReset();
  h.previewStart.mockResolvedValue(true);
  h.previewStop.mockReset();
  h.previewStop.mockResolvedValue(undefined);
  h.previewUpdate.mockReset();
  h.previewUpdate.mockResolvedValue(undefined);
  h.on.mockReset();
  h.on.mockImplementation((channel: string, handler: () => void) => {
    if (channel === 'pip:previewClosed') closedHandler = handler;
    return h.remove;
  });
  h.remove.mockReset();
  (window as unknown as { api?: unknown }).api = {
    pipPreviewStart: h.previewStart,
    pipPreviewStop: h.previewStop,
    pipPreviewUpdate: h.previewUpdate,
    on: h.on
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  delete (window as unknown as { api?: unknown }).api;
});

function previewButton() {
  return wrapper!.get('[data-testid="pip-video-preview-toggle"]');
}

describe('preview toggle', () => {
  it('starts and stops the preview window', async () => {
    setup();

    expect(previewButton().text()).toBe('settings.showPreview');
    expect(previewButton().attributes('aria-pressed')).toBe('false');

    await previewButton().trigger('click');
    expect(h.previewStart).toHaveBeenCalledWith({
      position: 'bottom-right',
      width: 480,
      height: 270
    });
    expect(previewButton().text()).toBe('settings.closePreview');
    expect(previewButton().attributes('aria-pressed')).toBe('true');

    await previewButton().trigger('click');
    expect(h.previewStop).toHaveBeenCalled();
    expect(previewButton().text()).toBe('settings.showPreview');
  });

  it('stays closed when the preview cannot start', async () => {
    h.previewStart.mockResolvedValue(false);
    setup();

    await previewButton().trigger('click');

    expect(previewButton().text()).toBe('settings.showPreview');
  });

  it('closes when main reports the preview closed', async () => {
    setup();
    await previewButton().trigger('click');
    expect(closedHandler).toBeTypeOf('function');

    closedHandler!();
    await wrapper!.vm.$nextTick();

    expect(previewButton().text()).toBe('settings.showPreview');
  });

  it('works without a preload bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    setup();

    await expect(previewButton().trigger('click')).resolves.toBeUndefined();
    expect(previewButton().text()).toBe('settings.showPreview');
  });
});

describe('playback settings', () => {
  it('renders the position grid and forwards changes', async () => {
    setup();

    const grid = wrapper!.get('[data-testid="positions"]');
    expect(grid.attributes('data-count')).toBe('4');
    expect(grid.attributes('data-selected')).toBe('settings.bottomRight');

    await grid.trigger('click');
    expect(h.updatePlayback).toHaveBeenCalledWith({ pipPosition: 'top-right' });
  });

  it('updates width from the range input', async () => {
    setup();

    const width = wrapper!.get('input[aria-label="settings.width"]');
    (width.element as HTMLInputElement).value = '600';
    await width.trigger('input');

    expect(h.updatePlayback).toHaveBeenCalledWith({ pipWidth: 600 });
  });

  it('updates height from the range input', async () => {
    setup();

    const height = wrapper!.get('input[aria-label="settings.height"]');
    (height.element as HTMLInputElement).value = '340';
    await height.trigger('input');

    expect(h.updatePlayback).toHaveBeenCalledWith({ pipHeight: 340 });
  });

  it('forwards the pre-buffer toggle', async () => {
    setup();

    await wrapper!.get('[data-testid="toggle"]').trigger('click');

    expect(h.updatePlayback).toHaveBeenCalledWith({ pipPreBuffer: true });
  });

  it('pushes live changes to an open preview', async () => {
    setup();
    await previewButton().trigger('click');
    h.previewUpdate.mockClear();

    h.settings.playback.pipWidth = 640;
    await wrapper!.vm.$nextTick();

    expect(h.previewUpdate).toHaveBeenCalledWith({
      position: 'bottom-right',
      width: 640,
      height: 270
    });
  });

  it('does not push changes while the preview is closed', async () => {
    setup();

    h.settings.playback.pipWidth = 640;
    await wrapper!.vm.$nextTick();

    expect(h.previewUpdate).not.toHaveBeenCalled();
  });
});

describe('cleanup', () => {
  it('stops the preview and removes the listener on unmount', async () => {
    setup();
    await previewButton().trigger('click');
    h.previewStop.mockClear();

    wrapper!.unmount();
    wrapper = null;

    expect(h.previewStop).toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalled();
  });

  it('skips stopping a closed preview on unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;

    expect(h.previewStop).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalled();
  });
});
