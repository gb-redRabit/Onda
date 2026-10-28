import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

// Compact jest audio-only: wideo z kolejki Core nie może być widoczne ani
// klikalne, a remove/reorder muszą trafiać w oryginalne indeksy kolejki.
const h = vi.hoisted(() => ({ player: {} as Record<string, unknown> }));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));

vi.mock('@renderer/composables/useVirtualList', async () => {
  const { ref } = await import('vue');
  return {
    useVirtualList: (opts: { count: () => number }) =>
      ref({
        getTotalSize: () => opts.count() * 40,
        getVirtualItems: () =>
          Array.from({ length: opts.count() }, (_, index) => ({
            index,
            key: index,
            start: index * 40,
            size: 40
          })),
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
