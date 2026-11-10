import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  library: { removeFromPlaylist: vi.fn() },
  player: {
    isFavorite: vi.fn(() => false),
    setTrack: vi.fn(),
    play: vi.fn(),
    toggleFavorite: vi.fn()
  },
  showTrackMenu: vi.fn(),
  formatDuration: vi.fn((value: unknown, fallback: string) =>
    typeof value === 'number' ? `dur:${value}` : fallback
  )
}));

vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => h.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showTrackMenu: h.showTrackMenu })
}));
vi.mock('@renderer/utils/formatters', () => ({ formatDuration: h.formatDuration }));

const CoverStub = defineComponent({
  name: 'MediaCover',
  props: { path: String, size: Number, autoplay: Boolean, fallback: String },
  template: '<span data-testid="cover" :data-autoplay="String(autoplay)" />'
});
const IconButtonStub = defineComponent({
  name: 'IconButton',
  props: ['icon', 'label', 'pressed', 'variant'],
  emits: ['click'],
  template:
    '<button :aria-label="label" :data-variant="variant" :data-pressed="String(pressed)" @click="$emit(\'click\', $event)"><slot /></button>'
});
const HighlightStub = defineComponent({
  name: 'HighlightText',
  props: ['text', 'query'],
  template: '<span data-testid="highlight">{{ text }}</span>'
});
const PlaylistStub = defineComponent({
  name: 'PlaylistAddMenu',
  props: ['tracks', 'buttonClass'],
  template: '<span data-testid="playlist-menu" />'
});

import LibraryTrackRow from '../LibraryTrackRow.vue';

let wrapper: VueWrapper | null = null;

function track(overrides: Record<string, unknown> = {}) {
  return {
    path: 'D:/music/song.mp3',
    name: 'song.mp3',
    extension: 'mp3',
    duration: 125,
    metadata: { title: 'Song', artist: 'Artist', album: 'Album' },
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(LibraryTrackRow, {
    props: { track: track(), ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        MediaCover: CoverStub,
        IconButton: IconButtonStub,
        HighlightText: HighlightStub,
        PlaylistAddMenu: PlaylistStub
      }
    }
  });
  return wrapper;
}

function row() {
  return wrapper!.get('[data-testid="library-track"]');
}

function iconButton(label: string) {
  return wrapper!.get(`[aria-label="${label}"]`);
}

