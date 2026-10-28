import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MediaCover from '../MediaCover.vue';
import { usePlayerStore } from '@renderer/stores/player';

describe('MediaCover', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('loads the cover when the bound path changes', async () => {
    const player = usePlayerStore();
    vi.spyOn(player, 'getCover').mockReturnValue({ type: null, data: null });
    const loadCover = vi.spyOn(player, 'loadCover').mockResolvedValue({ type: null, data: null });

    const wrapper = mount(MediaCover, {
      props: { path: '/music/a.mp3' },
      attachTo: document.body
    });
    await nextTick();
    expect(loadCover).toHaveBeenCalledWith('/music/a.mp3');

    loadCover.mockClear();
    await wrapper.setProps({ path: '/music/b.mp3' });
    await nextTick();

    expect(loadCover).toHaveBeenCalledWith('/music/b.mp3');
    wrapper.unmount();
  });

  it('uses a cached cover immediately without a duplicate request', async () => {
    const player = usePlayerStore();
    vi.spyOn(player, 'getCover').mockReturnValue({
      type: 'image',
      data: 'data:image/png;base64,AA=='
    });
    const loadCover = vi.spyOn(player, 'loadCover').mockResolvedValue({ type: null, data: null });

    const wrapper = mount(MediaCover, {
      props: { path: '/music/cached.mp3' },
      attachTo: document.body
    });
    await nextTick();

    expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,AA==');
    expect(loadCover).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
