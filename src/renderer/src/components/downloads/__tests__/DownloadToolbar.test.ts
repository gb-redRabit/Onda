import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';

const state = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  online: null as any,
  settings: null as any,
  prompt: null as any
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.online }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/usePromptDialog', () => ({ usePromptDialog: () => state.prompt }));

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: {
    variant: String,
    size: String,
    pressed: Boolean,
    label: String,
    disabled: Boolean
  },
  template: `<button :disabled="disabled" :aria-label="label" :data-pressed="String(pressed)">
    <slot name="leading" /><slot />
  </button>`
});
const InputStub = defineComponent({
  name: 'InputStub',
  props: { modelValue: String, type: String, size: String, ariaLabel: String },
  emits: ['update:modelValue'],
  template:
    '<input :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});
const PageHeaderStub = defineComponent({
  name: 'PageHeaderStub',
  props: { title: String, icon: Object },
  template: '<header><span>{{ title }}</span><slot name="actions" /></header>'
});
const SelectStub = defineComponent({
  name: 'SelectStub',
  props: { modelValue: Number, size: String, ariaLabel: String },
  emits: ['update:modelValue'],
  template:
    '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>'
});
const PromptStub = defineComponent({
  name: 'ExplorerPromptDialogStub',
  props: { visible: Boolean, isConfirm: Boolean, message: String, value: String },
  emits: ['update:value', 'confirm', 'cancel'],
  template: '<div data-testid="prompt" />'
});

import DownloadToolbar from '../DownloadToolbar.vue';

let wrapper: VueWrapper | null = null;

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(DownloadToolbar, {
    props: { activeCount: 0, pausedCount: 0, hasFinished: false, ...props },
    global: {
      stubs: {
        Button: ButtonStub,
        Input: InputStub,
        PageHeader: PageHeaderStub,
        Select: SelectStub,
        ExplorerPromptDialog: PromptStub
      },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('button');
}

function buttonByText(text: string) {
  return buttons().find((button) => button.text().includes(text))!;
}

function optionsPanel() {
  return wrapper!.findAll('div').find((node) => node.classes().includes('bg-base-200/35'))!;
}

beforeEach(() => {
  state.t.mockClear();
  state.online = {
    pauseAll: vi.fn(),
    resumeAll: vi.fn(),
    clearFinishedDownloads: vi.fn(async () => undefined),
    scheduleStart: vi.fn(async () => undefined),
    getScheduledStart: vi.fn(async () => null),
    exportQueue: vi.fn(),
    importQueue: vi.fn()
  };
  state.settings = {
    network: reactive({ downloadSpeedLimit: 0 }),
    updateNetwork: vi.fn()
  };
  state.prompt = {
    showConfirm: vi.fn(async () => true),
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('header', () => {
  it('shows counts and control buttons', async () => {
    setup({ activeCount: 2, pausedCount: 1, hasFinished: true });

    expect(wrapper!.text()).toContain('downloads.title');
    expect(wrapper!.text()).toContain('downloads.filterActive: 2');

    await buttonByText('downloads.pauseAll').trigger('click');
    await buttonByText('downloads.resumeAll').trigger('click');
    expect(state.online.pauseAll).toHaveBeenCalledTimes(1);
    expect(state.online.resumeAll).toHaveBeenCalledTimes(1);
  });

  it('hides contextual buttons when not needed', () => {
    setup();
    expect(wrapper!.text()).not.toContain('downloads.pauseAll');
    expect(wrapper!.text()).not.toContain('downloads.resumeAll');
    expect(wrapper!.find('[data-testid="downloads-clear-finished"]').exists()).toBe(false);
  });

  it('clears finished downloads after confirmation', async () => {
    setup({ hasFinished: true });

    await wrapper!.get('[data-testid="downloads-clear-finished"]').trigger('click');
    expect(state.prompt.showConfirm).toHaveBeenCalledWith('downloads.clearFinishedConfirm');
    expect(state.online.clearFinishedDownloads).toHaveBeenCalledTimes(1);
  });

  it('keeps finished downloads when refused', async () => {
    state.prompt.showConfirm.mockResolvedValue(false);
    setup({ hasFinished: true });

    await wrapper!.get('[data-testid="downloads-clear-finished"]').trigger('click');

    expect(state.online.clearFinishedDownloads).not.toHaveBeenCalled();
  });
});

describe('options panel', () => {
  it('toggles visibility', async () => {
    setup();
    expect(optionsPanel().attributes('style')).toContain('display: none');

    await buttons()[0].trigger('click');
    expect(optionsPanel().attributes('style') ?? '').not.toContain('display: none');
  });

  it('marks the toggle pressed for active options', () => {
    state.settings.network.downloadSpeedLimit = 1024;
    setup();

    const toggle = buttons()[0];
    expect(toggle.attributes('data-pressed')).toBe('true');
  });

  it('offers speed limits and applies them', async () => {
    setup();
    await buttons()[0].trigger('click');
    const select = wrapper!.get('select');

    expect(select.findAll('option').map((option) => option.text())).toEqual([
      'settings.speedUnlimited',
      '1 MB/s',
      '2 MB/s',
      '5 MB/s',
      '10 MB/s'
    ]);

    (select.element as HTMLSelectElement).value = '2048';
    await select.trigger('change');
    expect(state.settings.updateNetwork).toHaveBeenCalledWith({ downloadSpeedLimit: 2048 });
  });

  it('exports and imports the queue', async () => {
    setup();
    await buttons()[0].trigger('click');

    await buttonByText('downloads.exportQueue').trigger('click');
    await buttonByText('downloads.importQueue').trigger('click');

    expect(state.online.exportQueue).toHaveBeenCalledTimes(1);
    expect(state.online.importQueue).toHaveBeenCalledTimes(1);
  });
});

describe('scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00'));
  });

  it('schedules a future time today', async () => {
    setup();
    await buttons()[0].trigger('click');
    const input = wrapper!.get('input[type="time"]');
    await input.setValue('12:30');
    await buttonByText('downloads.scheduleSet').trigger('click');

    const expected = new Date('2026-01-01T12:30:00').getTime();
    expect(state.online.scheduleStart).toHaveBeenCalledWith(expected);
  });

  it('rolls a past time to tomorrow', async () => {
    setup();
    await buttons()[0].trigger('click');
    await wrapper!.get('input[type="time"]').setValue('09:00');
    await buttonByText('downloads.scheduleSet').trigger('click');

    expect(state.online.scheduleStart).toHaveBeenCalledWith(
      new Date('2026-01-02T09:00:00').getTime()
    );
  });

  it('ignores invalid values', async () => {
    setup();
    await buttons()[0].trigger('click');
    const input = wrapper!.get('input[type="time"]');
    await input.setValue('99:99');
    await buttonByText('downloads.scheduleSet').trigger('click');
    await input.setValue('nope');
    await buttonByText('downloads.scheduleSet').trigger('click');

    expect(state.online.scheduleStart).not.toHaveBeenCalled();
  });

  it('disables saving without a time', async () => {
    setup();
    await buttons()[0].trigger('click');
    expect(buttonByText('downloads.scheduleSet').attributes('disabled')).toBeDefined();
  });

  it('restores and clears an existing schedule', async () => {
    state.online.getScheduledStart.mockResolvedValue(Date.now() + 60_000);
    setup();
    await Promise.resolve();
    await wrapper!.vm.$nextTick();
    await buttons()[0].trigger('click');

    const clear = buttons().find(
      (button) => button.attributes('aria-label') === 'downloads.scheduleClear'
    );
    expect(clear).toBeTruthy();
    await clear!.trigger('click');

    expect(state.online.scheduleStart).toHaveBeenCalledWith(null);
    expect(wrapper!.find('button[aria-label="downloads.scheduleClear"]').exists()).toBe(false);
  });
});

describe('confirmation dialog', () => {
  it('binds the prompt state and forwards events', async () => {
    state.prompt.promptVisible.value = true;
    state.prompt.promptMessage.value = 'Sure?';
    setup();

    const dialog = wrapper!.getComponent(PromptStub);
    expect(dialog.props()).toMatchObject({ visible: true, message: 'Sure?' });

    dialog.vm.$emit('confirm');
    dialog.vm.$emit('cancel');
    dialog.vm.$emit('update:value', 'typed');

    expect(state.prompt.promptConfirm).toHaveBeenCalledTimes(1);
    expect(state.prompt.promptCancel).toHaveBeenCalledTimes(1);
    expect(state.prompt.promptValue.value).toBe('typed');
  });
});
