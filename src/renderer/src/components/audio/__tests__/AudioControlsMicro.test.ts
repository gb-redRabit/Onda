import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  audio: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/composables/useAudioPlayer', () => ({ useAudioPlayer: () => h.audio }));
vi.mock('@renderer/utils/audioControls', () => ({
  PLAY_BOX: { micro: 'box-micro' },
  PLAY_SIZE: { micro: 12 }
}));

import AudioControlsMicro from '../AudioControlsMicro.vue';

beforeEach(() => {
  h.audio = {
    isPlaying: ref(false),
    play: vi.fn(),
    pause: vi.fn()
  };
  h.t.mockClear();
});

describe('AudioControlsMicro', () => {
  it('shows the play icon while paused', () => {
    const wrapper = mount(AudioControlsMicro);
    const button = wrapper.get('button');

    expect(button.attributes('aria-label')).toBe('common.play');
    expect(button.classes()).toContain('box-micro');
    expect(wrapper.find('button').exists()).toBe(true);
  });

  it('starts playback on click', async () => {
    const wrapper = mount(AudioControlsMicro);

    await wrapper.get('button').trigger('click');

    expect(h.audio.play).toHaveBeenCalledTimes(1);
    expect(h.audio.pause).not.toHaveBeenCalled();
  });

  it('shows the pause icon while playing and pauses on click', async () => {
    h.audio.isPlaying.value = true;
    const wrapper = mount(AudioControlsMicro);
    const button = wrapper.get('button');

    expect(button.attributes('aria-label')).toBe('common.pause');

    await button.trigger('click');

    expect(h.audio.pause).toHaveBeenCalledTimes(1);
    expect(h.audio.play).not.toHaveBeenCalled();
  });
});
