import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  settings: null as any,
  updatePlayback: vi.fn()
}));

vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => h.settings }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import VideoFilterDropdown from '../VideoFilterDropdown.vue';

let wrapper: VueWrapper | null = null;

function setup() {
  wrapper = mount(VideoFilterDropdown, {
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

function trigger() {
  return wrapper!.get('[aria-label="settings.videoFilter"]');
}

function menu() {
  return wrapper!.find('.absolute.bottom-full');
}

beforeEach(() => {
  h.updatePlayback.mockReset();
  h.settings = reactive({
    playback: { videoFilter: 'none' },
    updatePlayback: h.updatePlayback
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('opening', () => {
  it('opens and closes the menu', async () => {
    setup();
    expect(menu().exists()).toBe(false);
    expect(trigger().attributes('aria-expanded')).toBe('false');

    await trigger().trigger('click');
    expect(menu().exists()).toBe(true);
    expect(trigger().attributes('aria-expanded')).toBe('true');

    await trigger().trigger('click');
    expect(menu().exists()).toBe(false);
  });

  it('highlights the trigger for an active filter', async () => {
    h.settings.playback.videoFilter = 'grayscale(100%)';
    setup();
    expect(trigger().classes()).toContain('text-primary-text!');
  });

  it('closes on outside clicks but not inside', async () => {
    setup();
    await trigger().trigger('click');

    (menu().element as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(menu().exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper!.vm.$nextTick();
    expect(menu().exists()).toBe(false);
  });

  it('removes the document listener on unmount', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    setup();
    await trigger().trigger('click');

    wrapper!.unmount();
    wrapper = null;

    expect(remove).toHaveBeenCalledWith('click', expect.any(Function));
  });
});

describe('filters', () => {
  it('renders every filter with translated labels', async () => {
    setup();
    await trigger().trigger('click');

    const filters = menu()
      .findAll('button')
      .filter((button) => button.text().startsWith('videoFilters.'));
    expect(filters).toHaveLength(9);
    expect(filters[0].text()).toBe('videoFilters.none');
    expect(filters[1].text()).toBe('videoFilters.grayscale');
    expect(wrapper!.text()).toContain('videoFilters.title');
  });

  it('marks the active filter and dot', async () => {
    h.settings.playback.videoFilter = 'sepia(80%)';
    setup();
    await trigger().trigger('click');

    const active = menu()
      .findAll('button')
      .find((button) => button.text() === 'videoFilters.sepia')!;
    expect(active.classes()).toContain('text-primary-text!');
    expect(active.find('.bg-primary').exists()).toBe(true);
  });

  it('applies a filter and closes the menu', async () => {
    setup();
    await trigger().trigger('click');

    const blur = menu()
      .findAll('button')
      .find((button) => button.text() === 'videoFilters.blur')!;
    await blur.trigger('click');

    expect(h.updatePlayback).toHaveBeenCalledWith({ videoFilter: 'blur(2px)' });
    expect(menu().exists()).toBe(false);
  });

  it('maps every preset to its CSS filter', async () => {
    setup();
    await trigger().trigger('click');
    const expected = [
      ['videoFilters.none', 'none'],
      ['videoFilters.grayscale', 'grayscale(100%)'],
      ['videoFilters.sepia', 'sepia(80%)'],
      ['videoFilters.highContrast', 'contrast(150%)'],
      ['videoFilters.brightness', 'brightness(150%)'],
      ['videoFilters.saturation', 'saturate(200%)'],
      ['videoFilters.invert', 'invert(100%)'],
      ['videoFilters.blur', 'blur(2px)'],
      ['videoFilters.hueRotate', 'hue-rotate(90deg)']
    ];

    for (const [label, css] of expected) {
      if (!menu().exists()) await trigger().trigger('click');
      const button = menu()
        .findAll('button')
        .find((candidate) => candidate.text() === label)!;
      await button.trigger('click');
      expect(h.updatePlayback).toHaveBeenLastCalledWith({ videoFilter: css });
    }
  });
});
