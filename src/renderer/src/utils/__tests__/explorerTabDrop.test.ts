import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addTab: vi.fn(),
  claim: vi.fn(),
  getWindowId: vi.fn(async () => 1),
  invoke: vi.fn()
}));

vi.mock('@renderer/stores/explorer', () => ({
  useExplorerStore: () => ({ addTab: mocks.addTab })
}));
vi.mock('@renderer/utils/tabDrag', () => ({ claimTabDrag: mocks.claim }));
vi.mock('@renderer/utils/windowId', () => ({ getWindowId: mocks.getWindowId }));

import { encodeTabPayload, handleTabDrop, parseTabPayload } from '../explorerTabDrop';

beforeEach(() => {
  mocks.addTab.mockClear();
  mocks.claim.mockClear();
  mocks.getWindowId.mockReset().mockResolvedValue(1);
  mocks.invoke.mockReset().mockResolvedValue(undefined);
  (window as unknown as { api: unknown }).api = { invoke: mocks.invoke };
});

describe('payload encoding', () => {
  it('round-trips a tab payload', () => {
    const raw = encodeTabPayload(7, 'D:/Music/Album');

    expect(raw.startsWith('ONDA_TAB::')).toBe(true);
    expect(parseTabPayload(raw)).toEqual({ wid: 7, path: 'D:/Music/Album' });
  });

  it('rejects foreign, malformed and incomplete payloads', () => {
    expect(parseTabPayload('ONDA_OTHER::1')).toBeNull();
    expect(parseTabPayload('ONDA_TAB::not-json')).toBeNull();
    expect(
      parseTabPayload(`ONDA_TAB::${encodeURIComponent(JSON.stringify({ wid: '1' }))}`)
    ).toBeNull();
    expect(
      parseTabPayload(`ONDA_TAB::${encodeURIComponent(JSON.stringify({ wid: 1 }))}`)
    ).toBeNull();
    expect(
      parseTabPayload(`ONDA_TAB::${encodeURIComponent(JSON.stringify({ path: 'x' }))}`)
    ).toBeNull();
  });
});

describe('handleTabDrop', () => {
  it('ignores invalid payloads', async () => {
    await expect(handleTabDrop('nonsense')).resolves.toBe(false);

    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.addTab).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('claims a tab dragged within the same window', async () => {
    mocks.getWindowId.mockResolvedValue(3);

    await expect(handleTabDrop(encodeTabPayload(3, 'C:/A'))).resolves.toBe(true);

    expect(mocks.claim).toHaveBeenCalledWith('C:/A');
    expect(mocks.addTab).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('adds the tab and notifies the source window for cross-window drops', async () => {
    mocks.getWindowId.mockResolvedValue(2);

    await expect(handleTabDrop(encodeTabPayload(5, 'C:/B'))).resolves.toBe(true);

    expect(mocks.addTab).toHaveBeenCalledWith('C:/B');
    expect(mocks.invoke).toHaveBeenCalledWith('explorer:tabMoved', 5, 'C:/B');
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
