import type { ComputedRef } from 'vue';
import type { useI18n } from 'vue-i18n';
import type { useExplorerStore } from '@renderer/stores/explorer';
import type { useClipboardStore } from '@renderer/stores/clipboard';
import type { useLibraryStore } from '@renderer/stores/library';
import type { useUIStore } from '@renderer/stores/ui';
import { isLibraryFolder } from '@renderer/utils/libraryFolders';
import { IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS } from '@shared/constants';
import type { FileItem } from '@renderer/types/explorer';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';

interface ExplorerActionCtx {
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
}

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);
const MEDIA_EXT_SET = new Set([...AUDIO_EXTS, ...VIDEO_EXTS, ...IMAGE_EXTS]);

export function useExplorerContextMenu(ctx: ExplorerActionCtx) {
  const { explorer, fileClipboard, library, t, filteredFiles } = ctx;
  const { open } = useContextMenu();

  function handleEmptyContextMenu(event: MouseEvent) {
    explorer.clearSelection();
    const items: ContextMenuAction<MenuCtx>[] = [
      ...clipboardDefs(),
      { separator: true, label: '', when: hasClipboard },
      {
        label: t('explorer.newFolder'),
        action: () => ctx.createNewFolder()
      },
      {
        label: t('explorer.openInTerminal'),
        action: () => window.api?.invoke('shell:openTerminal', explorer.currentPath)
      },
      { separator: true, label: '', when: () => true },
      {
        label: t('explorer.openWithDefaultApp'),
        action: () => window.api?.invoke('shell:openWithDefault', explorer.currentPath)
      },
      {
        label: t('common.showInFolder'),
        action: () => window.api?.invoke('shell:showItemInFolder', explorer.currentPath)
      },
      { separator: true, label: '', when: () => true },
      ...selectAllDefs()
    ];
    open(event, items, makeCtx(null));
  }

  function handleContextMenu(event: MouseEvent, item: FileItem) {
    if (!explorer.selectedFiles.has(item.path)) {
      explorer.clearSelection();
      explorer.selectedFiles.add(item.path);
    }
    const items: ContextMenuAction<MenuCtx>[] = [
      ...clipboardDefs(),
      { separator: true, label: '', when: hasClipboard },
      ...itemDefs(),
      { separator: true, label: '' },
      {
        label: t('explorer.properties'),
        shortcut: 'Alt+Enter',
        action: (c) => c.item != null && ctx.openProperties(c.item)
      },
      { separator: true, label: '' },
      ...selectAllDefs()
    ];
    open(event, items, makeCtx(item));
  }

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
      deleteItem: ctx.deleteItem
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
        action: (c) => c.item && window.api?.invoke('shell:openWithDefault', c.item.path)
      },
      {
        label: t('explorer.copyPath'),
        shortcut: 'Ctrl+C',
        action: (c) => c.item && window.api?.invoke('fs:copyPath', c.item.path)
      },
      {
        label: t('common.showInFolder'),
        action: (c) => c.item && window.api?.invoke('shell:showItemInFolder', c.item.path)
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

  function itemDefs(): ContextMenuAction<MenuCtx>[] {
    return [
      {
        label: t('explorer.open'),
        shortcut: 'Enter',
        when: (c) => !!c.item?.isDirectory,
        action: (c) => c.item != null && ctx.navigateTo(c.item.path)
      },
      {
        label: t('common.play'),
        shortcut: 'Enter',
        when: (c) => isMedia(c.item),
        action: (c) => c.item != null && ctx.playItem(c.item)
      },
      {
        label: t('common.addToQueue'),
        when: (c) => isMedia(c.item),
        action: (c) => c.item != null && ctx.addToQueueItem(c.item)
      },
      {
        label: t('explorer.openImage'),
        shortcut: 'Enter',
        when: (c) => isImage(c.item),
        action: (c) => {
          if (!c.item) return;
          const idx = c.filteredFiles.value.findIndex((f) => f.path === c.item!.path);
          if (idx >= 0) ctx.openImageViewer(idx);
        }
      },
      {
        label: t('explorer.addToLibrary'),
        when: (c) => !!c.item?.isDirectory && !isLibraryFolder(c.item.path),
        action: (c) => c.item != null && library.addFolder(c.item.path)
      },
      {
        label: t('explorer.removeFromLibrary'),
        when: (c) => !!c.item?.isDirectory && isLibraryFolder(c.item.path),
        action: (c) => c.item != null && library.removeFolder(c.item.path)
      },
      {
        label: t('explorer.openInTerminal'),
        when: (c) => !!c.item?.isDirectory,
        action: (c) => c.item && window.api?.invoke('shell:openTerminal', c.item.path)
      },
      ...fileCommonDefs(),
      { separator: true, label: '', when: (c) => c.item != null },
      ...renameDeleteDefs()
    ];
  }

  function isImage(item: FileItem | null): boolean {
    return !!item?.extension && IMAGE_EXT_SET.has(item.extension);
  }
  function isMedia(item: FileItem | null): boolean {
    return !!item?.extension && MEDIA_EXT_SET.has(item.extension);
  }

  return { handleContextMenu, handleEmptyContextMenu };
}
