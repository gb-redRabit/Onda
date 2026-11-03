import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// `vi.hoisted`, bo fabryka mocka wykonuje się przed ciałem modułu — zwykłe
// `const` byłoby wtedy jeszcze w TDZ.
const state = vi.hoisted(() => ({
  track: { path: 'D:/music/a.flac', type: 'audio' } as { path: string; type: string } | null,
  favorites: [] as string[],
  toggleFavorite: vi.fn()
}));

vi.mock('@renderer/stores/player', () => ({
  usePlayerStore: () => ({
    get currentTrack() {
      return state.track;
    },
    isFavorite: (path: string) => state.favorites.includes(path),
    toggleFavorite: state.toggleFavorite
  })
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

import AudioFavoriteElement from '../AudioFavoriteElement.vue';

function mountElement(variant?: string) {
  return mount(AudioFavoriteElement, { props: { variant } });
}

beforeEach(() => {
  state.track = { path: 'D:/music/a.flac', type: 'audio' };
  state.favorites = [];
  state.toggleFavorite.mockClear();
});

describe('AudioFavoriteElement', () => {
  it('toggles the current track in favorites', async () => {
    const wrapper = mountElement();
    await wrapper.get('button').trigger('click');
    expect(state.toggleFavorite).toHaveBeenCalledWith('D:/music/a.flac');
  });

  it('reflects the favorite state through aria-pressed', () => {
    state.favorites = ['D:/music/a.flac'];
    const wrapper = mountElement();
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true');
  });

  it('disables the button when nothing is playing', () => {
    state.track = null;
    const wrapper = mountElement();
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  });

  it('shows the label in the chip variant', () => {
    const wrapper = mountElement('chip');
    expect(wrapper.text()).toContain('audioView.favoriteLabel');
  });
});
