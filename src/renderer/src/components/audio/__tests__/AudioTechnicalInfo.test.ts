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

describe('AudioTechnicalInfo edge cases', () => {
  function setTrack(next: unknown): void {
    (state as { track: unknown }).track = next;
  }

  it('falls back to the metadata format without an extension', () => {
    setTrack({
      path: '/a.bin',
      size: 0,
      type: 'audio',
      metadata: { format: 'mp3', bitrate: 0, sampleRate: -1 }
    });
    const text = mountElement().text();
    expect(text).toContain('MP3');
    expect(text).not.toContain('kb/s');
    expect(text).not.toContain('kHz');
    expect(text).not.toContain('audioView.losslessLabel');
  });

  it('strips a leading dot from the extension', () => {
    setTrack({ path: '/a', extension: '.WA V', type: 'audio' });
    const text = mountElement().text();
    expect(text).toContain('WA V');
  });

  it('honours an explicit lossless flag', () => {
    setTrack({
      path: '/a.m4a',
      extension: 'm4a',
      type: 'audio',
      metadata: { lossless: true, sampleRate: 48_000 }
    });
    const text = mountElement().text();
    expect(text).toContain('audioView.losslessLabel');
    expect(text).toContain('48 kHz');
  });

  it('renders with a track that has no metadata', () => {
    setTrack({ path: '/a', type: 'audio' });
    const wrapper = mountElement();
    expect(wrapper.find('[data-testid="audio-technical"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('audioView.losslessLabel');
  });
});
