import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import SettingsPiPAudio from '../SettingsPiPAudio.vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  audioPipPreviewStart: vi.fn(),
  audioPipPreviewStop: vi.fn(),
  audioPipPreviewUpdate: vi.fn(),
  t: vi.fn((key: string) => key),
  isEdge: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@shared/types/pip', () => ({
  getAudioPipSize: () => ({ width: 320, height: 80 }),
  isAudioPipEdgeDock: state.isEdge
}));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));

const GroupStub = { props: ['title', 'description'], template: '<div><slot /></div>' };
const TitleStub = { props: ['title'], template: '<div class="title">{{ title }}</div>' };
const RowStub = {
  props: ['label', 'description'],
  template: '<div class="row">{{ label }}<slot /></div>'
};
const ToggleStub = {
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  template:
    '<button class="toggle" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />'
};

let wrapper: VueWrapper | null = null;

function appearance(overrides: Record<string, unknown> = {}) {
  return {
    audioPipDock: 'bottom-right',
    audioPipCornerElements: ['cover', 'trackInfo', 'controls'],
    audioPipEdgeElements: ['cover', 'controls', 'progress'],
    audioPipAutoShow: true,
    audioPipAutoHide: true,
    ...overrides
  };
}

function mountSettings() {
  wrapper = mount(SettingsPiPAudio, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: GroupStub,
        SettingsSectionTitle: TitleStub,
        SettingsRow: RowStub,
        SettingsToggle: ToggleStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function dockButton(id: string) {
  return wrapper!.get(`button[title="${id}"]`);
}

function toggles() {
  return wrapper!.findAllComponents(ToggleStub);
}

beforeEach(() => {
  state.isEdge.mockReset();
  state.isEdge.mockImplementation((dock: string) =>
    ['top', 'bottom', 'left', 'right'].includes(dock)
  );
  state.settings = reactive({
    appearance: appearance(),
    updateAppearance: vi.fn((patch: Record<string, unknown>) => {
      Object.assign(state.settings.appearance, patch);
    })
  });
  state.audioPipPreviewStart.mockReset();
  state.audioPipPreviewStart.mockResolvedValue(true);
  state.audioPipPreviewStop.mockReset();
  state.audioPipPreviewStop.mockResolvedValue(true);
  state.audioPipPreviewUpdate.mockReset();
  state.audioPipPreviewUpdate.mockResolvedValue(true);
  state.t.mockClear();
  (window as { api?: unknown }).api = {
    audioPipPreviewStart: state.audioPipPreviewStart,
    audioPipPreviewStop: state.audioPipPreviewStop,
    audioPipPreviewUpdate: state.audioPipPreviewUpdate
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('dock selection and size', () => {
  it('renders all dock positions and highlights the active one', async () => {
    mountSettings();
    await flush();

    for (const id of [
      'top-left',
      'top',
      'top-right',
      'left',
      'right',
      'bottom-left',
      'bottom',
      'bottom-right'
    ]) {
      expect(wrapper!.findAll(`button[title="${id}"]`)).toHaveLength(1);
    }
    expect(dockButton('bottom-right').classes()).toContain('border-primary');
    expect(dockButton('top').classes()).not.toContain('border-primary');
    expect(wrapper!.text()).toContain('320 × 80px');
  });

  it('updates the dock on click', async () => {
    mountSettings();
    await flush();
    await dockButton('left').trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ audioPipDock: 'left' });
    expect(dockButton('left').classes()).toContain('border-primary');
  });

  it('derives edge size hints for each dock side', async () => {
    state.settings.appearance.audioPipDock = 'top';
    mountSettings();
    await flush();
    expect(wrapper!.text()).toContain('100% × 80px');

    state.settings.appearance.audioPipDock = 'left';
    await flush();
    expect(wrapper!.text()).toContain('320px × 100%');
  });

  it('enables auto-hide only for edge docks', async () => {
    mountSettings();
    await flush();
    expect(toggles()[1].props('disabled')).toBe(true);

    state.settings.appearance.audioPipDock = 'top';
    await flush();
    expect(toggles()[1].props('disabled')).toBe(false);
  });
});

describe('elements', () => {
  it('uses the corner list for corner docks and toggles membership', async () => {
    mountSettings();
    await flush();

    const cover = wrapper!.findAll('button').find((b) => b.text() === 'settings.audioPipEl_cover')!;
    expect(cover.classes()).toContain('border-primary');

    await cover.trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      audioPipCornerElements: ['trackInfo', 'controls']
    });
    expect(cover.classes()).not.toContain('border-primary');

    await cover.trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenLastCalledWith({
      audioPipCornerElements: ['trackInfo', 'controls', 'cover']
    });
  });

  it('uses the edge list for edge docks', async () => {
    state.settings.appearance.audioPipDock = 'right';
    mountSettings();
    await flush();

    const progress = wrapper!
      .findAll('button')
      .find((b) => b.text() === 'settings.audioPipEl_progress')!;
    expect(progress.classes()).toContain('border-primary');
    await progress.trigger('click');
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({
      audioPipEdgeElements: ['cover', 'controls']
    });
  });

  it('updates auto-show and auto-hide toggles', async () => {
    mountSettings();
    await flush();

    toggles()[0].vm.$emit('update:modelValue', false);
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ audioPipAutoShow: false });
    toggles()[1].vm.$emit('update:modelValue', false);
    expect(state.settings.updateAppearance).toHaveBeenCalledWith({ audioPipAutoHide: false });
  });
});

describe('preview', () => {
  it('starts and stops the audio PiP preview', async () => {
    mountSettings();
    await flush();
    const button = wrapper!.findAll('button').find((b) => b.text() === 'settings.showPreview')!;

    await button.trigger('click');
    await flush();
    expect(state.audioPipPreviewStart).toHaveBeenCalledWith({
      dock: 'bottom-right',
      cornerElements: ['cover', 'trackInfo', 'controls'],
      edgeElements: ['cover', 'controls', 'progress'],
      autoHide: true
    });
    expect(wrapper!.text()).toContain('settings.closePreview');

    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'settings.closePreview')!
      .trigger('click');
    await flush();
    expect(state.audioPipPreviewStop).toHaveBeenCalled();
    expect(wrapper!.text()).toContain('settings.showPreview');
  });

  it('keeps the preview closed when start fails', async () => {
    state.audioPipPreviewStart.mockResolvedValueOnce(false);
    mountSettings();
    await flush();
    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'settings.showPreview')!
      .trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('settings.showPreview');
  });

  it('updates a running preview when appearance changes', async () => {
    mountSettings();
    await flush();
    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'settings.showPreview')!
      .trigger('click');
    await flush();
    state.audioPipPreviewUpdate.mockClear();

    state.settings.appearance.audioPipDock = 'top';
    await flush();
    expect(state.audioPipPreviewUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ dock: 'top', autoHide: true })
    );
  });

  it('does not update or stop a closed preview', async () => {
    mountSettings();
    await flush();
    state.settings.appearance.audioPipAutoHide = false;
    await flush();
    expect(state.audioPipPreviewUpdate).not.toHaveBeenCalled();

    wrapper!.unmount();
    wrapper = null;
    expect(state.audioPipPreviewStop).not.toHaveBeenCalled();
  });

  it('stops the preview on unmount when it was running', async () => {
    mountSettings();
    await flush();
    await wrapper!
      .findAll('button')
      .find((b) => b.text() === 'settings.showPreview')!
      .trigger('click');
    await flush();

    wrapper!.unmount();
    wrapper = null;
    expect(state.audioPipPreviewStop).toHaveBeenCalled();
  });
});
