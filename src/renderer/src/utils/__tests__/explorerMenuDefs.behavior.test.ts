import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import type { FileItem } from '@renderer/types/explorer';
import type { ContextMenuAction } from '@renderer/composables/useContextMenu';

const state = vi.hoisted(() => ({
  reveal: vi.fn(),
  openDefault: vi.fn(),
  terminal: vi.fn(),
  copyPath: vi.fn(),
  isLibraryFolder: vi.fn((path: string) => path.startsWith('D:/lib'))
}));

vi.mock('../menuActions', () => ({
  revealInFolder: state.reveal,
  openWithDefaultApp: state.openDefault,
  openInTerminal: state.terminal,
  copyPathViaMain: state.copyPath
}));
vi.mock('../libraryFolders', () => ({ isLibraryFolder: state.isLibraryFolder }));

import { createExplorerMenuDefs, type ExplorerActionCtx } from '../explorerMenuDefs';

function makeCtx() {
  return {
    explorer: {
      selectedCount: 0,
      selectedFiles: new Set<string>(),
      currentPath: 'D:/',
      clearSelection: vi.fn()
    },
    fileClipboard: { items: [] as string[] },
    library: { addFolder: vi.fn(), removeFolder: vi.fn() },
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

function file(name: string, extension: string, path = `D:/${name}`): FileItem {
  return {
    name,
    path,
    isDirectory: false,
    size: 1,
    modifiedAt: 0,
    createdAt: 0,
    extension
  };
}

function dir(name: string, path = `D:/${name}`): FileItem {
  return { ...file(name, '', path), isDirectory: true } as FileItem;
}

function visible<T>(defs: ContextMenuAction<T>[], label: string, ctx: T): boolean {
  const def = defs.find((entry) => entry.label === label);
  return !!def && (!def.when || def.when(ctx));
}

function action<T>(defs: ContextMenuAction<T>[], label: string): ContextMenuAction<T> {
  return defs.find((entry) => entry.label === label)!;
}

let ctx: any;
let menu: ReturnType<typeof createExplorerMenuDefs>;

beforeEach(() => {
  ctx = makeCtx();
  menu = createExplorerMenuDefs(ctx);
  state.reveal.mockReset();
  state.openDefault.mockReset();
  state.terminal.mockReset();
  state.copyPath.mockReset();
  state.isLibraryFolder.mockClear();
});

describe('empty menu', () => {
  it('offers clipboard actions based on selection and clipboard', () => {
    let result = menu.emptyMenu();
    let defs = result.defs;
    expect(visible(defs, 'common.copy', result.menuCtx)).toBe(false);
    expect(visible(defs, 'common.cut', result.menuCtx)).toBe(false);
    expect(visible(defs, 'common.paste', result.menuCtx)).toBe(false);

    ctx.explorer.selectedCount = 2;
    ctx.fileClipboard.items = ['a'];
    result = menu.emptyMenu();
    defs = result.defs;
    expect(visible(defs, 'common.copy', result.menuCtx)).toBe(true);
    expect(visible(defs, 'common.cut', result.menuCtx)).toBe(true);
    expect(visible(defs, 'common.paste', result.menuCtx)).toBe(true);
  });

  it('wires clipboard and folder actions', () => {
    ctx.explorer.selectedCount = 1;
    const { defs, menuCtx } = menu.emptyMenu();

    action(defs, 'common.copy').action?.(menuCtx);
    action(defs, 'common.cut').action?.(menuCtx);
    action(defs, 'common.paste').action?.(menuCtx);
    action(defs, 'explorer.newFolder').action?.(menuCtx);
    action(defs, 'explorer.openInTerminal').action?.(menuCtx);
    action(defs, 'explorer.openWithDefaultApp').action?.(menuCtx);
    action(defs, 'common.showInFolder').action?.(menuCtx);

    expect(ctx.copySelectedPaths as any).toHaveBeenCalledTimes(1);
    expect(ctx.cutSelectedPaths as any).toHaveBeenCalledTimes(1);
    expect(ctx.pasteClipboard as any).toHaveBeenCalledTimes(1);
    expect(ctx.createNewFolder as any).toHaveBeenCalledTimes(1);
    expect(state.terminal).toHaveBeenCalledWith('D:/');
    expect(state.openDefault).toHaveBeenCalledWith('D:/');
    expect(state.reveal).toHaveBeenCalledWith('D:/');
  });

  it('selects every filtered file', () => {
    ctx.filteredFiles = computed(() => [file('a.mp3', '.mp3'), file('b.mp3', '.mp3')]);
    menu = createExplorerMenuDefs(ctx);
    const { defs, menuCtx } = menu.emptyMenu();

    action(defs, 'common.selectAll').action?.(menuCtx);

    expect(ctx.explorer.clearSelection).toHaveBeenCalledTimes(1);
    expect([...ctx.explorer.selectedFiles]).toEqual(['D:/a.mp3', 'D:/b.mp3']);
  });

  it('marks clipboard separators conditional', () => {
    const { defs, menuCtx } = menu.emptyMenu();
    const conditional = defs.filter((def) => def.separator && def.when);
    const toggle = conditional.find((def) => !def.when!(menuCtx));

    expect(toggle).toBeTruthy();
    ctx.explorer.selectedCount = 1;
    expect(toggle!.when!(menuCtx)).toBe(true);
  });
});

describe('item common actions', () => {
  it('opens, copies and reveals the clicked file', () => {
    const { defs, menuCtx } = menu.itemMenu(file('song.mp3', '.mp3'));

    action(defs, 'explorer.openWithDefaultApp').action?.(menuCtx);
    action(defs, 'explorer.copyPath').action?.(menuCtx);
    action(defs, 'common.showInFolder').action?.(menuCtx);

    expect(state.openDefault).toHaveBeenCalledWith('D:/song.mp3');
    expect(state.copyPath).toHaveBeenCalledWith('D:/song.mp3');
    expect(state.reveal).toHaveBeenCalledWith('D:/song.mp3');
  });

  it('offers file actions only with an item', () => {
    const { defs } = menu.itemMenu(file('song.mp3', '.mp3'));
    const openDefault = action(defs, 'explorer.openWithDefaultApp');
    const copyPath = action(defs, 'explorer.copyPath');
    const reveal = action(defs, 'common.showInFolder');

    expect(() => {
      openDefault.action?.({} as never);
      copyPath.action?.({} as never);
      reveal.action?.({} as never);
    }).not.toThrow();
    expect(state.openDefault).not.toHaveBeenCalled();
  });
});

describe('file operations', () => {
  it('renames and deletes files', () => {
    const { defs, menuCtx } = menu.itemMenu(file('song.mp3', '.mp3'));

    action(defs, 'explorer.rename').action?.(menuCtx);
    action(defs, 'common.delete').action?.(menuCtx);

    expect(ctx.renameItem as any).toHaveBeenCalledTimes(1);
    expect(ctx.deleteItem as any).toHaveBeenCalledTimes(1);
    expect(action(defs, 'common.delete').disabledWhen?.(menuCtx)).toBe(false);
  });

  it('disables deletion inside a library folder', () => {
    const { defs, menuCtx } = menu.itemMenu(dir('Music', 'D:/lib/Music'));

    expect(action(defs, 'common.delete').disabledWhen?.(menuCtx)).toBe(true);
  });

  it('ignores rename and delete without an item', () => {
    const { defs } = menu.itemMenu(file('song.mp3', '.mp3'));
    expect(() => {
      action(defs, 'explorer.rename').action?.({ item: null } as never);
      action(defs, 'common.delete').action?.({ item: null } as never);
    }).not.toThrow();
    expect(ctx.renameItem as any).not.toHaveBeenCalled();
    expect(ctx.deleteItem as any).not.toHaveBeenCalled();
  });
});

describe('directory actions', () => {
  it('opens the folder', () => {
    const { defs, menuCtx } = menu.itemMenu(dir('Music'));
    expect(visible(defs, 'explorer.open', menuCtx)).toBe(true);

    action(defs, 'explorer.open').action?.(menuCtx);

    expect(ctx.navigateTo as any).toHaveBeenCalledWith('D:/Music');
  });

  it('opens a terminal in the folder', () => {
    const { defs, menuCtx } = menu.itemMenu(dir('Music'));
    action(defs, 'explorer.openInTerminal').action?.(menuCtx);

    expect(state.terminal).toHaveBeenCalledWith('D:/Music');
  });

  it('adds and removes library folders', () => {
    const outside = menu.itemMenu(dir('Music', 'D:/Music'));
    expect(visible(outside.defs, 'explorer.addToLibrary', outside.menuCtx)).toBe(true);
    expect(visible(outside.defs, 'explorer.removeFromLibrary', outside.menuCtx)).toBe(false);
    action(outside.defs, 'explorer.addToLibrary').action?.(outside.menuCtx);
    expect(ctx.library.addFolder as any).toHaveBeenCalledWith('D:/Music');

    const inside = menu.itemMenu(dir('Lib', 'D:/lib/Lib'));
    expect(visible(inside.defs, 'explorer.addToLibrary', inside.menuCtx)).toBe(false);
    expect(visible(inside.defs, 'explorer.removeFromLibrary', inside.menuCtx)).toBe(true);
    action(inside.defs, 'explorer.removeFromLibrary').action?.(inside.menuCtx);
    expect(ctx.library.removeFolder as any).toHaveBeenCalledWith('D:/lib/Lib');
  });
});

describe('media actions', () => {
  it('plays and queues media files', () => {
    const { defs, menuCtx } = menu.itemMenu(file('clip.mp4', '.mp4'));

    action(defs, 'common.play').action?.(menuCtx);
    action(defs, 'common.addToQueue').action?.(menuCtx);

    expect(ctx.playItem as any).toHaveBeenCalledTimes(1);
    expect(ctx.addToQueueItem as any).toHaveBeenCalledTimes(1);
  });

  it('opens the clicked image at its filtered index', () => {
    ctx.filteredFiles = computed(() => [file('a.png', '.png'), file('b.png', '.png')]);
    menu = createExplorerMenuDefs(ctx);
    const target = file('b.png', '.png');
    const { defs, menuCtx } = menu.itemMenu(target);

    action(defs, 'explorer.openImage').action?.(menuCtx);

    expect(ctx.openImageViewer as any).toHaveBeenCalledWith(1);
  });

  it('ignores images missing from the filtered list', () => {
    ctx.filteredFiles = computed(() => []);
    menu = createExplorerMenuDefs(ctx);
    const { defs, menuCtx } = menu.itemMenu(file('b.png', '.png'));

    action(defs, 'explorer.openImage').action?.(menuCtx);

    expect(ctx.openImageViewer as any).not.toHaveBeenCalled();
  });
});

describe('tools submenu', () => {
  it('prefers the multi-selection over the clicked file', () => {
    ctx.filteredFiles = computed(() => [
      file('a.png', '.png'),
      file('b.png', '.png'),
      dir('folder')
    ]);
    ctx.explorer.selectedFiles = new Set(['D:/a.png', 'D:/folder']);
    menu = createExplorerMenuDefs(ctx);
    const { defs, menuCtx } = menu.itemMenu(file('c.png', '.png'));

    const tools = action(defs, 'explorer.tools');
    tools.children?.[0].action?.(menuCtx);

    expect(ctx.openToolWithFiles as any).toHaveBeenCalledWith('image-studio', ['D:/a.png']);
  });

  it('falls back to the clicked file', () => {
    const { defs, menuCtx } = menu.itemMenu(file('c.png', '.png'));

    action(defs, 'explorer.tools').children?.[0].action?.(menuCtx);

    expect(ctx.openToolWithFiles as any).toHaveBeenCalledWith('image-studio', ['D:/c.png']);
  });

  it('hides the submenu for folders without a selected file', () => {
    const { defs } = menu.itemMenu(dir('folder'));
    expect(defs.some((def) => def.label === 'explorer.tools')).toBe(false);
  });

  it('skips unsupported selections', () => {
    const { defs, menuCtx } = menu.itemMenu(file('a.png', '.png'));
    const tools = action(defs, 'explorer.tools');

    expect(() =>
      tools.children?.[0].action?.({
        ...menuCtx,
        item: null,
        filteredFiles: computed(() => [])
      } as never)
    ).not.toThrow();
    expect(ctx.openToolWithFiles as any).toHaveBeenCalledTimes(0);
  });
});

describe('properties', () => {
  it('opens file properties', () => {
    const { defs, menuCtx } = menu.itemMenu(file('song.mp3', '.mp3'));

    action(defs, 'explorer.properties').action?.(menuCtx);

    expect(ctx.openProperties as any).toHaveBeenCalledTimes(1);
  });

  it('ignores properties without an item', () => {
    const { defs } = menu.itemMenu(file('song.mp3', '.mp3'));
    expect(() =>
      action(defs, 'explorer.properties').action?.({ item: null } as never)
    ).not.toThrow();
    expect(ctx.openProperties as any).not.toHaveBeenCalled();
  });
});

describe('defensive branches', () => {
  it('handles separators, missing items and directory-only actions', () => {
    const { defs, menuCtx } = menu.itemMenu(file('song.mp3', '.mp3'));

    action(defs, 'explorer.openImage').action?.({ item: null } as never);
    action(defs, 'explorer.openInTerminal').action?.({ item: null } as never);
    expect(ctx.openImageViewer as any).not.toHaveBeenCalled();
    expect(state.terminal).not.toHaveBeenCalled();

    const terminal = action(defs, 'explorer.openInTerminal');
    expect(terminal.when?.({ item: dir('Music') } as never)).toBe(true);

    const del = action(defs, 'common.delete');
    expect(del.disabledWhen?.({ item: null } as never)).toBe(false);

    for (const def of defs.filter((entry) => entry.separator)) {
      if (def.when) def.when(menuCtx);
    }

    const empty = menu.emptyMenu();
    for (const def of empty.defs.filter((entry) => entry.separator)) {
      def.when?.(empty.menuCtx);
    }
  });
});
