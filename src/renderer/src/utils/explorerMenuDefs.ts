import type { ComputedRef } from 'vue';
import type { useI18n } from 'vue-i18n';
import type { useExplorerStore } from '@renderer/stores/explorer';
import type { useClipboardStore } from '@renderer/stores/clipboard';
import type { useLibraryStore } from '@renderer/stores/library';
import type { useUIStore } from '@renderer/stores/ui';
import { isLibraryFolder } from '@renderer/utils/libraryFolders';
import { IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS } from '@shared/constants';
import type { FileItem } from '@renderer/types/explorer';
import type { ContextMenuAction } from '@renderer/composables/useContextMenu';
import { revealInFolder, openWithDefaultApp, openInTerminal, copyPathViaMain } from './menuActions';
import { filesForTool, toolsForFiles } from '@shared/tool-input';
import { TOOL_TITLE_KEYS, type ToolId } from '@shared/types/tools';

export interface ExplorerActionCtx {
  explorer: ReturnType<typeof useExplorerStore>;
  fileClipboard: ReturnType<typeof useClipboardStore>;
  library: ReturnType<typeof useLibraryStore>;
  ui: ReturnType<typeof useUIStore>;
  t: ReturnType<typeof useI18n>['t'];
  filteredFiles: ComputedRef<FileItem[]>;
  openImageViewer: (index: number) => void;
  openProperties: (item: FileItem) => void;
  playItem: (item: FileItem) => void;
  addToQueueItem: (item: FileItem) => void;
  navigateTo: (path: string) => void;
  copySelectedPaths: () => void;
  cutSelectedPaths: () => void;
  pasteClipboard: () => void;
  createNewFolder: () => void;
  renameItem: (item: FileItem) => void;
  deleteItem: (item: FileItem) => void;
  openToolWithFiles: (toolId: ToolId, paths: string[]) => void | Promise<void>;
}

interface MenuCtx {
  item: FileItem | null;
  explorer: ExplorerActionCtx['explorer'];
  fileClipboard: ExplorerActionCtx['fileClipboard'];
  library: ExplorerActionCtx['library'];
  t: ExplorerActionCtx['t'];
  filteredFiles: ExplorerActionCtx['filteredFiles'];
  openImageViewer: ExplorerActionCtx['openImageViewer'];
  openProperties: ExplorerActionCtx['openProperties'];
  playItem: ExplorerActionCtx['playItem'];
  addToQueueItem: ExplorerActionCtx['addToQueueItem'];
  navigateTo: ExplorerActionCtx['navigateTo'];
  copySelectedPaths: ExplorerActionCtx['copySelectedPaths'];
  cutSelectedPaths: ExplorerActionCtx['cutSelectedPaths'];
  pasteClipboard: ExplorerActionCtx['pasteClipboard'];
  createNewFolder: ExplorerActionCtx['createNewFolder'];
  renameItem: ExplorerActionCtx['renameItem'];
  deleteItem: ExplorerActionCtx['deleteItem'];
  openToolWithFiles: ExplorerActionCtx['openToolWithFiles'];
}

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);
// Obrazy mają własne „Otwórz obraz” i nie należą do kolejki odtwarzacza —
// wcześniej `isMedia` obejmował je, więc menu obrazu miało martwe „Odtwórz”
// i „Dodaj do kolejki”.
const PLAYABLE_EXT_SET = new Set([...AUDIO_EXTS, ...VIDEO_EXTS]);

