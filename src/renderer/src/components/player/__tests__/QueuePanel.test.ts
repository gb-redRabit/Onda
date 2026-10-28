import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';

// Testy montujące panelu kolejki: nagłówek z licznikiem, pusta kolejka, wybór
// utworu, usuwanie, czyszczenie z potwierdzeniem i reorder drag & drop.
const h = vi.hoisted(() => ({
  showConfirm: vi.fn(async () => true)
}));

// Wirtualizator renderujemy bez pomiarów DOM — testy sprawdzają zachowanie listy,
// nie geometrię. Wszystkie wiersze są "widoczne".
vi.mock('@renderer/composables/useVirtualList', async () => {
  const { ref } = await import('vue');
  return {
    useVirtualList: (opts: { count: () => number }) =>
      ref({
        getTotalSize: () => opts.count() * 52,
        getVirtualItems: () =>
          Array.from({ length: opts.count() }, (_, index) => ({
            index,
            key: index,
            start: index * 52,
            size: 52
          })),
        measureElement: () => {}
      })
  };
});

vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => ({
    showConfirm: h.showConfirm,
    promptVisible: { value: false },
    promptIsConfirm: { value: false },
    promptMessage: { value: '' },
    promptValue: { value: '' },
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  })
}));

function makeTrack(id: string, type: 'audio' | 'video' = 'audio') {
  return {
    id,
    path: `C:/music/${id}.mp3`,
    name: id,
    type,
    duration: 120,
    metadata: { title: `Title ${id}`, artist: 'Artist' }
  };
}

const h2 = vi.hoisted(() => ({
  player: {} as Record<string, unknown>
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h2.player }));

import QueuePanel from '../QueuePanel.vue';
import en from '../../../locales/en';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

function setQueue(tracks: unknown[], current: unknown = null, history: unknown[] = []) {
  Object.assign(h2.player, {
    displayQueue: tracks,
    queueLength: tracks.length,
    currentTrack: current,
    history,
    loadCover: vi.fn(),
    setTrack: vi.fn(),
    removeFromQueue: vi.fn(),
    reorderQueue: vi.fn(),
    insertInQueue: vi.fn(),
    addToQueue: vi.fn(),
    clearQueue: vi.fn(),
    toggleQueue: vi.fn(),
    playFromHistory: vi.fn()
  });
}

function mountPanel() {
  return mount(QueuePanel, {
    global: {
      plugins: [i18n],
      directives: { activate: {} },
      stubs: {
        MediaCover: true,
        ExplorerPromptDialog: true
      }
    }
  });
}

function dataTransfer() {
  const store: Record<string, string> = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    files: [],
    setData: (key: string, value: string) => {
      store[key] = value;
    },
    getData: (key: string) => store[key] ?? ''
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.showConfirm.mockResolvedValue(true);
  setQueue([]);
});

describe('QueuePanel — render', () => {
  it('shows the empty state and no clear button', () => {
    const w = mountPanel();
    expect(w.find('[data-testid="queue-panel"]').exists()).toBe(true);
    expect(w.find('[data-testid="queue-empty"]').exists()).toBe(true);
    expect(w.find('[data-testid="queue-clear"]').exists()).toBe(false);
  });

  it('lists queue rows with the total count', () => {
    setQueue([makeTrack('a'), makeTrack('b'), makeTrack('c')]);
    const w = mountPanel();
    expect(w.text()).toContain('(3)');
    expect(w.find('[data-testid="queue-row-0"]').text()).toContain('Title a');
    expect(w.find('[data-testid="queue-row-2"]').text()).toContain('Title c');
    expect(w.find('[data-testid="queue-empty"]').exists()).toBe(false);
  });

  it('shows the current track section when something is playing', () => {
    setQueue([], makeTrack('now'));
    const w = mountPanel();
    expect(w.text()).toContain('Now playing');
  });
});

describe('QueuePanel — interaction', () => {
  it('plays a row through the player store', async () => {
    const tracks = [makeTrack('a'), makeTrack('b')];
    setQueue(tracks);
    const w = mountPanel();
    await w.find('[data-testid="queue-row-1"]').trigger('click');
    expect(h2.player.setTrack).toHaveBeenCalledWith(tracks[1]);
  });

  it('removes a row without playing it', async () => {
    setQueue([makeTrack('a'), makeTrack('b')]);
    const w = mountPanel();
    await w.find('[data-testid="queue-row-0"] [aria-label="Remove from queue"]').trigger('click');
    expect(h2.player.removeFromQueue).toHaveBeenCalledWith(0);
    expect(h2.player.setTrack).not.toHaveBeenCalled();
  });

  it('clears the queue only after confirmation', async () => {
    setQueue([makeTrack('a')]);
    const w = mountPanel();

    h.showConfirm.mockResolvedValueOnce(false);
    await w.find('[data-testid="queue-clear"]').trigger('click');
    expect(h2.player.clearQueue).not.toHaveBeenCalled();

    h.showConfirm.mockResolvedValueOnce(true);
    await w.find('[data-testid="queue-clear"]').trigger('click');
    expect(h2.player.clearQueue).toHaveBeenCalledTimes(1);
  });

  it('reorders rows through drag and drop', async () => {
    setQueue([makeTrack('a'), makeTrack('b'), makeTrack('c')]);
    const w = mountPanel();
    const dt = dataTransfer();

    await w.find('[data-testid="queue-row-0"]').trigger('dragstart', { dataTransfer: dt });
    await w.find('[data-testid="queue-row-2"]').trigger('drop', { dataTransfer: dt });

    expect(h2.player.reorderQueue).toHaveBeenCalledWith(0, 2);
  });

  it('ignores a drop on the same row', async () => {
    setQueue([makeTrack('a'), makeTrack('b')]);
    const w = mountPanel();
    const dt = dataTransfer();

    await w.find('[data-testid="queue-row-1"]').trigger('dragstart', { dataTransfer: dt });
    await w.find('[data-testid="queue-row-1"]').trigger('drop', { dataTransfer: dt });

    expect(h2.player.reorderQueue).not.toHaveBeenCalled();
  });
});
