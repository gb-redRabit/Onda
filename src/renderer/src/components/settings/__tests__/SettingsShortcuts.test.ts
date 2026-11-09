import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, nextTick, reactive } from 'vue';

const state = vi.hoisted(() => ({
  settings: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/shortcutLabels', () => ({
  SHORTCUT_LABELS: {
    'play-pause': 'shortcut.playPause'
  } as Record<string, string>
}));

const GroupStub = defineComponent({
  name: 'SettingsGroupStub',
  props: { padded: Boolean },
  template: '<section><slot /></section>'
});

import SettingsShortcuts from '../SettingsShortcuts.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(SettingsShortcuts, {
    global: { stubs: { SettingsGroup: GroupStub } }
  });
  return wrapper;
}

function rows() {
  return wrapper!.findAll('section > div');
}

function labels() {
  return rows().map((row) => row.get('span').text());
}

function valueButtons() {
  return rows().map((row) => row.get('button'));
}

function press(
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {}
) {
  const event = new KeyboardEvent('keydown', {
    key,
    cancelable: true,
    bubbles: true,
    ...modifiers
  });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.dataset.shortcutRecording = '';
  state.t.mockClear();
  state.settings = {
    shortcuts: reactive({
      'play-pause': 'Space',
      custom: 'ArrowUp',
      'next-track': 'MediaTrackNext'
    }),
    updateShortcut: vi.fn()
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.dataset.shortcutRecording = '';
  vi.restoreAllMocks();
});

describe('rendering', () => {
  it('labels known actions and humanises unknown ids', () => {
    setup();

    expect(labels()).toEqual(['shortcut.playPause', 'custom', 'next track']);
    expect(state.t).toHaveBeenCalledWith('shortcut.playPause');
  });

  it('renders readable keys', () => {
    setup();
    const buttons = valueButtons().map((button) => button.text());

    expect(buttons).toEqual(['Space', '↑', '⏭']);
  });
});

describe('recording', () => {
  it('enters recording mode on click', async () => {
    setup();
    await valueButtons()[0].trigger('click');

    expect(document.body.dataset.shortcutRecording).toBe('play-pause');
    expect(valueButtons()[0].text()).toBe('...');
    expect(valueButtons()[0].classes()).toContain('animate-pulse');
  });

  it('stores a modifier combination', async () => {
    setup();
    await valueButtons()[0].trigger('click');

    const event = press('k', { ctrlKey: true, shiftKey: true });
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(state.settings.updateShortcut).toHaveBeenCalledWith('play-pause', 'Ctrl+Shift+K');
    expect(document.body.dataset.shortcutRecording).toBe('');
    expect(valueButtons()[0].text()).toBe('Space');
  });

  it('uses Meta instead of Ctrl and keeps Alt', async () => {
    setup();
    await valueButtons()[0].trigger('click');
    press('l', { metaKey: true, altKey: true });

    expect(state.settings.updateShortcut).toHaveBeenCalledWith('play-pause', 'Meta+Alt+L');
  });

  it('supports function keys, space and arrows', async () => {
    const cases: Array<[string, string]> = [
      ['F5', 'F5'],
      ['F12', 'F12'],
      [' ', 'Space'],
      ['ArrowLeft', 'ArrowLeft'],
      ['ArrowDown', 'ArrowDown'],
      ['Enter', 'Enter'],
      ['Tab', 'Tab'],
      ['MediaTrackNext', 'MediaTrackNext']
    ];
    setup();

    for (const [key, expected] of cases) {
      await valueButtons()[1].trigger('click');
      press(key);
      expect(state.settings.updateShortcut).toHaveBeenLastCalledWith('custom', expected);
    }
  });

  it('treats modifier-only presses as incomplete', async () => {
    setup();
    await valueButtons()[0].trigger('click');

    press('Control', { ctrlKey: true });
    press('Shift', { shiftKey: true });
    press('Alt', { altKey: true });
    press('Meta', { metaKey: true });

    expect(state.settings.updateShortcut).not.toHaveBeenCalled();
    expect(document.body.dataset.shortcutRecording).toBe('play-pause');
  });

  it('cancels on Escape', async () => {
    setup();
    await valueButtons()[0].trigger('click');

    press('Escape');
    await nextTick();

    expect(state.settings.updateShortcut).not.toHaveBeenCalled();
    expect(document.body.dataset.shortcutRecording).toBe('');
    expect(valueButtons()[0].text()).toBe('Space');
  });

  it('ignores unsupported keys', async () => {
    setup();
    await valueButtons()[0].trigger('click');

    press('Home');

    expect(state.settings.updateShortcut).not.toHaveBeenCalled();
    expect(document.body.dataset.shortcutRecording).toBe('play-pause');
  });

  it('ignores keys while not recording', () => {
    setup();
    const stop = vi.spyOn(KeyboardEvent.prototype, 'stopPropagation');

    const event = press('k', { ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(stop).not.toHaveBeenCalled();
    expect(state.settings.updateShortcut).not.toHaveBeenCalled();
  });

  it('stops propagation while recording', async () => {
    setup();
    await valueButtons()[0].trigger('click');
    const stop = vi.spyOn(KeyboardEvent.prototype, 'stopPropagation');

    press('k');

    expect(stop).toHaveBeenCalled();
  });
});

describe('cleanup', () => {
  it('removes the listener and clears the recording flag on unmount', async () => {
    setup();
    await valueButtons()[0].trigger('click');
    expect(document.body.dataset.shortcutRecording).toBe('play-pause');

    wrapper!.unmount();
    wrapper = null;

    expect(document.body.dataset.shortcutRecording).toBe('');
    press('k');
    expect(state.settings.updateShortcut).not.toHaveBeenCalled();
  });
});
