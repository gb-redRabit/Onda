import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import TransportButtons from '../TransportButtons.vue';

function mountTransport(props: Record<string, unknown> = {}) {
  return mount(TransportButtons, {
    props: { variant: 'bar', isPlaying: false, shuffle: false, repeat: 'none', ...props }
  });
}

function byLabel(wrapper: ReturnType<typeof mountTransport>, label: string) {
  return wrapper.findAll('button').find((b) => b.attributes('aria-label') === label)!;
}

// Prezentacyjny transport: dwa warianty stylów, opcjonalne nadpisania, ulubione
// i etykiety repeat; każdy przycisk emituje jedno zdarzenie.
describe('TransportButtons', () => {
  it('renders all controls with the default bar styling', () => {
    const wrapper = mountTransport();
    const play = byLabel(wrapper, 'common.play');

    expect(wrapper.classes()).toContain('flex');
    expect(wrapper.classes()).toContain('gap-3');
    expect(play.classes()).toContain('w-10');
    expect(byLabel(wrapper, 'player.repeatNone').exists()).toBe(true);
    expect(byLabel(wrapper, 'common.shuffle').attributes('aria-pressed')).toBe('false');
  });

  it('uses the video skin when requested', () => {
    const wrapper = mountTransport({ variant: 'video', isPlaying: true });

    expect(byLabel(wrapper, 'common.pause').classes()).toContain('w-12');
    expect(wrapper.html()).toContain('blur-lg');
  });

  it('accepts a custom container class', () => {
    const wrapper = mountTransport({ containerClass: 'my-transport' });

    expect(wrapper.classes()).toContain('my-transport');
    expect(wrapper.classes()).not.toContain('gap-3');
  });

  it('applies style overrides and icon sizes', () => {
    const wrapper = mountTransport({
      isPlaying: true,
      shuffle: true,
      styles: {
        toggle: 'custom-toggle',
        step: 'custom-step',
        play: 'custom-play',
        playIcon: 'custom-icon',
        glow: 'custom-glow',
        active: 'custom-active',
        toggleSize: 10,
        skipSize: 11,
        playSize: 12
      }
    });

    const shuffle = byLabel(wrapper, 'common.shuffle');
    const prev = byLabel(wrapper, 'common.previous');
    const play = byLabel(wrapper, 'common.pause');

    expect(shuffle.classes()).toContain('custom-toggle');
    expect(shuffle.classes()).toContain('custom-active');
    expect(prev.classes()).toContain('custom-step');
    expect(play.classes()).toContain('custom-play');
    expect(wrapper.find('.custom-glow').exists()).toBe(true);
    expect(play.find('svg').classes()).toContain('custom-icon');
    expect(shuffle.find('svg').attributes('width')).toBe('10');
    expect(prev.find('svg').attributes('width')).toBe('11');
    expect(play.find('svg').attributes('width')).toBe('12');
  });

  it('highlights active shuffle and repeat states', () => {
    const wrapper = mountTransport({ shuffle: true, repeat: 'all' });

    expect(byLabel(wrapper, 'common.shuffle').classes()).toContain('text-primary-text!');
    expect(byLabel(wrapper, 'player.repeatAll').classes()).toContain('text-primary-text!');
  });

  it('labels repeat modes and swaps the repeat icon', () => {
    expect(byLabel(mountTransport({ repeat: 'none' }), 'player.repeatNone').exists()).toBe(true);
    expect(byLabel(mountTransport({ repeat: 'all' }), 'player.repeatAll').exists()).toBe(true);
    expect(byLabel(mountTransport({ repeat: 'one' }), 'player.repeatOne').exists()).toBe(true);
  });

  it('shows the favorite toggle only when requested', () => {
    expect(byLabel(mountTransport(), 'common.addFav')).toBeUndefined();

    const off = mountTransport({ showFavorite: true, favorite: false });
    expect(byLabel(off, 'common.addFav').find('svg').attributes('fill')).toBe('none');

    const on = mountTransport({ showFavorite: true, favorite: true });
    expect(byLabel(on, 'common.removeFav').find('svg').attributes('fill')).toBe('currentColor');
    expect(byLabel(on, 'common.removeFav').classes()).toContain('text-error!');
  });

  it('emits one event per control', async () => {
    const wrapper = mountTransport({ showFavorite: true });

    await byLabel(wrapper, 'common.shuffle').trigger('click');
    await byLabel(wrapper, 'common.addFav').trigger('click');
    await byLabel(wrapper, 'common.previous').trigger('click');
    await byLabel(wrapper, 'common.play').trigger('click');
    await byLabel(wrapper, 'common.next').trigger('click');
    await byLabel(wrapper, 'player.repeatNone').trigger('click');

    expect(wrapper.emitted()).toMatchObject({
      toggleShuffle: [[]],
      toggleFavorite: [[]],
      prev: [[]],
      playPause: [[]],
      next: [[]],
      cycleRepeat: [[]]
    });
  });
});
