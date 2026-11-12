import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

import ImageViewerToolbar from '../ImageViewerToolbar.vue';

const SettingsStub = defineComponent({
  name: 'ImageViewerSettings',
  props: [
    'interval',
    'transitionType',
    'transitionDuration',
    'loop',
    'shuffle',
    'kenBurns',
    'autoHide'
  ],
  emits: [
    'update:interval',
    'update:transition-type',
    'update:transition-duration',
    'update:loop',
    'update:shuffle',
    'update:ken-burns',
    'update:auto-hide'
  ],
  template: '<div data-testid="settings" />'
});

let wrapper: VueWrapper | null = null;

function props(overrides: Record<string, unknown> = {}) {
  return {
    slideshowActive: false,
    settingsOpen: false,
    slideshowInterval: 5,
    transitionType: 'fade',
    transitionDuration: 400,
    loop: true,
    shuffle: false,
    kenBurns: false,
    autoHide: true,
    fullscreen: false,
    uiVisible: true,
    ...overrides
  };
}

function mountToolbar(overrides: Record<string, unknown> = {}) {
  wrapper = mount(ImageViewerToolbar, {
    props: props(overrides),
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { ImageViewerSettings: SettingsStub }
    }
  });
  return wrapper;
}

function testId(id: string) {
  return wrapper!.get(`[data-testid="${id}"]`);
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('visibility', () => {
  it('hides the toolbar during a slideshow when the UI is hidden', () => {
    mountToolbar({ slideshowActive: true, uiVisible: false });

    expect(wrapper!.get('div').classes()).toContain('opacity-0');
    expect(wrapper!.get('div').classes()).toContain('pointer-events-none');
  });

  it('stays visible outside that combination', () => {
    mountToolbar({ slideshowActive: true, uiVisible: true });
    expect(wrapper!.get('div').classes()).not.toContain('opacity-0');

    wrapper!.unmount();
    mountToolbar({ slideshowActive: false, uiVisible: false });
    expect(wrapper!.get('div').classes()).not.toContain('opacity-0');
  });
});

describe('actions', () => {
  it.each([
    ['image-viewer-close', 'close'],
    ['image-viewer-fit', 'fitToScreen'],
    ['image-viewer-zoom-in', 'zoomIn'],
    ['image-viewer-zoom-out', 'zoomOut'],
    ['image-viewer-rotate', 'rotate'],
    ['image-viewer-edit', 'edit'],
    ['image-viewer-fullscreen', 'toggleFullscreen']
  ])('emits %s', async (id, event) => {
    mountToolbar();

    await testId(id).trigger('click');

    expect(wrapper!.emitted(event)).toHaveLength(1);
  });
});

describe('slideshow', () => {
  it('toggles slideshow and reflects the active state', async () => {
    mountToolbar({ slideshowActive: true });

    const button = testId('image-viewer-slideshow');
    expect(button.attributes('aria-label')).toBe('imageViewer.stopSlideshow');
    expect(button.classes()).toContain('text-primary-text');

    await button.trigger('click');
    expect(wrapper!.emitted('toggleSlideshow')).toHaveLength(1);
  });

  it('labels the idle slideshow button', () => {
    mountToolbar();

    expect(testId('image-viewer-slideshow').attributes('aria-label')).toBe(
      'imageViewer.startSlideshow'
    );
    expect(testId('image-viewer-slideshow').classes()).toContain('text-base-content/70');
  });

  it('marks the fullscreen button when active', () => {
    mountToolbar({ fullscreen: true });

    expect(testId('image-viewer-fullscreen').classes()).toContain('text-primary-text');
  });
});

describe('settings', () => {
  it('toggles the settings panel', async () => {
    mountToolbar({ settingsOpen: true });

    expect(wrapper!.find('[data-testid="settings"]').exists()).toBe(true);
    expect(testId('image-viewer-slideshow-settings').classes()).toContain('text-primary-text');

    await testId('image-viewer-slideshow-settings').trigger('click');
    expect(wrapper!.emitted('toggleSettings')).toHaveLength(1);
  });

  it('passes settings values and forwards every update', () => {
    mountToolbar({ settingsOpen: true });
    const settings = wrapper!.findComponent(SettingsStub);

    expect(settings.props()).toMatchObject({
      interval: 5,
      transitionType: 'fade',
      transitionDuration: 400,
      loop: true,
      shuffle: false,
      kenBurns: false,
      autoHide: true
    });

    settings.vm.$emit('update:interval', 9);
    settings.vm.$emit('update:transition-type', 'zoom');
    settings.vm.$emit('update:transition-duration', 800);
    settings.vm.$emit('update:loop', false);
    settings.vm.$emit('update:shuffle', true);
    settings.vm.$emit('update:ken-burns', true);
    settings.vm.$emit('update:auto-hide', false);

    expect(wrapper!.emitted('update:interval')).toEqual([[9]]);
    expect(wrapper!.emitted('update:transition-type')).toEqual([['zoom']]);
    expect(wrapper!.emitted('update:transition-duration')).toEqual([[800]]);
    expect(wrapper!.emitted('update:loop')).toEqual([[false]]);
    expect(wrapper!.emitted('update:shuffle')).toEqual([[true]]);
    expect(wrapper!.emitted('update:ken-burns')).toEqual([[true]]);
    expect(wrapper!.emitted('update:auto-hide')).toEqual([[false]]);
  });

  it('keeps settings unmounted when closed', () => {
    mountToolbar();

    expect(wrapper!.find('[data-testid="settings"]').exists()).toBe(false);
  });
});
