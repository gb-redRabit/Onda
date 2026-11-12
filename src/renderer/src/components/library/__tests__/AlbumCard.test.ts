import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  player: null as any,
  showAlbumMenu: vi.fn(),
  groupLabel: vi.fn((name: string) => `label:${name}`)
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: h.t }) };
});
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showAlbumMenu: h.showAlbumMenu })
}));
vi.mock('@renderer/utils/libraryLabels', () => ({ groupLabel: h.groupLabel }));

import AlbumCard from '../AlbumCard.vue';
import type { MediaFile } from '@renderer/types/media';

const CoverStub = {
  name: 'MediaCover',
  props: ['path', 'cover', 'size', 'renderAsVideo', 'still', 'fallback'],
  template: '<div data-testid="cover" />'
};
const PlaylistStub = {
  name: 'PlaylistAddMenu',
  props: ['tracks', 'mode', 'buttonClass'],
  template: '<div data-testid="playlist-add" />'
};

let wrapper: VueWrapper | null = null;

function track(path: string, overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0,
    ...overrides
  };
}

function mountCard(tracks: MediaFile[], name = 'Greatest Hits') {
  wrapper = mount(AlbumCard, {
    props: { name, tracks },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { MediaCover: CoverStub, PlaylistAddMenu: PlaylistStub }
    }
  });
  return wrapper;
}

function coverOf(path: string) {
  return h.player.getCover(path) as { type: string; data: string };
}

beforeEach(() => {
  h.player = reactive({
    getCover: vi.fn((path: string) =>
      path.includes('covered') ? { type: 'image', data: `img:${path}` } : { type: 'none', data: '' }
    )
  });
  h.showAlbumMenu.mockClear();
  h.groupLabel.mockClear();
  h.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('identity', () => {
  it('renders the group label, artist, track count and year', () => {
    mountCard([
      track('/music/covered/a.mp3', { metadata: { artist: 'Artist', year: 1999 } }),
      track('/music/b.mp3')
    ]);

    expect(wrapper!.text()).toContain('label:Greatest Hits');
    expect(wrapper!.text()).toContain('Artist');
    expect(wrapper!.text()).toContain('2');
    expect(wrapper!.text()).toContain('1999');
    expect(h.groupLabel).toHaveBeenCalledWith('Greatest Hits', h.t);
  });

  it('falls back to the first track metadata and then to unknown', () => {
    mountCard([track('/music/v.mp4', { type: 'video', metadata: { artist: 'Video Artist' } })]);
    expect(wrapper!.text()).toContain('Video Artist');

    wrapper!.unmount();
    mountCard([track('/music/plain.mp3')]);
    expect(wrapper!.text()).toContain('common.unknown');
  });
});

describe('cover selection', () => {
  it('prefers the first audio track for the primary cover', () => {
    mountCard([track('/music/video.mp4', { type: 'video' }), track('/music/audio.mp3')]);

    const cover = wrapper!.findComponent(CoverStub);
    expect(cover.props('path')).toBe('/music/audio.mp3');
    expect(cover.props('cover')).toEqual(coverOf('/music/audio.mp3'));
  });

  it('uses the first track with an image cover for display', () => {
    h.player.getCover.mockImplementation((path: string) =>
      path.includes('with-image') ? { type: 'image', data: 'IMAGE' } : { type: 'none', data: '' }
    );
    mountCard([track('/music/plain.mp3'), track('/music/with-image.mp3')]);

    const cover = wrapper!.findComponent(CoverStub);
    expect(cover.props('path')).toBe('/music/with-image.mp3');
    expect(cover.props('cover')).toEqual({ type: 'image', data: 'IMAGE' });
  });

  it('falls back to the first track path when nothing has an image', () => {
    mountCard([track('/music/first.mp3'), track('/music/second.mp3')]);

    expect(wrapper!.findComponent(CoverStub).props('path')).toBe('/music/first.mp3');
  });

  it('handles an empty album', () => {
    mountCard([]);

    const cover = wrapper!.findComponent(CoverStub);
    expect(cover.props('path')).toBeUndefined();
    expect(cover.props('cover')).toEqual(coverOf(''));
    expect(wrapper!.text()).toContain('common.unknown');
    expect(wrapper!.text()).toContain('0');
  });
});

describe('interactions', () => {
  it('emits play with all tracks on click', async () => {
    const tracks = [track('/music/a.mp3'), track('/music/b.mp3')];
    mountCard(tracks);

    await wrapper!.get('button').trigger('click');

    expect(wrapper!.emitted('play')).toEqual([[tracks]]);
  });

  it('opens the album context menu', async () => {
    const tracks = [track('/music/a.mp3')];
    mountCard(tracks);

    await wrapper!.get('button').trigger('contextmenu');

    expect(h.showAlbumMenu).toHaveBeenCalledWith(expect.any(Event), 'Greatest Hits', tracks);
  });

  it('starts a drag with every track path', () => {
    const tracks = [track('/music/a.mp3'), track('/music/b.mp3')];
    mountCard(tracks);
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });

    wrapper!.get('button').element.dispatchEvent(event);

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ paths: ['/music/a.mp3', '/music/b.mp3'] })
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('passes the tracks to the playlist menu', () => {
    const tracks = [track('/music/a.mp3')];

    mountCard(tracks);

    const menu = wrapper!.findComponent(PlaylistStub);
    expect(menu.props('tracks')).toEqual(tracks);
    expect(menu.props('mode')).toBe('add');
  });
});
