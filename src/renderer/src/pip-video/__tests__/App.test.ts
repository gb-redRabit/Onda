import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';

const state = vi.hoisted(() => ({
  pip: null as any,
  subtitle: null as any,
  preview: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('../usePipVideoIpc', () => ({ usePipVideoIpc: () => state.pip }));
vi.mock('../usePipVideoSubtitle', () => ({ usePipVideoSubtitle: () => state.subtitle }));
vi.mock('../usePipVideoPreview', () => ({ usePipVideoPreview: () => state.preview }));

import App from '../App.vue';

let wrapper: VueWrapper | null = null;

function mountApp(props: { preview?: boolean } = {}) {
  wrapper = mount(App, { props });
  return wrapper;
}

function media(video: HTMLVideoElement, values: { duration?: number; currentTime?: number } = {}) {
  Object.defineProperty(video, 'duration', {
    configurable: true,
    value: values.duration ?? 0
  });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    writable: true,
    value: values.currentTime ?? 0
  });
}

beforeEach(() => {
  state.t.mockClear();
  state.pip = {
    api: ref({ send: vi.fn() }),
    currentTime: ref('1:23'),
    duration: ref('4:56'),
    progress: ref(25),
    showOverlay: ref(false),
    settingsOpen: ref(false),
    brightness: ref(100),
    contrast: ref(100),
    videoFilter: ref('none'),
    t: state.t,
    onVideoMeta: vi.fn(),
    onTimeUpdate: vi.fn(),
    onVideoEnded: vi.fn(),
    onProgressClick: vi.fn(),
    sendMaximize: vi.fn()
  };
  state.subtitle = {
    subsVisible: ref(true),
    toggleSubtitles: vi.fn()
  };
  state.preview = {
    setHiddenVideoRef: vi.fn(),
    previewVisible: ref(false),
    previewDataUrl: ref(''),
    previewLeft: ref(0),
    previewTimeLabel: vi.fn(() => '0:10'),
    handleMouseMove: vi.fn(),
    handleMouseLeave: vi.fn()
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('video mode', () => {
  it('renders the player and the hidden media element', () => {
    mountApp();
    const videos = wrapper!.findAll('video');

    expect(videos).toHaveLength(2);
    expect(videos[0].attributes('preload')).toBe('auto');
    expect(wrapper!.find('[data-testid="pip-video-preview"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="pip-video-maximize"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="pip-video-close"]').exists()).toBe(true);
    expect(wrapper!.text()).toContain('1:23');
    expect(wrapper!.text()).toContain('4:56');
  });

  it('applies the configured video filter', () => {
    state.pip.videoFilter.value = 'brightness(1.2) contrast(1.1)';
    mountApp();

    const video = wrapper!.findAll('video')[0].element as HTMLVideoElement;
    expect(video.getAttribute('style') ?? '').toContain('filter: brightness(1.2) contrast(1.1)');
  });

  it('leaves the filter unset when disabled', () => {
    mountApp();
    const video = wrapper!.findAll('video')[0].element as HTMLVideoElement;
    expect(video.getAttribute('style') ?? '').not.toContain('filter');
  });

  it('forwards media events to the composable', async () => {
    mountApp();
    const video = wrapper!.findAll('video')[0];

    await video.trigger('loadedmetadata');
    await video.trigger('timeupdate');
    await video.trigger('ended');

    expect(state.pip.onVideoMeta).toHaveBeenCalledTimes(1);
    expect(state.pip.onTimeUpdate).toHaveBeenCalledTimes(1);
    expect(state.pip.onVideoEnded).toHaveBeenCalledTimes(1);
  });

  it('wires the overlay-visible buttons', async () => {
    mountApp();

    await wrapper!.get('[data-testid="pip-video-maximize"]').trigger('click');
    await wrapper!.get('[data-testid="pip-video-close"]').trigger('click');

    expect(state.pip.sendMaximize).toHaveBeenCalledTimes(1);
    expect(state.pip.api.value.send).toHaveBeenCalledWith('pip:hidden');
  });
});

describe('preview mode', () => {
  it('shows the preview scene with fixed labels', () => {
    mountApp({ preview: true });

    expect(wrapper!.find('[data-testid="pip-video-preview"]').exists()).toBe(true);
    expect(wrapper!.findAll('video')).toHaveLength(0);
    expect(wrapper!.find('[data-testid="pip-video-maximize"]').exists()).toBe(false);
    expect(wrapper!.text()).toContain('0:42');
    expect(wrapper!.text()).toContain('12:08');
    expect(wrapper!.text()).toContain('previewTitle');
    expect(wrapper!.text()).toContain('previewDescription');
  });

  it('reveals the overlay on mount and closes through the bridge', async () => {
    mountApp({ preview: true });

    expect(state.pip.showOverlay.value).toBe(true);
    await wrapper!.get('[data-testid="pip-video-preview-close"]').trigger('click');
    expect(state.pip.api.value.send).toHaveBeenCalledWith('pip:hidden');
  });

  it('fills the progress bar from the fixed preview value', () => {
    mountApp({ preview: true });
    const fill = wrapper!.find('[role="slider"] > div');
    expect(fill.attributes('style')).toContain('width: 34%');
  });
});

describe('settings panel', () => {
  it('toggles open and closed', async () => {
    mountApp();
    const button = wrapper!.get('[data-testid="pip-video-settings"]');

    await button.trigger('click');
    expect(state.pip.settingsOpen.value).toBe(true);
    expect(wrapper!.find('[data-testid="pip-video-settings-panel"]').exists()).toBe(true);

    await button.trigger('click');
    expect(wrapper!.find('[data-testid="pip-video-settings-panel"]').exists()).toBe(false);
  });

  it('toggles subtitles', async () => {
    mountApp();
    await wrapper!.get('[data-testid="pip-video-settings"]').trigger('click');
    const subs = wrapper!.get('[data-testid="pip-video-subs"]');

    expect(subs.attributes('aria-checked')).toBe('true');
    await subs.trigger('click');
    expect(state.subtitle.toggleSubtitles).toHaveBeenCalledTimes(1);
  });

  it('marks disabled subtitles', async () => {
    state.subtitle.subsVisible.value = false;
    mountApp();
    await wrapper!.get('[data-testid="pip-video-settings"]').trigger('click');

    const subs = wrapper!.get('[data-testid="pip-video-subs"]');
    expect(subs.attributes('aria-checked')).toBe('false');
    expect(subs.classes()).not.toContain('bg-primary');
  });

  it('updates brightness and contrast from the sliders', async () => {
    mountApp();
    await wrapper!.get('[data-testid="pip-video-settings"]').trigger('click');
    const sliders = wrapper!.findAll('input[type="range"]');

    (sliders[0].element as HTMLInputElement).value = '150';
    await sliders[0].trigger('input');
    (sliders[1].element as HTMLInputElement).value = '10';
    await sliders[1].trigger('input');

    expect(state.pip.brightness.value).toBe(150);
    expect(state.pip.contrast.value).toBe(10);
    expect(wrapper!.text()).toContain('brightness');
    expect(wrapper!.text()).toContain('contrast');
  });

  it('closes the panel when the pointer leaves the player', async () => {
    mountApp();
    await wrapper!.get('[data-testid="pip-video-settings"]').trigger('click');
    state.pip.showOverlay.value = true;

    await wrapper!.get('.pip-root').trigger('mouseleave');

    expect(state.pip.showOverlay.value).toBe(false);
    expect(state.pip.settingsOpen.value).toBe(false);
  });

  it('shows the overlay on hover', async () => {
    mountApp();
    await wrapper!.get('.pip-root').trigger('mouseenter');
    expect(state.pip.showOverlay.value).toBe(true);
  });
});

describe('progress bar', () => {
  function progress() {
    return wrapper!.get('[role="slider"]');
  }

  it('seeks with arrows and clamps to the media bounds', async () => {
    mountApp();
    const video = wrapper!.findAll('video')[0].element as HTMLVideoElement;
    media(video, { duration: 100, currentTime: 98 });

    await progress().trigger('keydown', { key: 'ArrowRight' });
    expect(video.currentTime).toBe(100);

    video.currentTime = 2;
    await progress().trigger('keydown', { key: 'ArrowUp' });
    expect(video.currentTime).toBe(7);

    video.currentTime = 3;
    await progress().trigger('keydown', { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(0);

    video.currentTime = 3;
    await progress().trigger('keydown', { key: 'ArrowDown' });
    expect(video.currentTime).toBe(0);

    video.currentTime = 42;
    await progress().trigger('keydown', { key: 'Home' });
    expect(video.currentTime).toBe(0);

    await progress().trigger('keydown', { key: 'End' });
    expect(video.currentTime).toBe(100);
  });

  it('ignores other keys and unusable media', async () => {
    mountApp();
    const video = wrapper!.findAll('video')[0].element as HTMLVideoElement;
    media(video, { duration: 100, currentTime: 10 });

    await progress().trigger('keydown', { key: 'PageDown' });
    expect(video.currentTime).toBe(10);

    media(video, { duration: 0, currentTime: 10 });
    await progress().trigger('keydown', { key: 'ArrowRight' });
    expect(video.currentTime).toBe(10);
  });

  it('forwards clicks and pointer moves', async () => {
    mountApp();

    await progress().trigger('click');
    await progress().trigger('mousemove');
    await progress().trigger('mouseleave');

    expect(state.pip.onProgressClick).toHaveBeenCalledTimes(1);
    expect(state.preview.handleMouseMove).toHaveBeenCalledTimes(1);
    expect(state.preview.handleMouseLeave).toHaveBeenCalledTimes(1);
  });

  it('exposes the rounded progress as aria-valuenow', async () => {
    state.pip.progress.value = 33.6;
    mountApp();
    expect(progress().attributes('aria-valuenow')).toBe('34');

    state.pip.progress.value = null;
    await wrapper!.vm.$nextTick();
    expect(progress().attributes('aria-valuenow')).toBe('0');
  });
});

describe('preview tooltip', () => {
  it('shows the hovered time when no thumbnail is ready', async () => {
    state.preview.previewVisible.value = true;
    state.preview.previewLeft.value = 40;
    mountApp();

    const tooltip = wrapper!.find('[role="slider"] .absolute');
    expect(tooltip.exists()).toBe(true);
    expect(tooltip.attributes('style')).toContain('left: 40%');
    expect(tooltip.text()).toContain('0:10');
  });

  it('shows the thumbnail when available', async () => {
    state.preview.previewVisible.value = true;
    state.preview.previewDataUrl.value = 'data:image/png;base64,abc';
    mountApp();

    const img = wrapper!.find('[role="slider"] img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('data:image/png;base64,abc');
  });
});
