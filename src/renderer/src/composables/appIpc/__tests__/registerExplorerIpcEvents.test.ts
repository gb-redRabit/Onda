import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  store: null as any,
  claimTabDrag: vi.fn(),
  listen: vi.fn(),
  dispose: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => h.store }));
vi.mock('@renderer/utils/tabDrag', () => ({ claimTabDrag: h.claimTabDrag }));
vi.mock('../listeners', () => ({
  createListenerScope: () => ({ listen: h.listen, dispose: h.dispose })
}));

import { registerExplorerIpcEvents } from '../registerExplorerIpcEvents';

const api = window as unknown as { api?: { invoke: typeof h.invoke } };

function route(name: string) {
  return { name } as never;
}

function handler(channel: string) {
  const call = h.listen.mock.calls.find(([name]) => name === channel);
  expect(call).toBeDefined();
  return call![1] as (payload: unknown) => void;
}

beforeEach(() => {
  h.store = {
    addTab: vi.fn(),
    loadFiles: vi.fn(),
    currentPath: 'D:/current',
    tabs: [{ path: 'D:/a' }, { path: 'D:/b' }],
    closeTab: vi.fn(),
    navigateTo: vi.fn()
  };
  h.claimTabDrag.mockClear();
  h.listen.mockClear();
  h.dispose.mockClear();
  h.invoke.mockReset().mockResolvedValue(undefined);
  api.api = { invoke: h.invoke };
});

describe('registerExplorerIpcEvents', () => {
  it('registers the explorer channels and returns dispose', () => {
    const dispose = registerExplorerIpcEvents(route('home'));

    expect(h.listen.mock.calls.map(([name]) => name)).toEqual([
      'explorer:add-tab',
      'explorer:refresh',
      'explorer:remove-tab'
    ]);
    expect(dispose).toBe(h.dispose);
  });

  it('adds tabs only for string paths', () => {
    registerExplorerIpcEvents(route('home'));
    const add = handler('explorer:add-tab');

    add('D:/new');
    add(42);
    add(null);

    expect(h.store.addTab).toHaveBeenCalledTimes(1);
    expect(h.store.addTab).toHaveBeenCalledWith('D:/new');
  });

  it('reloads the current path on refresh', () => {
    registerExplorerIpcEvents(route('home'));

    handler('explorer:refresh')(undefined);

    expect(h.store.loadFiles).toHaveBeenCalledWith('D:/current');
  });

  it('ignores invalid or unknown tab removals', () => {
    registerExplorerIpcEvents(route('home'));
    const remove = handler('explorer:remove-tab');

    remove(7);
    remove('D:/missing');

    expect(h.claimTabDrag).toHaveBeenCalledTimes(1);
    expect(h.store.closeTab).not.toHaveBeenCalled();
  });

  it('closes the window when the last tab of an explorer window closes', () => {
    h.store.tabs = [{ path: 'D:/a' }];
    registerExplorerIpcEvents(route('explorer-window'));

    handler('explorer:remove-tab')('D:/a');

    expect(h.invoke).toHaveBeenCalledWith('window:close');
    expect(h.store.closeTab).not.toHaveBeenCalled();
  });

  it('navigates home when the last tab closes in the main window', () => {
    h.store.tabs = [{ path: 'D:/a' }];
    registerExplorerIpcEvents(route('home'));

    handler('explorer:remove-tab')('D:/a');

    expect(h.store.navigateTo).toHaveBeenCalledWith('');
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('closes a tab when others remain', () => {
    registerExplorerIpcEvents(route('home'));

    handler('explorer:remove-tab')('D:/b');

    expect(h.claimTabDrag).toHaveBeenCalledWith('D:/b');
    expect(h.store.closeTab).toHaveBeenCalledWith(1);
  });
});
