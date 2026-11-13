import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/utils/audioView', () => ({
  pluginIcon: vi.fn((icon?: string) => defineComponent({ name: `Icon-${icon ?? 'default'}` }))
}));

const SwitcherStub = defineComponent({
  name: 'AudioLayoutSwitcher',
  template: '<div data-testid="switcher" />'
});

import AudioHudToolbar from '../AudioHudToolbar.vue';

function mountToolbar(over: Record<string, unknown> = {}) {
  return mount(AudioHudToolbar, {
    props: {
      visible: true,
      hudOpacity: 0.8,
      layoutEditorOpen: false,
      vizSettingsOpen: false,
      isFullscreen: false,
      vizMode: 'bars',
      commands: [{ id: 'cmd1', label: 'Command one', icon: 'star' }],
      pinned: false,
      ...over
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { AudioLayoutSwitcher: SwitcherStub }
    }
  });
}

describe('AudioHudToolbar', () => {
  it('fades with the hud opacity and visibility', () => {
    expect(mountToolbar().attributes('style')).toContain('opacity: 0.8');
    expect(mountToolbar({ visible: false }).attributes('style')).toContain('opacity: 0');
  });

  it('hides while the layout editor is open', () => {
    const wrapper = mountToolbar({ layoutEditorOpen: true });

    expect(wrapper.attributes('style')).toContain('display: none');
  });

  it('opens the layout editor', async () => {
    const wrapper = mountToolbar();

    await wrapper.get('[data-testid="audio-layout-editor"]').trigger('click');

    expect(wrapper.emitted('update:layoutEditorOpen')).toEqual([[true]]);
  });

  it('renders plugin commands and runs them', async () => {
    const wrapper = mountToolbar({
      commands: [
        { id: 'a', label: 'A', icon: 'star' },
        { id: 'b', label: 'B' }
      ]
    });
    const buttons = wrapper.findAll('button[title="A"], button[title="B"]');

    expect(buttons).toHaveLength(2);

    await buttons[1].trigger('click');
    expect(wrapper.emitted('run-command')).toEqual([['b']]);
  });

  it('labels known visualization modes', () => {
    expect(
      mountToolbar({ vizMode: 'particles' })
        .get('[data-testid="audio-cycle-viz"]')
        .attributes('aria-label')
    ).toBe('audioView.vizModeParticles');
  });

  it('falls back to the raw mode and defaults to bars', () => {
    expect(
      mountToolbar({ vizMode: 'plugin-mode' })
        .get('[data-testid="audio-cycle-viz"]')
        .attributes('aria-label')
    ).toBe('plugin-mode');

    expect(
      mountToolbar({ vizMode: '' }).get('[data-testid="audio-cycle-viz"]').attributes('aria-label')
    ).toBe('audioView.vizModeBars');
  });

  it('cycles visualization and toggles its settings', async () => {
    const wrapper = mountToolbar();

    await wrapper.get('[data-testid="audio-cycle-viz"]').trigger('click');
    await wrapper.get('[data-testid="audio-viz-settings"]').trigger('click');

    expect(wrapper.emitted('cycle-viz')).toEqual([[]]);
    expect(wrapper.emitted('update:vizSettingsOpen')).toEqual([[true]]);
  });

  it('marks open visualization settings', () => {
    const button = mountToolbar({ vizSettingsOpen: true }).get(
      '[data-testid="audio-viz-settings"]'
    );

    expect(button.classes()).toContain('text-primary-text');
  });

  it('toggles the pin state', async () => {
    const pinned = mountToolbar({ pinned: true });
    const button = pinned.get('[data-testid="audio-always-on-top"]');

    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.classes()).toContain('text-primary-text');

    await button.trigger('click');
    expect(pinned.emitted('toggle-pin')).toEqual([[]]);
  });

  it('shows unpinned styling', () => {
    expect(
      mountToolbar().get('[data-testid="audio-always-on-top"]').attributes('aria-pressed')
    ).toBe('false');
  });

  it('switches fullscreen labels and emits', async () => {
    const normal = mountToolbar();
    expect(normal.get('[data-testid="audio-fullscreen"]').attributes('aria-label')).toBe(
      'audioView.fullscreen'
    );

    const fullscreen = mountToolbar({ isFullscreen: true });
    const button = fullscreen.get('[data-testid="audio-fullscreen"]');
    expect(button.attributes('aria-label')).toBe('audioView.exitFullscreen');

    await button.trigger('click');
    expect(fullscreen.emitted('toggle-fullscreen')).toEqual([[]]);
  });
});
