import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  t: vi.fn((key: string) => key),
  player: null as any,
  showTrackMenu: vi.fn(),
  request: vi.fn(),
  getThumb: vi.fn(),
  formatDuration: vi.fn((value: number, fallback: string) => `${value}s/${fallback}`)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: h.t }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showTrackMenu: h.showTrackMenu })
}));
vi.mock('@renderer/composables/useThumbnails', () => ({
  useThumbnails: () => ({ request: h.request, getThumb: h.getThumb })
}));
vi.mock('@renderer/utils/formatters', () => ({ formatDuration: h.formatDuration }));

import LibraryVideoRow from '../LibraryVideoRow.vue';
import type { MediaFile } from '@renderer/types/media';

const CoverStub = {
  name: 'MediaCover',
  props: ['cover', 'size', 'fallback'],
  template: '<div data-testid="cover" />'
};

let wrapper: VueWrapper | null = null;
let current: MediaFile;

function video(overrides: Partial<MediaFile> = {}): MediaFile {
  return {
    id: 'v1',
    name: 'movie.MKV',
    path: 'D:\\Movies\\movie.mkv',
    extension: 'mkv',
    mimeType: 'video/mkv',
    size: 10,
    type: 'video',
    addedAt: 0,
    playCount: 0,
    ...overrides
  };
}

function mountRow(track: MediaFile = video()) {
  current = track;
  wrapper = mount(LibraryVideoRow, {
    props: { track },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { MediaCover: CoverStub }
    }
  });
  return wrapper;
}

beforeEach(() => {
  h.player = reactive({
    getCover: vi.fn(() => ({ type: 'none', data: '' })),
    addToQueue: vi.fn()
  });
  h.showTrackMenu.mockClear();
  h.request.mockClear();
  h.getThumb.mockReset().mockReturnValue(new Uint8Array([1, 2]));
  h.formatDuration.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('thumbnails and covers', () => {
  it('requests a thumbnail for the track path on mount', () => {
    mountRow();

    expect(h.request).toHaveBeenCalledWith(['D:\\Movies\\movie.mkv']);
  });

  it('requests a new thumbnail when the path changes', async () => {
    mountRow();

    await wrapper!.setProps({ track: video({ path: 'D:\\Movies\\next.mkv' }) });

    expect(h.request).toHaveBeenLastCalledWith(['D:\\Movies\\next.mkv']);
  });

  it('prefers the generated thumbnail', () => {
    mountRow();

    expect(wrapper!.findComponent(CoverStub).props('cover')).toEqual({
      type: 'image',
      data: new Uint8Array([1, 2])
    });
  });

  it('falls back to the player cover', () => {
    h.getThumb.mockReturnValue(null);
    h.player.getCover.mockReturnValue({ type: 'image', data: 'cover-data' });

    mountRow();

    expect(wrapper!.findComponent(CoverStub).props('cover')).toEqual({
      type: 'image',
      data: 'cover-data'
    });
  });

  it('falls back to a video placeholder with forward slashes', () => {
    h.getThumb.mockReturnValue(null);
    h.player.getCover.mockReturnValue({ type: 'none', data: '' });

    mountRow();

    expect(wrapper!.findComponent(CoverStub).props('cover')).toEqual({
      type: 'video',
      data: 'D:/Movies/movie.mkv'
    });
  });
});

describe('metadata', () => {
  it('renders the metadata title, extension and duration', () => {
    mountRow(video({ metadata: { title: 'Fancy Title' }, duration: 90 }));

    expect(wrapper!.text()).toContain('Fancy Title');
    expect(wrapper!.text()).toContain('MKV');
    expect(wrapper!.text()).toContain('90s/');
  });

  it('falls back to the file name and unknown extension', () => {
    mountRow(video({ metadata: {}, extension: '' }));

    expect(wrapper!.text()).toContain('movie.MKV');
    expect(wrapper!.text()).toContain('common.unknown');
  });

  it('shows the duration badge only when duration is known', () => {
    mountRow(video({ duration: 125 }));

    expect(wrapper!.html()).toContain('text-3xs');

    wrapper!.unmount();
    mountRow(video({ duration: 0 }));

    expect(wrapper!.html()).not.toContain('text-3xs');
  });
});

describe('interactions', () => {
  it('emits play on double click and on the play button', async () => {
    mountRow();
    const row = wrapper!.get('.group');

    await row.trigger('dblclick');
    await wrapper!.get('[aria-label="common.play"]').trigger('click');

    expect(wrapper!.emitted('play')).toHaveLength(2);
    expect(wrapper!.emitted('play')![0]).toEqual([current]);
  });

  it('opens the track context menu', async () => {
    mountRow();

    await wrapper!.get('.group').trigger('contextmenu');

    expect(h.showTrackMenu).toHaveBeenCalledWith(expect.any(Event), current);
  });

  it('starts a drag with the track path', () => {
    mountRow();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });

    wrapper!.get('.group').element.dispatchEvent(event);

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ paths: ['D:\\Movies\\movie.mkv'] })
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('queues the track without emitting play', async () => {
    mountRow();

    await wrapper!.get('[title="common.addToQueue"]').trigger('click');

    expect(h.player.addToQueue).toHaveBeenCalledWith(current);
    expect(wrapper!.emitted('play')).toBeUndefined();
  });
});
