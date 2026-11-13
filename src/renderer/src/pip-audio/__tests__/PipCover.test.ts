import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import PipCover from '../PipCover.vue';

function mountCover(props: Record<string, unknown> = {}) {
  return mount(PipCover, {
    props: { isVideo: false, videoSrc: '', imgSrc: null, ...props }
  });
}

describe('PipCover', () => {
  it('renders the video with playback defaults', () => {
    const wrapper = mountCover({ isVideo: true, videoSrc: 'https://cdn/v.mp4' });
    const video = wrapper.get('video');

    expect(video.attributes('src')).toBe('https://cdn/v.mp4');
    expect(video.attributes('autoplay')).toBeUndefined();
    expect((video.element as HTMLVideoElement).muted).toBe(true);
    expect((video.element as HTMLVideoElement).loop).toBe(true);
    expect(video.attributes('class')).toContain('h-24 w-24');
  });

  it('autoplays and shrinks with the small size', () => {
    const wrapper = mountCover({
      isVideo: true,
      videoSrc: 'v',
      playing: true,
      size: 'sm'
    });

    expect(wrapper.get('video').attributes('autoplay')).toBe('');
    expect(wrapper.get('video').attributes('class')).toContain('h-11 w-11');
  });

  it('renders an image cover', () => {
    const wrapper = mountCover({ imgSrc: 'cover.png' });
    const img = wrapper.get('img');

    expect(img.attributes('src')).toBe('cover.png');
    expect(img.attributes('alt')).toBe('');
    expect(img.attributes('class')).toContain('h-24 w-24');
  });

  it('shrinks the image with the small size', () => {
    const wrapper = mountCover({ imgSrc: 'cover.png', size: 'sm' });

    expect(wrapper.get('img').attributes('class')).toContain('h-13 w-13');
  });

  it('renders a placeholder when there is no cover', () => {
    const wrapper = mountCover();

    expect(wrapper.find('video').exists()).toBe(false);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('div').attributes('class')).toContain('bg-base-content/10');
  });

  it('hides a video that fails to load', async () => {
    const wrapper = mountCover({ isVideo: true, videoSrc: 'bad' });
    const video = wrapper.get('video').element as HTMLVideoElement;

    await wrapper.get('video').trigger('error');

    expect(video.style.display).toBe('none');
  });

  it('plays when playback starts and pauses when it stops', async () => {
    const wrapper = mountCover({ isVideo: true, videoSrc: 'v', playing: false });
    const video = wrapper.get('video').element as HTMLVideoElement;
    let paused = true;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
    Object.defineProperty(video, 'ended', { configurable: true, value: false });
    const play = vi.fn().mockResolvedValue(undefined);
    video.play = play;
    video.pause = vi.fn(() => {
      paused = true;
    });

    await wrapper.setProps({ playing: true });
    await nextTick();
    expect(play).toHaveBeenCalledTimes(1);

    paused = false;
    await wrapper.setProps({ playing: false });
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it('does not play an ended video', async () => {
    const wrapper = mountCover({ isVideo: true, videoSrc: 'v', playing: false });
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => true });
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    video.play = vi.fn();

    await wrapper.setProps({ playing: true });

    expect(video.play).not.toHaveBeenCalled();
  });

  it('ignores playback changes without a video element', async () => {
    const wrapper = mountCover({ playing: false });

    await wrapper.setProps({ playing: true });

    expect(wrapper.find('video').exists()).toBe(false);
  });

  it('swallows a rejected play promise', async () => {
    const wrapper = mountCover({ isVideo: true, videoSrc: 'v', playing: false });
    const video = wrapper.get('video').element as HTMLVideoElement;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => true });
    Object.defineProperty(video, 'ended', { configurable: true, value: false });
    video.play = vi.fn().mockRejectedValue(new Error('blocked'));

    await wrapper.setProps({ playing: true });
    await nextTick();

    expect(video.play).toHaveBeenCalled();
  });
});
