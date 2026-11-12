import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

// Compact jest audio-only: wideo z kolejki Core nie może być widoczne ani
// klikalne, a remove/reorder muszą trafiać w oryginalne indeksy kolejki.
const h = vi.hoisted(() => ({
  player: {} as Record<string, unknown>,
  virtualExtra: false
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));

vi.mock('@renderer/composables/useVirtualList', async () => {
  const { ref } = await import('vue');
  return {
    useVirtualList: (opts: {
      count: () => number;
      scrollEl?: () => unknown;
      estimateSize?: () => number;
      measureElement?: (element: Element) => void;
    }) =>
      ref({
        getTotalSize: () => {
          opts.scrollEl?.();
          opts.estimateSize?.();
          opts.measureElement?.({ getBoundingClientRect: () => ({ height: 40 }) } as Element);
          return opts.count() * 40;
        },
        getVirtualItems: () => {
          const items: Array<{ index: number; key: number | string; start: number; size: number }> =
            Array.from({ length: opts.count() }, (_, index) => ({
              index,
              key: index,
              start: index * 40,
              size: 40
            }));
          if (h.virtualExtra) {
            items.push({ index: opts.count(), key: 'extra', start: opts.count() * 40, size: 40 });
          }
          return items;
        },
        measureElement: () => {}
      })
  };
});

function makeTrack(id: string, type: 'audio' | 'video') {
  return {
    id,
    path: `C:/media/${id}`,
    name: id,
    type,
    duration: 60,
    metadata: { title: `Title ${id}`, artist: 'Artist' }
  };
}

import CompactQueue from '../CompactQueue.vue';
import en from '../../locales/en';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

const audioA = makeTrack('a.mp3', 'audio');
const videoB = makeTrack('b.mp4', 'video');
const audioC = makeTrack('c.mp3', 'audio');

function mountQueue() {
  return mount(CompactQueue, {
    global: {
      plugins: [i18n],
      stubs: { MediaCover: true }
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.virtualExtra = false;
  Object.assign(h.player, {
    currentTrack: null,
    displayQueue: [audioA, videoB, audioC],
    setTrack: vi.fn(),
    removeFromQueue: vi.fn(),
    reorderQueue: vi.fn(),
    clearQueue: vi.fn()
  });
});

describe('CompactQueue — audio-only view', () => {
  it('hides video entries but keeps audio', () => {
    const w = mountQueue();
    expect(w.findAll('[data-testid^="compact-queue-item-"]')).toHaveLength(2);
    expect(w.find('[data-testid="compact-queue-item-0"]').text()).toContain('Title a.mp3');
    expect(w.find('[data-testid="compact-queue-item-1"]').text()).toContain('Title c.mp3');
    expect(w.text()).not.toContain('b.mp4');
  });

  it('maps compact row actions back to the original queue indices', async () => {
    const w = mountQueue();
    await w.find('[data-testid="compact-queue-item-1"] [title="Play now"]').trigger('click');

    expect(h.player.setTrack).toHaveBeenCalledWith(audioC);
    expect(h.player.removeFromQueue).toHaveBeenCalledWith(2);
  });

  it('removes the audio entry by its original index', async () => {
    const w = mountQueue();
    const row = w.find('[data-testid="compact-queue-item-0"]');
    await row.find('[aria-label="Remove"]').trigger('click');
    expect(h.player.removeFromQueue).toHaveBeenCalledWith(0);
  });

  it('reorders only across audio entries using original indices', async () => {
    const w = mountQueue();
    await w.find('[data-testid="compact-queue-grip-0"]').trigger('keydown', {
      key: 'ArrowDown',
      altKey: true
    });
    expect(h.player.reorderQueue).toHaveBeenCalledWith(0, 2);
  });
});

describe('CompactQueue drag, keyboard and scrolling', () => {
  it('reorders when a row is dropped on another and ignores drops without a drag', async () => {
    const w = mountQueue();
    const first = w.find('[data-testid="compact-queue-item-0"]');
    const second = w.find('[data-testid="compact-queue-item-1"]');

    await second.trigger('drop');
    expect(h.player.reorderQueue).not.toHaveBeenCalled();

    await first.trigger('dragstart');
    await second.trigger('drop');

    expect(h.player.reorderQueue).toHaveBeenCalledWith(0, 2);
    await second.trigger('drop');
    expect(h.player.reorderQueue).toHaveBeenCalledTimes(1);
  });

  it('moves rows with Alt+Arrow keys and skips the edges', async () => {
    const w = mountQueue();

    await w.find('[data-testid="compact-queue-grip-0"]').trigger('keydown', {
      key: 'ArrowUp',
      altKey: true
    });
    await w.find('[data-testid="compact-queue-grip-1"]').trigger('keydown', {
      key: 'ArrowUp',
      altKey: true
    });

    expect(h.player.reorderQueue).toHaveBeenCalledTimes(1);
    expect(h.player.reorderQueue).toHaveBeenCalledWith(2, 0);
  });

  it('clears the queue', async () => {
    const w = mountQueue();

    await w.find('[data-testid="compact-clear-queue"]').trigger('click');

    expect(h.player.clearQueue).toHaveBeenCalledTimes(1);
  });

  it('shows the current track with metadata fallbacks', async () => {
    h.player.currentTrack = audioA;
    const w = mountQueue();
    expect(w.text()).toContain('Title a.mp3');
    expect(w.text()).toContain('Artist');
  });

  it('falls back to the file name when the current track has no metadata', () => {
    h.player.currentTrack = { ...audioA, metadata: undefined };
    const w = mountQueue();

    expect(w.text()).toContain('a.mp3');
  });

  it('auto-scrolls near the top and bottom edges while dragging', () => {
    const w = mountQueue();
    const scroller = w.find('.compact-scroll').element as HTMLElement;
    scroller.getBoundingClientRect = () =>
      ({ top: 100, bottom: 300, left: 0, right: 0 }) as DOMRect;
    scroller.scrollTop = 50;

    const drag = (clientY: number) => {
      const event = new Event('dragover', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clientY', { value: clientY });
      scroller.dispatchEvent(event);
    };

    drag(110);
    expect(scroller.scrollTop).toBe(38);

    drag(290);
    expect(scroller.scrollTop).toBe(50);

    drag(200);
    expect(scroller.scrollTop).toBe(50);
  });
});

describe('CompactQueue defensive rows', () => {
  it('renders and ignores a virtual row without a queue entry', async () => {
    h.virtualExtra = true;
    const w = mountQueue();
    const extra = w.find('[data-testid="compact-queue-item-2"]');

    expect(extra.exists()).toBe(true);
    expect(extra.text()).toBe('');

    await extra.find('[aria-label="Play now"]').trigger('click');
    expect(h.player.setTrack).not.toHaveBeenCalled();
  });

  it('ignores a drop onto a row without an entry', async () => {
    h.virtualExtra = true;
    const w = mountQueue();

    await w.find('[data-testid="compact-queue-item-0"]').trigger('dragstart');
    await w.find('[data-testid="compact-queue-item-2"]').trigger('drop');

    expect(h.player.reorderQueue).not.toHaveBeenCalled();
  });

  it('plays from the title button as well as the cover button', async () => {
    const w = mountQueue();
    const row = w.find('[data-testid="compact-queue-item-0"]');
    const buttons = row.findAll('button');

    await buttons[2].trigger('click');

    expect(h.player.setTrack).toHaveBeenCalledWith(audioA);
    expect(h.player.removeFromQueue).toHaveBeenCalledWith(0);
  });
});
