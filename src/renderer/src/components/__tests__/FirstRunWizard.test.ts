import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  ),
  library: null as any,
  ui: null as any,
  settings: null as any,
  dialogOptions: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useDialogFocus', () => ({
  useDialogFocus: (_ref: unknown, options: unknown) => {
    state.dialogOptions = options;
  }
}));

const StepStub = defineComponent({
  name: 'WizardStepStub',
  props: { scanNow: Boolean },
  emits: ['update:scan-now'],
  template:
    '<div data-testid="step"><button data-testid="step-scan-off" @click="$emit(\'update:scan-now\', false)" /></div>'
});

const stepStubs = {
  WizardWelcome: StepStub,
  WizardLibrary: StepStub,
  WizardDownload: StepStub,
  WizardOnline: StepStub,
  WizardAppearance: StepStub,
  WizardAudio: StepStub,
  WizardPip: StepStub,
  WizardDependencies: StepStub,
  WizardSummary: StepStub
};

import FirstRunWizard from '../FirstRunWizard.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(FirstRunWizard, {
    global: { stubs: stepStubs }
  });
  return wrapper;
}

function next() {
  return wrapper!.get('[data-testid="wizard-next"]');
}

function body() {
  return wrapper!.get('[data-testid="wizard-step-body"]');
}

beforeEach(() => {
  state.t.mockClear();
  state.library = { folders: ['D:/music'], scanFolders: vi.fn(async () => undefined) };
  state.ui = { notify: vi.fn() };
  state.settings = { updateGeneral: vi.fn() };
  state.dialogOptions = null;
  localStorage.clear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('navigation', () => {
  it('starts on the first step with back disabled', () => {
    setup();

    expect(body().attributes('data-step')).toBe('0');
    expect(wrapper!.get('[data-testid="wizard-progress"]').attributes('style')).toContain(
      'width: 11%'
    );
    expect(wrapper!.text()).toContain('wizard.step:{"current":1,"total":9}');
    expect(wrapper!.get('[data-testid="wizard-back"]').attributes('disabled')).toBeDefined();
    expect(next().text()).toContain('wizard.next');
  });

  it('advances and goes back', async () => {
    setup();

    await next().trigger('click');
    expect(body().attributes('data-step')).toBe('1');
    expect(wrapper!.get('[data-testid="wizard-progress"]').attributes('style')).toContain(
      'width: 22%'
    );
    expect(wrapper!.get('[data-testid="wizard-back"]').attributes('disabled')).toBeUndefined();

    await wrapper!.get('[data-testid="wizard-back"]').trigger('click');
    expect(body().attributes('data-step')).toBe('0');

    await wrapper!.get('[data-testid="wizard-back"]').trigger('click');
    expect(body().attributes('data-step')).toBe('0');
  });

  it('passes scanNow to the library and summary steps', async () => {
    setup();
    const step = () => wrapper!.getComponent(StepStub);

    expect(step().props('scanNow')).toBe(false);

    await next().trigger('click');
    expect(step().props('scanNow')).toBe(true);

    for (let i = 0; i < 7; i++) await next().trigger('click');
    expect(body().attributes('data-step')).toBe('8');
    expect(step().props('scanNow')).toBe(true);
    expect(next().text()).toContain('wizard.start');
  });

  it('tracks the scan toggle from the child step', async () => {
    setup();
    await next().trigger('click');

    await wrapper!.get('[data-testid="step-scan-off"]').trigger('click');

    expect(wrapper!.getComponent(StepStub).props('scanNow')).toBe(false);
  });
});

describe('finishing', () => {
  it('marks the wizard done, scans and notifies', async () => {
    setup();
    for (let i = 0; i < 8; i++) await next().trigger('click');

    await next().trigger('click');

    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ firstRunDone: true });
    expect(localStorage.getItem('onda-first-run-done')).toBe('1');
    expect(state.library.scanFolders).toHaveBeenCalledTimes(1);
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'wizard.done');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('skips scanning when disabled', async () => {
    setup();
    await next().trigger('click');
    await wrapper!.get('[data-testid="step-scan-off"]').trigger('click');
    for (let i = 0; i < 8; i++) await next().trigger('click');

    expect(state.library.scanFolders).not.toHaveBeenCalled();
  });

  it('skips scanning without library folders', async () => {
    state.library.folders = [];
    setup();
    for (let i = 0; i < 9; i++) await next().trigger('click');

    expect(state.library.scanFolders).not.toHaveBeenCalled();
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('tolerates storage failures', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    setup();
    for (let i = 0; i < 9; i++) await next().trigger('click');

    expect(state.settings.updateGeneral).toHaveBeenCalled();
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('skips everything from the footer', async () => {
    setup();

    await wrapper!.get('[data-testid="wizard-skip"]').trigger('click');

    expect(state.settings.updateGeneral).toHaveBeenCalledWith({ firstRunDone: true });
    expect(localStorage.getItem('onda-first-run-done')).toBe('1');
    expect(state.ui.notify).not.toHaveBeenCalled();
    expect(state.library.scanFolders).not.toHaveBeenCalled();
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });
});

describe('dismissing', () => {
  it('closes without marking done from the X button', async () => {
    setup();
    await wrapper!.get('[data-testid="wizard-close"]').trigger('click');

    expect(wrapper!.emitted('close')).toHaveLength(1);
    expect(state.settings.updateGeneral).not.toHaveBeenCalled();
    expect(localStorage.getItem('onda-first-run-done')).toBeNull();
  });

  it('closes on a backdrop click only', async () => {
    setup();
    await wrapper!.get('[data-testid="wizard"]').trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);

    await wrapper!.get('[role="dialog"]').trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('closes on escape through the focus trap', () => {
    setup();

    expect(state.dialogOptions).toMatchObject({ closeOnEscape: true });
    state.dialogOptions.onEscape();

    expect(wrapper!.emitted('close')).toHaveLength(1);
    expect(state.settings.updateGeneral).not.toHaveBeenCalled();
  });
});
