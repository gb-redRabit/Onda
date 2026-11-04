import { describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import type { FileItem } from '@renderer/types/explorer';
import type { ContextMenuAction } from '@renderer/composables/useContextMenu';
import { createExplorerMenuDefs, type ExplorerActionCtx } from '@renderer/utils/explorerMenuDefs';

function makeCtx() {
  return {
    explorer: { selectedCount: 0, selectedFiles: new Set<string>(), currentPath: 'D:/' },
    fileClipboard: { items: [] },
    library: {},
    t: (key: string) => key,
    filteredFiles: computed(() => [] as FileItem[]),
    openImageViewer: vi.fn(),
    openProperties: vi.fn(),
    playItem: vi.fn(),
    addToQueueItem: vi.fn(),
    navigateTo: vi.fn(),
    copySelectedPaths: vi.fn(),
    cutSelectedPaths: vi.fn(),
    pasteClipboard: vi.fn(),
    createNewFolder: vi.fn(),
    renameItem: vi.fn(),
    deleteItem: vi.fn(),
    openToolWithFiles: vi.fn()
  } as unknown as ExplorerActionCtx;
}

function file(name: string, extension: string): FileItem {
  return {
    name,
    path: `D:/${name}`,
    isDirectory: false,
    size: 1,
    modifiedAt: 0,
    createdAt: 0,
    extension
  };
}

function isVisible<T>(defs: ContextMenuAction<T>[], label: string, ctx: T): boolean {
  const def = defs.find((d) => d.label === label);
  return !!def && (!def.when || def.when(ctx));
}

const ctx = makeCtx();
const { itemMenu } = createExplorerMenuDefs(ctx);

describe('explorer item menu', () => {
  it('does not offer play or queue for images', () => {
    const { defs, menuCtx } = itemMenu(file('cover.png', '.png'));
    expect(isVisible(defs, 'explorer.openImage', menuCtx)).toBe(true);
    expect(isVisible(defs, 'common.play', menuCtx)).toBe(false);
    expect(isVisible(defs, 'common.addToQueue', menuCtx)).toBe(false);
  });

  it('offers play and queue for audio', () => {
    const { defs, menuCtx } = itemMenu(file('song.mp3', '.mp3'));
    expect(isVisible(defs, 'common.play', menuCtx)).toBe(true);
    expect(isVisible(defs, 'common.addToQueue', menuCtx)).toBe(true);
    expect(isVisible(defs, 'explorer.openImage', menuCtx)).toBe(false);
  });

  it('does not label copy path with Ctrl+C (that shortcut copies files)', () => {
    const { defs } = itemMenu(file('song.mp3', '.mp3'));
    const copyPath = defs.find((d) => d.label === 'explorer.copyPath');
    expect(copyPath?.shortcut).toBeUndefined();
  });

  it('offers a tools submenu with tools matching the clicked file', () => {
    const { defs } = itemMenu(file('cover.png', '.png'));
    const tools = defs.find((d) => d.label === 'explorer.tools');
    expect(tools?.children?.map((child) => child.label)).toEqual([
      'tools.imageStudioTitle',
      'tools.batchImagesTitle'
    ]);
  });

  it('hides the tools submenu for unsupported files', () => {
    const { defs } = itemMenu(file('notes.txt', '.txt'));
    expect(defs.some((d) => d.label === 'explorer.tools')).toBe(false);
  });

  it('opens the chosen tool with the clicked file', () => {
    const { defs, menuCtx } = itemMenu(file('cover.png', '.png'));
    const tools = defs.find((d) => d.label === 'explorer.tools');
    tools?.children?.[0]?.action?.(menuCtx);
    expect(ctx.openToolWithFiles).toHaveBeenCalledWith('image-studio', ['D:/cover.png']);
  });
});
