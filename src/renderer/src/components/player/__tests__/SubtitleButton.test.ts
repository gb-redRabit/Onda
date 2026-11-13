import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';

const state = vi.hoisted(() => ({
  player: null as any
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));

import SubtitleButton from '../SubtitleButton.vue';

const global = { mocks: { $t: (key: string) => key } };

beforeEach(() => {
  state.player = reactive({
    subtitlePanelVisible: false,
    activeSubtitleId: null,
    toggleSubtitlePanel: vi.fn()
  });
});

describe('SubtitleButton', () => {
  it('reflects the closed panel and missing subtitles', () => {
    const wrapper = mount(SubtitleButton, { global });
    const button = wrapper.get('[data-testid="subtitle-button"]');

    expect(button.attributes('aria-label')).toBe('player.subtitles');
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(button.classes()).not.toContain('text-primary-text!');
  });

  it('highlights when the panel is open', () => {
    state.player.subtitlePanelVisible = true;
    const wrapper = mount(SubtitleButton, { global });

    expect(wrapper.get('[data-testid="subtitle-button"]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('[data-testid="subtitle-button"]').classes()).toContain(
      'text-primary-text!'
    );
  });

  it('highlights when a subtitle is active', () => {
    state.player.activeSubtitleId = 'en';
    const wrapper = mount(SubtitleButton, { global });

    expect(wrapper.get('[data-testid="subtitle-button"]').classes()).toContain(
      'text-primary-text!'
    );
  });

  it('toggles the panel on click', async () => {
    const wrapper = mount(SubtitleButton, { global });

    await wrapper.get('[data-testid="subtitle-button"]').trigger('click');

    expect(state.player.toggleSubtitlePanel).toHaveBeenCalledTimes(1);
  });
});