// Buildery definicji menu Eksploratora wydzielone z
// `composables/useExplorerContextMenu.ts` (plan 2.8). Zwracają `{ defs, menuCtx }`,
// więc composable zachowuje własność `useContextMenu().open`.
export function createExplorerMenuDefs(ctx: ExplorerActionCtx) {
  const { explorer, fileClipboard, library, t, filteredFiles } = ctx;

  function makeCtx(item: FileItem | null): MenuCtx {
    return {
      item,
      explorer,
      fileClipboard,
      library,
      t,
      filteredFiles,
      openImageViewer: ctx.openImageViewer,
      openProperties: ctx.openProperties,
      playItem: ctx.playItem,
      addToQueueItem: ctx.addToQueueItem,
      navigateTo: ctx.navigateTo,
      copySelectedPaths: ctx.copySelectedPaths,
      cutSelectedPaths: ctx.cutSelectedPaths,
      pasteClipboard: ctx.pasteClipboard,
      createNewFolder: ctx.createNewFolder,
      renameItem: ctx.renameItem,
      deleteItem: ctx.deleteItem,
      openToolWithFiles: ctx.openToolWithFiles
    };
  }

  function hasClipboard(c: MenuCtx): boolean {
    return c.explorer.selectedCount > 0 || c.fileClipboard.items.length > 0;
  }

  function clipboardDefs(): ContextMenuAction<MenuCtx>[] {
    return [
      {
        label: t('common.copy'),
        shortcut: 'Ctrl+C',
        when: (c) => c.explorer.selectedCount > 0,
        action: () => ctx.copySelectedPaths()
      },
      {
        label: t('common.cut'),
        shortcut: 'Ctrl+X',
        when: (c) => c.explorer.selectedCount > 0,
        action: () => ctx.cutSelectedPaths()
      },
      {
        label: t('common.paste'),
        shortcut: 'Ctrl+V',
        when: (c) => c.fileClipboard.items.length > 0,
        action: () => ctx.pasteClipboard()
      }
    ];
  }

  function selectAllDefs(): ContextMenuAction<MenuCtx>[] {
    return [
      {
        label: t('common.selectAll'),
        shortcut: 'Ctrl+A',
        action: (c) => {
          c.explorer.clearSelection();
          c.filteredFiles.value.forEach((f) => c.explorer.selectedFiles.add(f.path));
        }
      }
    ];
  }

  function fileCommonDefs(): ContextMenuAction<MenuCtx>[] {
    return [
      {
        label: t('explorer.openWithDefaultApp'),
        action: (c) => {
          if (c.item) openWithDefaultApp(c.item.path);
        }
      },
      {
        label: t('explorer.copyPath'),
        action: (c) => {
          if (c.item) copyPathViaMain(c.item.path);
        }
      },
      {
        label: t('common.showInFolder'),
        action: (c) => {
          if (c.item) revealInFolder(c.item.path);
        }
      }
    ];
  }

  function renameDeleteDefs(): ContextMenuAction<MenuCtx>[] {
    return [
      {
        label: t('explorer.rename'),
        shortcut: 'F2',
        action: (c) => c.item != null && ctx.renameItem(c.item)
      },
      {
        label: t('common.delete'),
        shortcut: 'Del',
        disabledWhen: (c) => isLibraryFolder(c.item?.path ?? ''),
        action: (c) => c.item != null && ctx.deleteItem(c.item)
      }
    ];
  }

  function toolMenuDefs(c: MenuCtx): ContextMenuAction<MenuCtx>[] {
    const paths = selectedToolPaths(c);
    if (paths.length === 0) return [];
    const tools = toolsForFiles(paths);
    if (tools.length === 0) return [];
    return [
      {
        label: t('explorer.tools'),
        children: tools.map((toolId) => ({
          label: t(TOOL_TITLE_KEYS[toolId]),
          action: (menuCtx) => {
            const files = filesForTool(toolId, selectedToolPaths(menuCtx));
            if (files.length > 0) void ctx.openToolWithFiles(toolId, files);
          }
        }))
      }
    ];
  }

  function selectedToolPaths(c: MenuCtx): string[] {
    const selected = c.filteredFiles.value
      .filter((file) => !file.isDirectory && c.explorer.selectedFiles.has(file.path))
      .map((file) => file.path);
    if (selected.length > 0) return selected;
    return c.item && !c.item.isDirectory ? [c.item.path] : [];
  }

  function itemDefs(c: MenuCtx): ContextMenuAction<MenuCtx>[] {
    return [
      {
        label: t('explorer.open'),
        shortcut: 'Enter',
        when: (ctxItem) => !!ctxItem.item?.isDirectory,
        action: (ctxItem) => ctxItem.item != null && ctx.navigateTo(ctxItem.item.path)
      },
      {
        label: t('common.play'),
        shortcut: 'Enter',
        when: (ctxItem) => isPlayable(ctxItem.item),
        action: (ctxItem) => ctxItem.item != null && ctx.playItem(ctxItem.item)
      },
      {
        label: t('common.addToQueue'),
        when: (ctxItem) => isPlayable(ctxItem.item),
        action: (ctxItem) => ctxItem.item != null && ctx.addToQueueItem(ctxItem.item)
      },
      {
        label: t('explorer.openImage'),
        shortcut: 'Enter',
        when: (ctxItem) => isImage(ctxItem.item),
        action: (ctxItem) => {
          if (!ctxItem.item) return;
          const idx = ctxItem.filteredFiles.value.findIndex((f) => f.path === ctxItem.item!.path);
          if (idx >= 0) ctx.openImageViewer(idx);
        }
      },
      ...toolMenuDefs(c),
      {
        label: t('explorer.addToLibrary'),
        when: (ctxItem) => !!ctxItem.item?.isDirectory && !isLibraryFolder(ctxItem.item.path),
        action: (ctxItem) => ctxItem.item != null && library.addFolder(ctxItem.item.path)
      },
      {
        label: t('explorer.removeFromLibrary'),
        when: (ctxItem) => !!ctxItem.item?.isDirectory && isLibraryFolder(ctxItem.item.path),
        action: (ctxItem) => ctxItem.item != null && library.removeFolder(ctxItem.item.path)
      },
      {
        label: t('explorer.openInTerminal'),
        when: (ctxItem) => !!ctxItem.item?.isDirectory,
        action: (ctxItem) => {
          if (ctxItem.item) openInTerminal(ctxItem.item.path);
        }
      },
      ...fileCommonDefs(),
      { separator: true, label: '', when: (ctxItem) => ctxItem.item != null },
      ...renameDeleteDefs()
    ];
  }

  function isImage(item: FileItem | null): boolean {
    return !!item?.extension && IMAGE_EXT_SET.has(item.extension);
  }
  function isPlayable(item: FileItem | null): boolean {
    return !!item?.extension && PLAYABLE_EXT_SET.has(item.extension);
  }

  function emptyMenu(): { defs: ContextMenuAction<MenuCtx>[]; menuCtx: MenuCtx } {
    const defs: ContextMenuAction<MenuCtx>[] = [
      ...clipboardDefs(),
      { separator: true, label: '', when: hasClipboard },
      {
        label: t('explorer.newFolder'),
        action: () => ctx.createNewFolder()
      },
      {
        label: t('explorer.openInTerminal'),
        action: () => openInTerminal(explorer.currentPath)
      },
      { separator: true, label: '', when: () => true },
      {
        label: t('explorer.openWithDefaultApp'),
        action: () => openWithDefaultApp(explorer.currentPath)
      },
      {
        label: t('common.showInFolder'),
        action: () => revealInFolder(explorer.currentPath)
      },
      { separator: true, label: '', when: () => true },
      ...selectAllDefs()
    ];
    return { defs, menuCtx: makeCtx(null) };
  }

  function itemMenu(item: FileItem): { defs: ContextMenuAction<MenuCtx>[]; menuCtx: MenuCtx } {
    const menuCtx = makeCtx(item);
    const defs: ContextMenuAction<MenuCtx>[] = [
      ...clipboardDefs(),
      { separator: true, label: '', when: hasClipboard },
      ...itemDefs(menuCtx),
      { separator: true, label: '' },
      {
        label: t('explorer.properties'),
        shortcut: 'Alt+Enter',
        action: (c) => c.item != null && ctx.openProperties(c.item)
      },
      { separator: true, label: '' },
      ...selectAllDefs()
    ];
    return { defs, menuCtx };
  }

  return { emptyMenu, itemMenu };
}
