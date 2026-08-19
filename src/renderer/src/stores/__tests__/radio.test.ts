import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useRadioStore } from '../radio';
import { usePlayerStore } from '../player';

let mockRadioLoad: ReturnType<typeof vi.fn>;
let mockRadioSave: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setActivePinia(createPinia());
  mockRadioLoad = vi.fn().mockResolvedValue({ stations: [] });
  mockRadioSave = vi.fn().mockResolvedValue(true);
  (window as { api?: unknown }).api = {
    radioLoad: mockRadioLoad,
    radioSave: mockRadioSave,
    on: vi.fn()
  };
});

describe('radio store', () => {
  it('loads persisted stations once', async () => {
    mockRadioLoad.mockResolvedValue({
      stations: [{ id: 'r1', name: 'Test FM', url: 'http://radio.example:8000/stream', addedAt: 1 }]
    });
    const store = useRadioStore();
    await store.ensureLoaded();
    expect(store.stations).toHaveLength(1);
    await store.ensureLoaded();
    expect(mockRadioLoad).toHaveBeenCalledTimes(1);
  });

  it('adds stations deduping by url', async () => {
    const store = useRadioStore();
    const added = await store.addStations([
      { name: 'A', url: 'http://a.example/stream' },
      { name: 'B', url: 'http://b.example/stream' },
      { name: 'Dup', url: 'http://a.example/stream' }
    ]);
    expect(added).toBe(2);
    expect(store.stations).toHaveLength(2);
    expect(mockRadioSave).toHaveBeenCalledTimes(1);
  });

  it('persists plain (cloneable) data over IPC — not Vue reactive proxies', async () => {
    const store = useRadioStore();
    await store.addStations([{ name: 'A', url: 'http://a.example/stream' }]);
    const sent = mockRadioSave.mock.calls[0][0] as unknown;
    expect(Array.isArray(sent)).toBe(true);
    // structuredClone throws DataCloneError ("An object could not be cloned")
    // on Vue reactive proxies — exactly what Electron IPC does on send.
    expect(() => structuredClone(sent)).not.toThrow();
    expect(Object.getPrototypeOf((sent as object[])[0])).toBe(Object.prototype);
  });

  it('renames, removes and moves stations to top, persisting each change', async () => {
    const store = useRadioStore();
    await store.addStations([
      { name: 'A', url: 'http://a.example/stream' },
      { name: 'B', url: 'http://b.example/stream' }
    ]);
    const [a, b] = store.stations;
    await store.renameStation(a!.id, 'Renamed');
    expect(store.stations[0]!.name).toBe('Renamed');
    await store.moveToTop(b!.id);
    expect(store.stations[0]!.url).toBe('http://b.example/stream');
    await store.removeStation(a!.id);
    expect(store.stations).toHaveLength(1);
    expect(mockRadioSave).toHaveBeenCalledTimes(4);
  });

  it('builds a live stream track from a station', () => {
    const store = useRadioStore();
    const track = store.buildRadioTrack({
      id: 'r1',
      name: 'Live',
      url: 'https://radio.example/live',
      addedAt: 1
    });
    expect(track.type).toBe('stream');
    expect(track.path).toBe('https://radio.example/live');
    expect(track.id).toBe('radio:r1');
    expect(track.duration).toBeUndefined();
  });

  it('tracks the playing station id', () => {
    const store = useRadioStore();
    expect(store.playingStationId).toBeNull();
    const player = usePlayerStore();
    player.setTrack(
      store.buildRadioTrack({ id: 'r9', name: 'X', url: 'http://x.example/stream', addedAt: 1 })
    );
    expect(store.playingStationId).toBe('r9');
  });
});