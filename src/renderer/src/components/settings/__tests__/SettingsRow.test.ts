import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h as createElement, inject } from 'vue';
import { createI18n } from 'vue-i18n';
import { SETTINGS_ROW_LABEL } from '../settingsRowLabel';

// Testy montujące wiersza ustawień: etykieta/opis, dostępna nazwa grupy,
// kropka "zmienione" i reset pojedynczego ustawienia.
const h = vi.hoisted(() => ({
  modified: false,
  value: 0.5 as unknown,
  reset: vi.fn()
}));

vi.mock('@renderer/utils/settingsDefaults', () => ({
  isSettingModified: () => h.modified,
  currentOf: () => h.value,
  resetSetting: (path: string) => h.reset(path)
}));

import SettingsRow from '../SettingsRow.vue';
import en from '../../../locales/en';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

function mountRow(props: Record<string, unknown> = {}) {
  return mount(SettingsRow, {
    props: { label: 'Volume', ...props },
    slots: { default: '<button data-testid="control">control</button>' },
    global: { plugins: [i18n] }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.modified = false;
  h.value = 0.5;
});

describe('SettingsRow — render', () => {
  it('renders the label, description and slot', () => {
    const w = mountRow({ description: 'Default output level' });
    expect(w.text()).toContain('Volume');
    expect(w.text()).toContain('Default output level');
    expect(w.find('[data-testid="control"]').exists()).toBe(true);
    expect(w.find('[role="group"]').attributes('aria-label')).toBe('Volume');
  });

  it('has no reset button for unchanged settings', () => {
    const w = mountRow({ path: 'playback.volume' });
    expect(w.find('[aria-label="Reset to default"]').exists()).toBe(false);
    expect(w.find('[title="Changed from the default"]').exists()).toBe(false);
  });
});

describe('SettingsRow — modification state', () => {
  it('shows the modified dot and resets the setting on click', async () => {
    h.modified = true;
    const w = mountRow({ path: 'playback.volume' });

    expect(w.find('[title="Changed from the default"]').exists()).toBe(true);
    await w.find('[aria-label="Reset to default"]').trigger('click');
    expect(h.reset).toHaveBeenCalledWith('playback.volume');
  });

  it('keeps the reset button absent without a path', async () => {
    h.modified = true;
    const w = mountRow();
    expect(w.find('[aria-label="Reset to default"]').exists()).toBe(false);
    expect(w.find('[title="Changed from the default"]').exists()).toBe(false);
  });

  it('exposes the current value as the control tooltip', () => {
    h.value = 42;
    const w = mountRow({ path: 'playback.buffer' });
    expect(w.find('[title="42"]').exists()).toBe(true);
  });

  it('leaves the tooltip empty for non-text values', () => {
    h.value = true;
    const w = mountRow({ path: 'playback.enabled' });
    expect(w.html()).not.toContain('title="true"');
  });

  it('widens the control column in wide mode', () => {
    const w = mountRow({ wide: true });
    expect(w.get('[role="group"]').classes()).toContain('w-64');
  });

  it('shares the label with slotted controls', () => {
    const Reader = defineComponent({
      setup() {
        const label = inject(SETTINGS_ROW_LABEL);
        return () => createElement('span', { 'data-testid': 'injected' }, label?.value);
      }
    });
    const w = mount(SettingsRow, {
      props: { label: 'Volume' },
      slots: { default: () => createElement(Reader) },
      global: { plugins: [i18n] }
    });

    expect(w.get('[data-testid="injected"]').text()).toBe('Volume');
  });
});