beforeEach(() => {
  h.library.removeFromPlaylist.mockReset();
  h.player.isFavorite.mockReset();
  h.player.isFavorite.mockReturnValue(false);
  h.player.setTrack.mockReset();
  h.player.play.mockReset();
  h.player.toggleFavorite.mockReset();
  h.showTrackMenu.mockReset();
  h.formatDuration.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('rendering', () => {
  it('shows metadata and duration', () => {
    setup();

    expect(wrapper!.text()).toContain('Song');
    expect(wrapper!.text()).toContain('Artist');
    expect(wrapper!.text()).toContain('Album');
    expect(wrapper!.text()).toContain('dur:125');
    expect(wrapper!.get('[data-testid="cover"]').attributes('data-autoplay')).toBe('false');
  });

  it('falls back to the file name, unknown artist and extension', () => {
    setup({ track: track({ name: 'raw.flac', extension: 'flac', metadata: {} }) });

    expect(wrapper!.text()).toContain('raw.flac');
    expect(wrapper!.text()).toContain('common.unknown');
    expect(wrapper!.text()).toContain('flac');
    expect(wrapper!.text()).not.toContain('Album');
  });

  it('marks the selected row and checkbox', () => {
    setup({ selected: true });

    expect(row().classes()).toContain('bg-primary/10');
    expect(
      (wrapper!.get('[data-testid="library-track-select"]').element as HTMLInputElement).checked
    ).toBe(true);
  });

  it('reflects favorite state in the heart button', async () => {
    setup();
    expect(iconButton('common.addFav').attributes('data-variant')).toBe('default');

    h.player.isFavorite.mockReturnValue(true);
    await wrapper!.setProps({ track: track({ path: 'D:/music/other.mp3' }) });

    expect(iconButton('common.removeFav').attributes('data-variant')).toBe('danger');
  });

  it('shows playlist and delete controls only when configured', async () => {
    setup();
    expect(wrapper!.find('[data-testid="playlist-menu"]').exists()).toBe(false);
    expect(wrapper!.find('[aria-label="common.delete"]').exists()).toBe(false);

    await wrapper!.setProps({ showPlaylist: true, playlistId: 'p1' });
    expect(wrapper!.find('[data-testid="playlist-menu"]').exists()).toBe(true);
    expect(wrapper!.find('[aria-label="common.delete"]').exists()).toBe(true);
  });
});

describe('selection and playback', () => {
  it('emits selection on row click and checkbox', async () => {
    setup();

    await row().trigger('click');
    const checkbox = wrapper!.get('[data-testid="library-track-select"]');
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');
    await checkbox.trigger('click');

    expect(wrapper!.emitted('select')).toHaveLength(2);
    expect((wrapper!.emitted('select')![0] as unknown[])[1]).toBe(false);
    expect((wrapper!.emitted('select')![1] as unknown[])[1]).toBe(true);
    expect(stop).toHaveBeenCalled();
  });

  it('selects with Space', async () => {
    setup();
    await row().trigger('keydown', { key: ' ' });

    expect(wrapper!.emitted('select')).toHaveLength(1);
    expect((wrapper!.emitted('select')![0] as unknown[])[1]).toBe(false);
  });

  it('plays on double click and the play button', async () => {
    setup();

    await row().trigger('dblclick');
    await wrapper!.get('[data-testid="library-track-play"]').trigger('click');

    expect(wrapper!.emitted('play')).toHaveLength(2);
    expect(h.player.setTrack).toHaveBeenCalledTimes(2);
    expect(h.player.play).toHaveBeenCalledTimes(2);
  });

  it('plays with Enter', async () => {
    setup();
    await row().trigger('keydown', { key: 'Enter' });

    expect(wrapper!.emitted('play')).toHaveLength(1);
    expect(h.player.play).toHaveBeenCalledTimes(1);
  });

  it('toggles the favorite without selecting the row', async () => {
    setup();
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');

    await iconButton('common.addFav').trigger('click');

    expect(h.player.toggleFavorite).toHaveBeenCalledWith('D:/music/song.mp3');
    expect(stop).toHaveBeenCalled();
    expect(wrapper!.emitted('select')).toBeUndefined();
  });

  it('removes the track from its playlist', async () => {
    setup({ playlistId: 'p9' });

    await iconButton('common.delete').trigger('click');

    expect(h.library.removeFromPlaylist).toHaveBeenCalledWith('p9', 'D:/music/song.mp3');
  });

  it('emits edit from the edit button and context menu', async () => {
    setup();

    await iconButton('common.editTags').trigger('click');
    const event = new MouseEvent('contextmenu');
    row().element.dispatchEvent(event);

    expect(wrapper!.emitted('edit')).toHaveLength(1);
    expect(h.showTrackMenu).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ path: 'D:/music/song.mp3' }),
      expect.objectContaining({ onEdit: expect.any(Function) })
    );
    h.showTrackMenu.mock.calls[0][2].onEdit();
    expect(wrapper!.emitted('edit')).toHaveLength(2);
  });
});

describe('hover and drag', () => {
  it('enables cover autoplay on hover', async () => {
    setup();
    const cover = () => wrapper!.get('[data-testid="cover"]');

    await row().trigger('mouseenter');
    expect(cover().attributes('data-autoplay')).toBe('true');

    await row().trigger('mouseleave');
    expect(cover().attributes('data-autoplay')).toBe('false');
  });

  it('serializes the drag payload', async () => {
    setup({ playlistId: 'p1', dragIndex: 3 });
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

    row().element.dispatchEvent(new Event('dragstart') as DragEvent);
    const drag = new Event('dragstart') as DragEvent;
    Object.defineProperty(drag, 'dataTransfer', { value: dataTransfer });
    row().element.dispatchEvent(drag);

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ paths: ['D:/music/song.mp3'], playlistId: 'p1', dragIndex: 3 })
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('omits playlist fields outside a playlist', () => {
    setup();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    const drag = new Event('dragstart') as DragEvent;
    Object.defineProperty(drag, 'dataTransfer', { value: dataTransfer });

    row().element.dispatchEvent(drag);

    expect(JSON.parse(dataTransfer.setData.mock.calls[0][1])).toEqual({
      paths: ['D:/music/song.mp3']
    });
  });
});
