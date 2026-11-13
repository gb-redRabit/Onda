import { beforeEach, describe, expect, it, vi } from 'vitest';

type TabDragApi = typeof import('../tabDrag');

let tabDrag: TabDragApi;

beforeEach(async () => {
  vi.resetModules();
  tabDrag = await import('../tabDrag');
});

describe('tab drag', () => {
  it('starts without an active drag', () => {
    expect(tabDrag.getActiveTabDrag()).toBeNull();
  });

  it('tracks the dragged path as unclaimed', () => {
    tabDrag.beginTabDrag('D:/a.txt');

    expect(tabDrag.getActiveTabDrag()).toEqual({ path: 'D:/a.txt', claimed: false });
  });

  it('claims only the matching path', () => {
    tabDrag.beginTabDrag('D:/a.txt');

    tabDrag.claimTabDrag('D:/other.txt');
    expect(tabDrag.getActiveTabDrag()).toEqual({ path: 'D:/a.txt', claimed: false });

    tabDrag.claimTabDrag('D:/a.txt');
    expect(tabDrag.getActiveTabDrag()).toEqual({ path: 'D:/a.txt', claimed: true });
  });

  it('ignores claims without an active drag', () => {
    tabDrag.claimTabDrag('D:/a.txt');

    expect(tabDrag.getActiveTabDrag()).toBeNull();
  });

  it('resets state when a new drag starts', () => {
    tabDrag.beginTabDrag('D:/a.txt');
    tabDrag.claimTabDrag('D:/a.txt');
    tabDrag.beginTabDrag('D:/b.txt');

    expect(tabDrag.getActiveTabDrag()).toEqual({ path: 'D:/b.txt', claimed: false });
  });

  it('clears the drag state', () => {
    tabDrag.beginTabDrag('D:/a.txt');
    tabDrag.claimTabDrag('D:/a.txt');

    tabDrag.clearTabDrag();

    expect(tabDrag.getActiveTabDrag()).toBeNull();
  });
});
