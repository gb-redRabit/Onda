import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  open: vi.fn(),
  emptyMenu: vi.fn(),
  itemMenu: vi.fn()
}));

vi.mock('../useContextMenu', () => ({ useContextMenu: () => ({ open: h.open }) }));
vi.mock('@renderer/utils/explorerMenuDefs', () => ({
  createExplorerMenuDefs: () => ({ emptyMenu: h.emptyMenu, itemMenu: h.itemMenu })
}));

import { useExplorerContextMenu } from '../useExplorerContextMenu';

function ctx(selected: string[] = []) {
  const selectedFiles = new Set(selected);
  return {
    explorer: {
      clearSelection: vi.fn(() => selectedFiles.clear()),
      selectedFiles
    }
  } as never;
}

const item = { path: 'D:/a.mp3', name: 'a.mp3' } as never;
const event = new MouseEvent('contextmenu');

beforeEach(() => {
  h.open.mockClear();
  h.emptyMenu.mockReset().mockReturnValue({ defs: ['empty'], menuCtx: { id: 'empty' } });
  h.itemMenu.mockReset().mockReturnValue({ defs: ['item'], menuCtx: { id: 'item' } });
});

describe('useExplorerContextMenu', () => {
  it('clears the selection for an empty background', () => {
    const context = ctx();
    const { handleEmptyContextMenu } = useExplorerContextMenu(context);

    handleEmptyContextMenu(event);

    expect(
      (context as never as { explorer: { clearSelection: ReturnType<typeof vi.fn> } }).explorer
        .clearSelection
    ).toHaveBeenCalledTimes(1);
    expect(h.emptyMenu).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledWith(event, ['empty'], { id: 'empty' });
  });

  it('keeps an existing multi-selection', () => {
    const context = ctx(['D:/a.mp3', 'D:/b.mp3']);
    const { handleContextMenu } = useExplorerContextMenu(context);

    handleContextMenu(event, item);

    const explorer = (
      context as never as {
        explorer: { clearSelection: ReturnType<typeof vi.fn>; selectedFiles: Set<string> };
      }
    ).explorer;
    expect(explorer.clearSelection).not.toHaveBeenCalled();
    expect(explorer.selectedFiles.size).toBe(2);
    expect(h.itemMenu).toHaveBeenCalledWith(item);
    expect(h.open).toHaveBeenCalledWith(event, ['item'], { id: 'item' });
  });

  it('selects the clicked item when it is not selected', () => {
    const context = ctx(['D:/other.mp3']);
    const { handleContextMenu } = useExplorerContextMenu(context);

    handleContextMenu(event, item);

    const explorer = (
      context as never as {
        explorer: { clearSelection: ReturnType<typeof vi.fn>; selectedFiles: Set<string> };
      }
    ).explorer;
    expect(explorer.clearSelection).toHaveBeenCalledTimes(1);
    expect([...explorer.selectedFiles]).toEqual(['D:/a.mp3']);
  });
});
