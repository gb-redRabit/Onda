import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  player: null as any,
  showTrackMenu: vi.fn(),
  request: vi.fn(),
  getThumb: vi.fn(),
  formatDuration: vi.fn((value: number, fallback: string) => `${value}s/${fallback}`)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showTrackMenu: h.showTrackMenu })
}));
vi.mock('@renderer/composables/useThumbnails', () => ({
  useThumbnails: () => ({ request: h.request, getThumb: h.getThumb })
}));
vi.mock('@renderer/utils/formatters', () => ({ formatDuration: h.formatDuration }));

import VideoCard from '../VideoCard.vue';
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
    name: 'clip.mp4',
    path: 'D:\\Videos\\clip.mp4',
    extension: 'mp4',
    mimeType: 'video/mp4',
    size: 10,
    type: 'video',
    addedAt: 0,
    playCount: 0,
    ...overrides
  };
}

function mountCard(track: MediaFile = video()) {
  current = track;
  wrapper = mount(VideoCard, {
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
    getCover: vi.fn(() => ({ type: 'none', data: '' }))
  });
  h.showTrackMenu.mockClear();
  h.request.mockClear();
  h.getThumb.mockReset().mockReturnValue(new Uint8Array([9]));
  h.formatDuration.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('covers', () => {
  it('requests a thumbnail on mount and on path changes', async () => {
    mountCard();
    expect(h.request).toHaveBeenCalledWith(['D:\\Videos\\clip.mp4']);

    await wrapper!.setProps({ track: video({ path: 'D:\\Videos\\next.mp4' }) });

    expect(h.request).toHaveBeenLastCalledWith(['D:\\Videos\\next.mp4']);
  });

  it('prefers the generated thumbnail', () => {
    mountCard();

    expect(wrapper!.findComponent(CoverStub).props('cover')).toEqual({
      type: 'image',
      data: new Uint8Array([9])
    });
  });

  it('falls back to the player cover', () => {
    h.getThumb.mockReturnValue(null);
    h.player.getCover.mockReturnValue({ type: 'image', data: 'cached' });

    mountCard();

    expect(wrapper!.findComponent(CoverStub).props('cover')).toEqual({
      type: 'image',
      data: 'cached'
    });
  });

  it('falls back to a forward-slash video placeholder', () => {
    h.getThumb.mockReturnValue(null);
    h.player.getCover.mockReturnValue({ type: 'none', data: '' });

    mountCard();

    expect(wrapper!.findComponent(CoverStub).props('cover')).toEqual({
      type: 'video',
      data: 'D:/Videos/clip.mp4'
    });
  });
});

describe('presentation', () => {
  it('renders the file name and duration', () => {
    mountCard(video({ duration: 75 }));

    expect(wrapper!.text()).toContain('clip.mp4');
    expect(wrapper!.text()).toContain('75s/');
  });

  it('hides the duration badge when duration is unknown', () => {
    mountCard(video({ duration: 0 }));

    expect(wrapper!.html()).not.toContain('text-2xs font-medium');
  });
});

describe('interactions', () => {
  it('emits play on click', async () => {
    mountCard();

    await wrapper!.get('[data-testid="video-card"]').trigger('click');

    expect(wrapper!.emitted('play')).toEqual([[current]]);
  });

  it('opens the track context menu', async () => {
    mountCard();

    await wrapper!.get('[data-testid="video-card"]').trigger('contextmenu');

    expect(h.showTrackMenu).toHaveBeenCalledWith(expect.any(Event), current);
  });

  it('starts a drag with the single path', () => {
    mountCard();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });

    wrapper!.get('[data-testid="video-card"]').element.dispatchEvent(event);

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ paths: ['D:\\Videos\\clip.mp4'] })
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });
});
