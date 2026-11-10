import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { defineComponent } from 'vue';

// Testy montujące panelu kolejki: nagłówek z licznikiem, pusta kolejka, wybór
// utworu, usuwanie, czyszczenie z potwierdzeniem i reorder drag & drop.
const h = vi.hoisted(() => ({
  showConfirm: vi.fn(async () => true),
  promptVisible: { value: false },
  promptIsConfirm: { value: false },
  promptMessage: { value: '' },
  promptValue: { value: '' },
  promptConfirm: vi.fn(),
  promptCancel: vi.fn()
}));

// Wirtualizator renderujemy bez pomiarów DOM — testy sprawdzają zachowanie listy,
// nie geometrię. Wszystkie wiersze są "widoczne".
vi.mock('@renderer/composables/useVirtualList', async () => {
  const { ref } = await import('vue');
  return {
    useVirtualList: (opts: {
      count: () => number;
      scrollEl?: () => unknown;
      estimateSize?: () => number;
    }) => {
      opts.count();
      opts.scrollEl?.();
      opts.estimateSize?.();
      return ref({
        getTotalSize: () => opts.count() * 52,
        getVirtualItems: () =>
          Array.from({ length: opts.count() }, (_, index) => ({
            index,
            key: index,
            start: index * 52,
            size: 52
          })),
        measureElement: () => {}
      });
    }
  };
});

vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => ({
    showConfirm: h.showConfirm,
    promptVisible: h.promptVisible,
    promptIsConfirm: h.promptIsConfirm,
    promptMessage: h.promptMessage,
    promptValue: h.promptValue,
    promptConfirm: h.promptConfirm,
    promptCancel: h.promptCancel
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

function mountPanel(extraStubs: Record<string, unknown> = {}) {
  return mount(QueuePanel, {
    global: {
      plugins: [i18n],
      directives: { activate: {} },
      stubs: {
        MediaCover: true,
        ExplorerPromptDialog: true,
        ...extraStubs
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
  h.promptVisible.value = false;
  h.promptIsConfirm.value = false;
  h.promptMessage.value = '';
  h.promptValue.value = '';
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

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

describe('QueuePanel — extended interaction', () => {
  const api = { getDuration: vi.fn(), getFilePath: vi.fn() };

  beforeEach(() => {
    api.getDuration.mockReset();
    api.getDuration.mockResolvedValue(77);
    api.getFilePath.mockReset();
    (window as unknown as { api?: unknown }).api = api;
  });

  it('closes the panel from the header button', async () => {
    const w = mountPanel();
    await w.find('[aria-label="Close"]').trigger('click');
    expect(h2.player.toggleQueue).toHaveBeenCalled();
  });

  it('highlights a row on dragover and clears it on dragleave', async () => {
    setQueue([makeTrack('a')]);
    const w = mountPanel();
    const dt = dataTransfer();

    await w.find('[data-testid="queue-row-0"]').trigger('dragover', { dataTransfer: dt });
    expect(dt.dropEffect).toBe('move');
    expect(w.get('[data-testid="queue-row-0"]').classes()).toContain('border-primary');

    await w.find('[data-testid="queue-row-0"]').trigger('dragleave');
    expect(w.get('[data-testid="queue-row-0"]').classes()).not.toContain('border-primary');
  });

  it('inserts an external file dropped on a row and fills its duration', async () => {
    setQueue([makeTrack('a')]);
    const w = mountPanel();
    const dt = dataTransfer();
    dt.setData('text/plain', 'file:C:/music/new.mp3');

    await w.find('[data-testid="queue-row-0"]').trigger('drop', { dataTransfer: dt });
    await flush();

    expect(h2.player.insertInQueue).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ path: 'C:/music/new.mp3' })
    );
    expect(api.getDuration).toHaveBeenCalledWith('C:/music/new.mp3');
    const inserted = (h2.player.insertInQueue as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(inserted.duration).toBe(77);
  });

  it('falls back to zero when the duration lookup fails', async () => {
    setQueue([makeTrack('a')]);
    api.getDuration.mockRejectedValueOnce(new Error('no metadata'));
    const w = mountPanel();
    const dt = dataTransfer();
    dt.setData('text/plain', 'file:C:/music/broken.mp3');

    await w.find('[data-testid="queue-row-0"]').trigger('drop', { dataTransfer: dt });
    await flush();

    const inserted = (h2.player.insertInQueue as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(inserted.duration).toBe(0);
  });

  it('adds playable files dropped on the panel', async () => {
    setQueue([]);
    api.getFilePath.mockImplementation((file: File) => `C:/music/${file.name}`);
    const w = mountPanel();
    const files = [
      new File(['a'], 'one.mp3', { type: 'audio/mpeg' }),
      new File(['b'], 'note.txt', { type: 'text/plain' })
    ];

    await w.get('[data-testid="queue-panel"]').trigger('drop', {
      dataTransfer: { files }
    });
    await flush();

    expect(h2.player.addToQueue).toHaveBeenCalledTimes(1);
    expect(h2.player.addToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'C:/music/one.mp3' })
    );
    expect(api.getDuration).toHaveBeenCalledWith('C:/music/one.mp3');
  });

  it('ignores files without a resolvable path and drops without files', async () => {
    setQueue([]);
    api.getFilePath.mockReturnValue('');
    const w = mountPanel();

    await w.get('[data-testid="queue-panel"]').trigger('drop', { dataTransfer: {} });
    await w.get('[data-testid="queue-panel"]').trigger('drop', {
      dataTransfer: { files: [new File(['a'], 'one.mp3', { type: 'audio/mpeg' })] }
    });

    expect(h2.player.addToQueue).not.toHaveBeenCalled();
  });

  it('shows history and replays an entry', async () => {
    setQueue([], null, [makeTrack('old')]);
    const w = mountPanel();
    expect(w.text()).toContain('History');

    const historyRow = w
      .findAll('div')
      .find((node) => node.text().includes('Title old') && node.classes().includes('opacity-60'))!;
    await historyRow.trigger('click');

    expect(h2.player.playFromHistory).toHaveBeenCalledWith(0);
  });

  it('wires prompt values and actions', async () => {
    const PromptStub = defineComponent({
      name: 'ExplorerPromptDialog',
      props: ['visible', 'isConfirm', 'message', 'value'],
      emits: ['update:value', 'confirm', 'cancel'],
      template: `<div data-testid="prompt">
        <button data-testid="prompt-type" @click="$emit('update:value', 'typed')" />
        <button data-testid="prompt-confirm" @click="$emit('confirm')" />
        <button data-testid="prompt-cancel" @click="$emit('cancel')" />
      </div>`
    });
    const w = mountPanel({ ExplorerPromptDialog: PromptStub });

    await w.get('[data-testid="prompt-type"]').trigger('click');
    await w.get('[data-testid="prompt-confirm"]').trigger('click');
    await w.get('[data-testid="prompt-cancel"]').trigger('click');

    expect(h.promptValue.value).toBe('typed');
    expect(h.promptConfirm).toHaveBeenCalled();
    expect(h.promptCancel).toHaveBeenCalled();
  });
});
