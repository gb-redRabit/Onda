import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  library: { removeFromPlaylist: vi.fn() },
  player: {
    isFavorite: vi.fn(() => false),
    toggleFavorite: vi.fn()
  },
  showTrackMenu: vi.fn(),
  formatDuration: vi.fn((value: number, fallback: string) => `${value}s/${fallback}`)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => h.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showTrackMenu: h.showTrackMenu })
}));
vi.mock('@renderer/utils/formatters', () => ({ formatDuration: h.formatDuration }));

import LibraryTrackCard from '../LibraryTrackCard.vue';
import type { MediaFile } from '@renderer/types/media';

const CoverStub = {
  name: 'MediaCover',
  props: ['path', 'size', 'autoplay', 'still', 'fallback'],
  template: '<div data-testid="cover" />'
};
const PlaylistStub = {
  name: 'PlaylistAddMenu',
  props: ['tracks', 'iconSize', 'buttonClass'],
  template: '<div data-testid="playlist-add" />'
};

let wrapper: VueWrapper | null = null;
let track: MediaFile;

function media(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: 't1',
    name: 'Song.mp3',
    path: 'D:\\Music\\Song.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0,
    ...overrides
  };
}

function mountCard(props: Record<string, unknown> = {}) {
  track = (props.track as MediaFile | undefined) ?? media();
  wrapper = mount(LibraryTrackCard, {
    props: { track, ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { MediaCover: CoverStub, PlaylistAddMenu: PlaylistStub }
    }
  });
  return wrapper;
}

function dragWith(dt: { setData: ReturnType<typeof vi.fn>; effectAllowed: string }) {
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  wrapper!.get('[data-testid="library-track-card"]').element.dispatchEvent(event);
}

beforeEach(() => {
  h.library.removeFromPlaylist.mockClear();
  h.player.isFavorite.mockReset().mockReturnValue(false);
  h.player.toggleFavorite.mockClear();
  h.showTrackMenu.mockClear();
  h.formatDuration.mockClear();
  h.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('metadata', () => {
  it('renders the title, artist and album', () => {
    mountCard({
      track: media({
        metadata: { title: 'Title', artist: 'Artist', album: 'Album' }
      })
    });

    expect(wrapper!.text()).toContain('Title');
    expect(wrapper!.text()).toContain('Artist');
    expect(wrapper!.text()).toContain('Album');
    expect(wrapper!.get('[data-testid="library-track-select"]').attributes('aria-label')).toBe(
      'Title'
    );
  });

  it('falls back to the file name and unknown artist', () => {
    mountCard();

    expect(wrapper!.text()).toContain('Song.mp3');
    expect(wrapper!.text()).toContain('common.unknown');
    expect(wrapper!.get('[data-testid="library-track-select"]').attributes('aria-label')).toBe(
      'Song.mp3'
    );
  });

  it('does not repeat the album when it matches the artist', () => {
    mountCard({ track: media({ metadata: { artist: 'Same', album: 'Same' } }) });

    expect(wrapper!.text().match(/Same/g)).toHaveLength(1);
  });

  it('shows the duration badge only when known', () => {
    mountCard({ track: media({ duration: 65 }) });
    expect(wrapper!.text()).toContain('65s/');

    wrapper!.unmount();
    h.formatDuration.mockClear();
    mountCard();
    expect(h.formatDuration).not.toHaveBeenCalled();
  });
});

describe('selection and playback', () => {
  it('reflects the selected state', () => {
    mountCard({ selected: true });

    expect(wrapper!.get('[data-testid="library-track-card"]').classes()).toContain('bg-primary/12');
    expect(
      (wrapper!.get('[data-testid="library-track-select"]').element as HTMLInputElement).checked
    ).toBe(true);
    expect(wrapper!.find('[aria-pressed="true"]').exists()).toBe(true);
  });

  it('selects on the surface click and toggles on the checkbox', async () => {
    mountCard();
    const surface = wrapper!.get('[aria-pressed="false"]');

    await surface.trigger('click');
    await wrapper!.get('[data-testid="library-track-select"]').trigger('click');

    expect(wrapper!.emitted('select')).toHaveLength(2);
    expect(wrapper!.emitted('select')![0][1]).toBe(false);
    expect(wrapper!.emitted('select')![1][1]).toBe(true);
  });

  it('plays on double click, Enter and the play button', async () => {
    mountCard();
    const surface = wrapper!.get('[aria-pressed="false"]');

    await surface.trigger('dblclick');
    await surface.trigger('keydown', { key: 'Enter' });
    await wrapper!.get('[data-testid="library-track-play"]').trigger('click');

    expect(wrapper!.emitted('play')).toHaveLength(3);
    expect(wrapper!.emitted('play')![0]).toEqual([track]);
  });
});

describe('actions', () => {
  it('toggles the favourite state and labels', async () => {
    h.player.isFavorite.mockReturnValue(true);
    mountCard();

    const favourite = wrapper!.get('[aria-label="common.removeFav"]');
    await favourite.trigger('click');

    expect(h.player.toggleFavorite).toHaveBeenCalledWith('D:\\Music\\Song.mp3');
  });

  it('labels the favourite action when not favourited', () => {
    mountCard();

    expect(wrapper!.find('[aria-label="common.addFav"]').exists()).toBe(true);
  });

  it('emits edit from the button and from the context menu', async () => {
    mountCard();

    await wrapper!.get('[aria-label="common.editTags"]').trigger('click');
    expect(wrapper!.emitted('edit')).toEqual([[track]]);

    wrapper!.get('[data-testid="library-track-card"]').trigger('contextmenu');
    expect(h.showTrackMenu).toHaveBeenCalledWith(
      expect.any(Event),
      track,
      expect.objectContaining({ onEdit: expect.any(Function) })
    );
    const onEdit = h.showTrackMenu.mock.calls[0][2].onEdit as () => void;
    onEdit();
    expect(wrapper!.emitted('edit')).toHaveLength(2);
  });

  it('removes from a playlist only when a playlist id is provided', async () => {
    mountCard();
    expect(wrapper!.find('[aria-label="library.removeFromPlaylist"]').exists()).toBe(false);

    wrapper!.unmount();
    mountCard({ playlistId: 'pl1' });
    await wrapper!.get('[aria-label="library.removeFromPlaylist"]').trigger('click');

    expect(h.library.removeFromPlaylist).toHaveBeenCalledWith('pl1', 'D:\\Music\\Song.mp3');
  });

  it('shows the playlist menu only when requested', () => {
    mountCard();
    expect(wrapper!.find('[data-testid="playlist-add"]').exists()).toBe(false);

    wrapper!.unmount();
    mountCard({ showPlaylist: true });
    expect(wrapper!.findComponent(PlaylistStub).props('tracks')).toEqual([track]);
  });
});

describe('hover and drag', () => {
  it('autoplays the cover only while hovered', async () => {
    mountCard();
    const card = wrapper!.get('[data-testid="library-track-card"]');

    expect(wrapper!.findComponent(CoverStub).props('autoplay')).toBe(false);
    await card.trigger('mouseenter');
    expect(wrapper!.findComponent(CoverStub).props('autoplay')).toBe(true);
    await card.trigger('mouseleave');
    expect(wrapper!.findComponent(CoverStub).props('autoplay')).toBe(false);
  });

  it('starts a drag with the track path', () => {
    mountCard();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

    dragWith(dataTransfer);

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ paths: ['D:\\Music\\Song.mp3'] })
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });
});
