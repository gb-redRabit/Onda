import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import RadioAddDialog from '../RadioAddDialog.vue';

const state = vi.hoisted(() => ({
  addStations: vi.fn(),
  notify: vi.fn(),
  parseRadioFile: vi.fn(),
  parseDirectUrl: vi.fn(),
  fileText: 'text',
  readerError: false,
  parsed: [] as Array<{ name: string; url: string }>,
  station: null as { name: string; url: string } | null,
  added: 1,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/radio', () => ({
  useRadioStore: () => ({ addStations: state.addStations })
}));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => ({ notify: state.notify }) }));
vi.mock('@renderer/utils/radioParser', () => ({
  parseRadioFile: state.parseRadioFile,
  parseDirectUrl: state.parseDirectUrl
}));

const ModalShellStub = {
  props: ['visible', 'labelledBy', 'panelClass'],
  emits: ['close', 'escape'],
  template: '<div v-if="visible"><slot /></div>'
};
const OnlineButtonStub = {
  props: ['variant', 'size', 'disabled'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
};

let wrapper: VueWrapper | null = null;

class FakeFileReader {
  result: string | undefined;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsText(): void {
    if (state.readerError) {
      queueMicrotask(() => this.onerror?.());
      return;
    }
    this.result = state.fileText;
    queueMicrotask(() => this.onload?.());
  }
}

function mountDialog(visible = true) {
  wrapper = mount(RadioAddDialog, {
    props: { modelValue: visible },
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ModalShell: ModalShellStub, OnlineButton: OnlineButtonStub }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function buttons() {
  return wrapper!.findAll('button');
}

function addSelectedButton() {
  return buttons().find((button) => button.text().includes('radio.addSelected'))!;
}

function addUrlButton() {
  return buttons().find((button) => button.text().includes('radio.addUrl'))!;
}

function textInputs() {
  return wrapper!.findAll('input[type="text"]');
}

async function chooseFile(name = 'stations.m3u'): Promise<void> {
  const input = wrapper!.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ name }]
  });
  await input.trigger('change');
  await flush();
}

