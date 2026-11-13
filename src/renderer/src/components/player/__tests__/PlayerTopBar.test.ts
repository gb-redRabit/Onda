import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import PlayerTopBar from '../PlayerTopBar.vue';

function mountBar(props: Record<string, unknown> = {}) {
  return mount(PlayerTopBar, {
    props: {
      showControls: true,
      track: { name: 'video.mp4', metadata: { title: 'My video', artist: 'Artist' } } as never,
      pinned: false,
      ...props
    },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('PlayerTopBar', () => {
  it('shows the track title and artist', () => {
    const text = mountBar().text();

    expect(text).toContain('My video');
    expect(text).toContain('Artist');
  });

  it('falls back to the file name and then the placeholder', () => {
    expect(mountBar({ track: { name: 'clip.mp4', metadata: {} } }).text()).toContain('clip.mp4');
    expect(mountBar({ track: null }).text()).toContain('playerView.noVideo');

    const named = mountBar({ track: { name: 'clip.mp4', metadata: {} } });
    expect(named.find('p + p').text()).toBe('');
  });

  it('hides the controls visually when requested', () => {
    const wrapper = mountBar({ showControls: false });

    expect(wrapper.classes()).toContain('opacity-0');
  });

  it('emits back, pip and fullscreen', async () => {
    const wrapper = mountBar();

    await wrapper.get('[aria-label="playerView.back"]').trigger('click');
    await wrapper.get('[data-testid="player-pip"]').trigger('click');
    await wrapper.get('[aria-label="playerView.fullscreen"]').trigger('click');

    expect(wrapper.emitted('back')).toEqual([[]]);
    expect(wrapper.emitted('pip')).toEqual([[]]);
    expect(wrapper.emitted('fullscreen')).toEqual([[]]);
  });

  it('reflects the pinned state', async () => {
    const unpinned = mountBar();
    const pin = unpinned.get('[data-testid="player-always-on-top"]');

    expect(pin.attributes('aria-pressed')).toBe('false');
    expect(pin.classes()).toContain('bg-neutral-content/10');

    const pinned = mountBar({ pinned: true });
    const active = pinned.get('[data-testid="player-always-on-top"]');
    expect(active.attributes('aria-pressed')).toBe('true');
    expect(active.classes()).toContain('text-primary-text');

    await active.trigger('click');
    expect(pinned.emitted('toggle-pin')).toEqual([[]]);
  });
});
