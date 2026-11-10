import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  radio: null as any,
  player: { isPlaying: false, togglePlay: vi.fn() },
  showConfirm: vi.fn(async () => true),
  prompt: {
    promptVisible: { value: false },
    promptIsConfirm: { value: false },
    promptMessage: { value: '' },
    promptValue: { value: '' },
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  }
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/radio', () => ({ useRadioStore: () => h.radio }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => ({ ...h.prompt, showConfirm: h.showConfirm })
}));

const OnlineButtonStub = defineComponent({
  name: 'OnlineButton',
  props: ['variant', 'size'],
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>'
});
const PromptStub = defineComponent({
  name: 'ExplorerPromptDialog',
  props: ['visible', 'isConfirm', 'message', 'value'],
  emits: ['update:value', 'confirm', 'cancel'],
  template: `<div data-testid="prompt">
    <button data-testid="prompt-type" @click="$emit('update:value', 'typed')" />
    <button data-testid="prompt-confirm" @click="$emit('confirm')" />
    <button data-testid="prompt-cancel" @click="$emit('cancel')" />
  </div>`
});

import WebcastRadioTab from '../WebcastRadioTab.vue';

let wrapper: VueWrapper | null = null;

function station(id: string, name = id) {
  return { id, name, url: `https://radio/${id}` };
}

function setup() {
  wrapper = mount(WebcastRadioTab, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { OnlineButton: OnlineButtonStub, ExplorerPromptDialog: PromptStub }
    }
  });
  return wrapper;
}

beforeEach(() => {
  h.showConfirm.mockReset();
  h.showConfirm.mockResolvedValue(true);
  h.player.isPlaying = false;
  h.player.togglePlay.mockReset();
  h.prompt.promptVisible.value = false;
  h.prompt.promptIsConfirm.value = false;
  h.prompt.promptMessage.value = '';
  h.prompt.promptValue.value = '';
  h.prompt.promptConfirm.mockReset();
  h.prompt.promptCancel.mockReset();
  h.radio = reactive({
    stations: [] as unknown[],
    playingStationId: null as string | null,
    playStation: vi.fn(),
    removeStation: vi.fn(),
    renameStation: vi.fn(),
    moveToTop: vi.fn()
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function playButton(index = 0) {
  return wrapper!
    .findAll('button')
    .filter((button) => button.attributes('title')?.includes('Radio'))[index];
}

function namedButton(label: string, index = 0) {
  return wrapper!.findAll(`[aria-label="${label}"]`)[index];
}

describe('empty state', () => {
  it('shows the hint and emits add', async () => {
    setup();

    expect(wrapper!.text()).toContain('saved.radioSoon');
    await wrapper!
      .findAll('button')
      .find((button) => button.text().includes('saved.addRadio'))!
      .trigger('click');

    expect(wrapper!.emitted('add')).toHaveLength(1);
  });
});

describe('station list', () => {
  beforeEach(() => {
    h.radio.stations = [station('a', 'Alpha'), station('b', 'Beta')];
  });

  it('renders names, urls and highlights the playing station', () => {
    h.radio.playingStationId = 'b';
    setup();

    expect(wrapper!.text()).toContain('Alpha');
    expect(wrapper!.text()).toContain('https://radio/a');
    const cards = wrapper!.findAll('.group');
    expect(cards[0].classes()).not.toContain('border-primary/60');
    expect(cards[1].classes()).toContain('border-primary/60');
  });

  it('plays an inactive station and pauses the active one', async () => {
    setup();

    await playButton(0).trigger('click');
    expect(h.radio.playStation).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(h.player.togglePlay).not.toHaveBeenCalled();

    h.radio.playingStationId = 'a';
    await wrapper!.vm.$nextTick();
    await playButton(0).trigger('click');
    expect(h.player.togglePlay).toHaveBeenCalled();
  });

  it('shows a pause icon only while the active station plays', async () => {
    h.radio.playingStationId = 'a';
    setup();

    expect(playButton(0).find('svg').exists()).toBe(true);

    h.player.isPlaying = true;
    await wrapper!.vm.$nextTick();
    expect(playButton(0).find('svg').exists()).toBe(true);
  });

  it('renames a station on Enter and blur', async () => {
    setup();

    await namedButton('saved.renameRadio', 0).trigger('click');
    const input = wrapper!.get('input[type="text"]');
    expect((input.element as HTMLInputElement).value).toBe('Alpha');
    await input.setValue('New name');
    await input.trigger('keyup', { key: 'Enter' });

    expect(h.radio.renameStation).toHaveBeenCalledWith('a', 'New name');

    await namedButton('saved.renameRadio', 1).trigger('click');
    await wrapper!.get('input[type="text"]').setValue('Beta 2');
    await wrapper!.get('input[type="text"]').trigger('blur');
    expect(h.radio.renameStation).toHaveBeenCalledWith('b', 'Beta 2');
  });

  it('cancels renaming on Escape without committing', async () => {
    setup();

    await namedButton('saved.renameRadio', 0).trigger('click');
    const input = wrapper!.get('input[type="text"]');
    await input.trigger('keyup', { key: 'Escape' });
    await input.trigger('blur');

    expect(h.radio.renameStation).not.toHaveBeenCalled();
    expect(wrapper!.find('input[type="text"]').exists()).toBe(false);
  });

  it('moves a station to the top', async () => {
    setup();

    await namedButton('saved.moveRadioTop', 1).trigger('click');

    expect(h.radio.moveToTop).toHaveBeenCalledWith('b');
  });

  it('removes a station only after confirmation', async () => {
    setup();
    h.showConfirm.mockResolvedValueOnce(false);

    await namedButton('common.delete', 0).trigger('click');
    expect(h.radio.removeStation).not.toHaveBeenCalled();

    h.showConfirm.mockResolvedValueOnce(true);
    await namedButton('common.delete', 1).trigger('click');
    expect(h.radio.removeStation).toHaveBeenCalledWith('b');
  });

  it('wires the prompt dialog', async () => {
    setup();

    await wrapper!.get('[data-testid="prompt-type"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-confirm"]').trigger('click');
    await wrapper!.get('[data-testid="prompt-cancel"]').trigger('click');

    expect(h.prompt.promptValue.value).toBe('typed');
    expect(h.prompt.promptConfirm).toHaveBeenCalled();
    expect(h.prompt.promptCancel).toHaveBeenCalled();
  });
});