beforeEach(() => {
  vi.useRealTimers();
  state.addStations.mockReset();
  state.addStations.mockResolvedValue(1);
  state.notify.mockReset();
  state.parseRadioFile.mockReset();
  state.parseDirectUrl.mockReset();
  state.parseRadioFile.mockReturnValue([
    { name: 'One', url: 'https://one' },
    { name: 'Two', url: 'https://two' }
  ]);
  state.parseDirectUrl.mockReturnValue(null);
  state.fileText = 'text';
  state.readerError = false;
  state.parsed = [];
  state.station = null;
  state.added = 1;
  state.t.mockClear();
  vi.stubGlobal('FileReader', FakeFileReader);
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('file import', () => {
  it('parses a selected file and preselects all stations', async () => {
    mountDialog();
    await chooseFile('mix.m3u');

    expect(state.parseRadioFile).toHaveBeenCalledWith('mix.m3u', 'text');
    expect(wrapper!.text()).toContain('mix.m3u');
    expect(wrapper!.findAll('input[type="checkbox"]')).toHaveLength(2);
    const boxes = wrapper!.findAll('input[type="checkbox"]');
    expect((boxes[0].element as HTMLInputElement).checked).toBe(true);
    expect((boxes[1].element as HTMLInputElement).checked).toBe(true);
    expect(addSelectedButton().attributes('disabled')).toBeUndefined();
  });

  it('reports files without stations', async () => {
    state.parseRadioFile.mockReturnValueOnce([]);
    mountDialog();
    await chooseFile();

    expect(wrapper!.text()).toContain('radio.fileNoStations');
    expect(wrapper!.findAll('input[type="checkbox"]')).toHaveLength(0);
    expect(addSelectedButton().attributes('disabled')).toBeDefined();
  });

  it('reports read errors', async () => {
    state.readerError = true;
    mountDialog();
    await chooseFile();
    expect(wrapper!.text()).toContain('radio.fileReadError');
  });

  it('toggles selection and disables adding when empty', async () => {
    mountDialog();
    await chooseFile();
    const boxes = wrapper!.findAll('input[type="checkbox"]');

    await boxes[0].trigger('change');
    expect(addSelectedButton().attributes('disabled')).toBeUndefined();
    await boxes[1].trigger('change');
    expect(addSelectedButton().attributes('disabled')).toBeDefined();
  });

  it('adds only selected stations and closes the dialog', async () => {
    mountDialog();
    await chooseFile();
    await wrapper!.findAll('input[type="checkbox"]')[1].trigger('change');

    await addSelectedButton().trigger('click');
    await flush();

    expect(state.addStations).toHaveBeenCalledWith([{ name: 'One', url: 'https://one' }]);
    expect(state.notify).toHaveBeenCalledWith('success', '1', 'radio.addedStations', 2500);
    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });

  it('keeps the dialog busy while adding', async () => {
    let resolveAdd!: (value: number) => void;
    state.addStations.mockReturnValueOnce(new Promise((resolve) => (resolveAdd = resolve)));
    mountDialog();
    await chooseFile();

    await addSelectedButton().trigger('click');
    expect(addSelectedButton().attributes('disabled')).toBeDefined();

    resolveAdd(2);
    await flush();
    expect(state.notify).toHaveBeenCalledWith('success', '2', 'radio.addedStations', 2500);
  });
});

describe('direct URL', () => {
  it('rejects invalid URLs', async () => {
    mountDialog();
    const url = textInputs()[0];
    (url.element as HTMLInputElement).value = 'not-a-url';
    await url.trigger('input');

    await addUrlButton().trigger('click');
    expect(wrapper!.text()).toContain('radio.invalidUrl');
    expect(state.addStations).not.toHaveBeenCalled();
  });

  it('adds a URL and applies the custom name', async () => {
    state.parseDirectUrl.mockReturnValueOnce({ name: 'Parsed', url: 'https://stream' });
    mountDialog();
    const [url, name] = textInputs();
    (url.element as HTMLInputElement).value = 'https://stream';
    await url.trigger('input');
    (name.element as HTMLInputElement).value = '  Custom  ';
    await name.trigger('input');

    await addUrlButton().trigger('click');
    await flush();

    expect(state.parseDirectUrl).toHaveBeenCalledWith('https://stream');
    expect(state.addStations).toHaveBeenCalledWith([{ name: 'Custom', url: 'https://stream' }]);
    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });

  it('keeps the parsed name when the custom name is blank', async () => {
    state.parseDirectUrl.mockReturnValueOnce({ name: 'Parsed', url: 'https://stream' });
    mountDialog();
    const [url] = textInputs();
    (url.element as HTMLInputElement).value = 'https://stream';
    await url.trigger('input');

    await addUrlButton().trigger('click');
    await flush();
    expect(state.addStations).toHaveBeenCalledWith([{ name: 'Parsed', url: 'https://stream' }]);
  });

  it('adds on Enter from either input', async () => {
    state.parseDirectUrl.mockReturnValue({ name: 'Parsed', url: 'https://stream' });
    mountDialog();
    const [url, name] = textInputs();

    await url.trigger('keyup.enter');
    expect(state.addStations).toHaveBeenCalledTimes(1);

    await name.trigger('keyup.enter');
    expect(state.addStations).toHaveBeenCalledTimes(2);
  });
});

describe('state and closing', () => {
  it('resets fields when reopened', async () => {
    mountDialog();
    await chooseFile();
    const [url] = textInputs();
    (url.element as HTMLInputElement).value = 'https://x';
    await url.trigger('input');
    state.parseDirectUrl.mockReturnValueOnce(null);
    await addUrlButton().trigger('click');
    expect(wrapper!.text()).toContain('radio.invalidUrl');

    await wrapper!.setProps({ modelValue: false });
    await wrapper!.setProps({ modelValue: true });
    await flush();

    expect(wrapper!.findAll('input[type="checkbox"]')).toHaveLength(0);
    expect((textInputs()[0].element as HTMLInputElement).value).toBe('');
    expect(wrapper!.text()).not.toContain('radio.invalidUrl');
    expect(wrapper!.text()).toContain('radio.pickFile');
  });

  it('closes from the modal shell and the cancel button', async () => {
    mountDialog();
    wrapper!.findComponent(ModalShellStub).vm.$emit('close');
    await flush();
    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false]);

    await buttons()
      .find((button) => button.text().includes('common.cancel'))!
      .trigger('click');
    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false]);

    wrapper!.findComponent(ModalShellStub).vm.$emit('escape');
    await flush();
    expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });
});
