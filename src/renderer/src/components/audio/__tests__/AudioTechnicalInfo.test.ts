import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const state = vi.hoisted(() => ({
  track: {
    path: 'D:/music/a.flac',
    extension: 'flac',
    size: 4_194_304,
    type: 'audio',
    metadata: {
      format: 'FLAC',
      codec: 'FLAC',
      bitrate: 1_411_200,
      sampleRate: 44_100
    }
  }
}));

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({ currentTrack: state.track })
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

import AudioTechnicalInfo from '../AudioTechnicalInfo.vue';

function mountElement(variant?: string) {
  return mount(AudioTechnicalInfo, { props: { variant } });
}

describe('AudioTechnicalInfo', () => {
  it('renders format, bitrate, sample rate and size as chips', () => {
    const wrapper = mountElement();
    const text = wrapper.text();
    expect(text).toContain('FLAC');
    expect(text).toContain('1411 kb/s');
    expect(text).toContain('44.1 kHz');
    expect(text).toContain('4.0 MB');
  });

  it('marks lossless formats', () => {
    const wrapper = mountElement();
    expect(wrapper.text()).toContain('audioView.losslessLabel');
  });

  it('joins the same values into one line in the inline variant', () => {
    const wrapper = mountElement('inline');
    expect(wrapper.text()).toBe('FLAC · 1411 kb/s · 44.1 kHz · 4.0 MB');
  });

  it('omits the file size in the minimal variant', () => {
    const wrapper = mountElement('minimal');
    expect(wrapper.text()).toContain('FLAC · 1411 kb/s · 44.1 kHz');
    expect(wrapper.text()).not.toContain('MB');
  });
});
