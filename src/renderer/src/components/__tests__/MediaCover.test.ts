import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

// Najechanie na okładkę-wideo w siatce nie może odmontować statycznej klatki:
// wcześniej karta zostawała pusta do czasu zdekodowania `<video>` (efekt mignięcia).
// Test pilnuje, że klatka zostaje pod spodem, a wideo pojawia się płynnie.

const covers = vi.hoisted(() => ({
  getCover: vi.fn(),
  getCoverStill: vi.fn(),
  loadCover: vi.fn(),
  loadCoverStill: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => covers
}));

vi.mock('@renderer/utils/mediaUrl', () => ({
  toMediaServerUrl: (path: string) => `media://${path}`
}));

import MediaCover from '../MediaCover.vue';

describe('MediaCover still → video hover', () => {
  beforeAll(() => {
    // jsdom nie implementuje odtwarzania: `play()` musi zwracać Promise,
    // bo komponent gasi odrzucenie autoplay.
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  beforeEach(() => {
    covers.getCover.mockReturnValue({ type: 'video', data: 'D:/media/a.mp4' });
    covers.getCoverStill.mockReturnValue({ type: 'image', data: 'data:image/jpeg;base64,STILL' });
  });

  it('keeps the still frame mounted while the video fades in', async () => {
    const wrapper = mount(MediaCover, {
      props: { path: 'D:/media/a.mp3', still: true, fallback: 'music' }
    });
    await nextTick();

    expect(wrapper.find('img[src^="data:image"]').exists()).toBe(true);
    expect(wrapper.find('video').exists()).toBe(false);

    await wrapper.trigger('mouseenter');
    await nextTick();

    // Klatka nadal jest w DOM, a wideo startuje przezroczyste.
    expect(wrapper.find('img[src^="data:image"]').exists()).toBe(true);
    const video = wrapper.get('video');
    expect(video.classes()).toContain('opacity-0');

    await video.trigger('loadeddata');
    await nextTick();
    expect(wrapper.get('video').classes()).toContain('opacity-100');
    expect(wrapper.find('img[src^="data:image"]').exists()).toBe(true);
  });

  it('hides the video again after the pointer leaves', async () => {
    const wrapper = mount(MediaCover, {
      props: { path: 'D:/media/a.mp3', still: true }
    });
    await nextTick();
    await wrapper.trigger('mouseenter');
    await nextTick();
    await wrapper.get('video').trigger('loadeddata');
    await nextTick();

    await wrapper.trigger('mouseleave');
    await nextTick();

    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('img[src^="data:image"]').exists()).toBe(true);
  });
});
