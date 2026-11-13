import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const h = vi.hoisted(() => ({
  explorer: null as any,
  library: null as any,
  online: null as any
}));

vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => h.explorer }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => h.library }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => h.online }));

import { ExplorerModule } from '../ExplorerModule';
import { LibraryModule } from '../LibraryModule';
import { OnlineModule } from '../OnlineModule';

beforeEach(() => {
  h.explorer = reactive({ currentPath: '', navigateTo: vi.fn() });
  h.library = reactive({
    isLoaded: false,
    tracks: [],
    folders: [],
    isLoading: false,
    isScanning: false,
    loadFromDisk: vi.fn(async () => undefined),
    scanFolders: vi.fn()
  });
  h.online = reactive({
    isSearching: true,
    searchResults: [{ id: '1' }],
    searchQuery: 'q',
    nextToken: 'n',
    prevToken: 'p'
  });
});

describe('ExplorerModule', () => {
  it('navigates home when no path is set', () => {
    const module = new ExplorerModule();

    module.activate();

    expect(module.isActive()).toBe(true);
    expect(module.id).toBe('explorer');
    expect(module.name).toBe('Explorer');
    expect(h.explorer.navigateTo).toHaveBeenCalledWith('');
  });

  it('keeps an existing path', () => {
    h.explorer.currentPath = 'D:/Music';

    new ExplorerModule().activate();

    expect(h.explorer.navigateTo).not.toHaveBeenCalled();
  });

  it('deactivates', async () => {
    const module = new ExplorerModule();
    module.activate();

    await module.deactivate();

    expect(module.isActive()).toBe(false);
  });
});

describe('LibraryModule', () => {
  it('loads from disk when nothing is loaded yet', async () => {
    const module = new LibraryModule();

    await module.activate();

    expect(module.isActive()).toBe(true);
    expect(h.library.loadFromDisk).toHaveBeenCalledTimes(1);
    expect(h.library.scanFolders).not.toHaveBeenCalled();
  });

  it('skips loading when the library already has tracks', async () => {
    h.library.tracks = [{}];
    h.library.isLoaded = true;
    await new LibraryModule().activate();

    expect(h.library.loadFromDisk).not.toHaveBeenCalled();
  });

  it('skips loading while a load is in flight', async () => {
    h.library.isLoading = true;
    await new LibraryModule().activate();

    expect(h.library.loadFromDisk).not.toHaveBeenCalled();
  });

  it('scans folders when the index is empty', async () => {
    h.library.folders = ['D:/Music'];
    await new LibraryModule().activate();

    expect(h.library.scanFolders).toHaveBeenCalledTimes(1);
  });

  it('does not rescan while scanning', async () => {
    h.library.folders = ['D:/Music'];
    h.library.isScanning = true;
    await new LibraryModule().activate();

    expect(h.library.scanFolders).not.toHaveBeenCalled();
  });

  it('deactivates without touching an idle scan', async () => {
    const module = new LibraryModule();
    await module.activate();

    await module.deactivate();

    expect(module.isActive()).toBe(false);
    expect(h.library.isScanning).toBe(false);
  });

  it('stops an active scan on deactivate', async () => {
    h.library.isScanning = true;
    const module = new LibraryModule();
    await module.activate();

    await module.deactivate();

    expect(module.isActive()).toBe(false);
    expect(h.library.isScanning).toBe(false);
  });
});

describe('OnlineModule', () => {
  it('initialises without side effects', () => {
    expect(() => new OnlineModule().init()).not.toThrow();
  });

  it('stops searching on deactivate', async () => {
    const module = new OnlineModule();
    module.activate();
    expect(module.isActive()).toBe(true);

    await module.deactivate();

    expect(module.isActive()).toBe(false);
    expect(h.online.isSearching).toBe(false);
    expect(h.online.searchQuery).toBe('q');
  });

  it('clears search state on destroy', async () => {
    const module = new OnlineModule();

    await module.destroy();

    expect(module.isActive()).toBe(false);
    expect(h.online).toMatchObject({
      isSearching: false,
      searchResults: [],
      searchQuery: '',
      nextToken: null,
      prevToken: null
    });
  });
});
