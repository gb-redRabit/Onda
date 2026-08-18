import type { ComputedRef } from 'vue';
import type { useI18n } from 'vue-i18n';
import type { useExplorerStore } from '@renderer/stores/explorer';
import type { useClipboardStore } from '@renderer/stores/clipboard';
import type { useLibraryStore } from '@renderer/stores/library';
import type { useUIStore, ContextMenuItem } from '@renderer/stores/ui';
import { isLibraryFolder } from '@renderer/utils/libraryFolders';
import { IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS } from '@shared/constants';
import type { FileItem } from '@renderer/types/explorer';

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

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);
const MEDIA_EXT_SET = new Set([...AUDIO_EXTS, ...VIDEO_EXTS, ...IMAGE_EXTS]);

export function useExplorerContextMenu(ctx: ExplorerActionCtx) {
  const { explorer, fileClipboard, library, ui, t, filteredFiles } = ctx;
  const {
    copySelectedPaths,
    cutSelectedPaths,
    pasteClipboard,
    createNewFolder,
    renameItem,
    deleteItem
  } = ctx;

  function pushSeparator(items: ContextMenuItem[]) {
    items.push({ separator: true, label: '' });
  }

  function pushClipboardItems(items: ContextMenuItem[]) {
    if (explorer.selectedCount > 0) {
      items.push({ label: t('common.copy'), action: copySelectedPaths, shortcut: 'Ctrl+C' });
      items.push({ label: t('common.cut'), action: cutSelectedPaths, shortcut: 'Ctrl+X' });
    }
    if (fileClipboard.items.length > 0) {
      items.push({ label: t('common.paste'), action: pasteClipboard, shortcut: 'Ctrl+V' });
    }
  }

  function pushSelectAll(items: ContextMenuItem[]) {
    items.push({
      label: t('common.selectAll'),
      action: () => {
        explorer.clearSelection();
        filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path));
      },
      shortcut: 'Ctrl+A'
    });
  }

  function pushRenameDelete(items: ContextMenuItem[], item: FileItem, disabled = false) {
    items.push({ label: t('explorer.rename'), action: () => renameItem(item), shortcut: 'F2' });
    items.push({
      label: t('common.delete'),
      disabled,
      action: () => deleteItem(item),
      shortcut: 'Del'
    });
  }

  function pushShowInFolder(items: ContextMenuItem[], path: string) {
    items.push({
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', path)
    });
  }

  function pushFileCommon(items: ContextMenuItem[], path: string) {
    items.push({
      label: t('explorer.openWithDefaultApp'),
      action: () => window.api?.invoke('shell:openWithDefault', path)
    });
    items.push({
      label: t('explorer.copyPath'),
      action: () => window.api?.invoke('fs:copyPath', path),
      shortcut: 'Ctrl+C'
    });
    pushShowInFolder(items, path);
  }

  function handleEmptyContextMenu(event: MouseEvent) {
    const items: ContextMenuItem[] = [];
    explorer.clearSelection();
    pushClipboardItems(items);
    if (items.length > 0) pushSeparator(items);
    items.push({ label: t('explorer.newFolder'), action: () => createNewFolder() });
    items.push({
      label: t('explorer.openInTerminal'),
      action: () => window.api?.invoke('shell:openTerminal', explorer.currentPath)
    });
    pushSeparator(items);
    items.push({
      label: t('explorer.openWithDefaultApp'),
      action: () => window.api?.invoke('shell:openWithDefault', explorer.currentPath)
    });
    items.push({
      label: t('common.showInFolder'),
      action: () => window.api?.invoke('shell:showItemInFolder', explorer.currentPath)
    });
    pushSeparator(items);
    pushSelectAll(items);
    ui.showContextMenu(event.clientX, event.clientY, items);
  }

  function handleContextMenu(event: MouseEvent, item: FileItem) {
    if (!explorer.selectedFiles.has(item.path)) {
      explorer.clearSelection();
      explorer.selectedFiles.add(item.path);
    }
    const items: ContextMenuItem[] = [];
    pushClipboardItems(items);
    if (items.length > 0) pushSeparator(items);

    if (item.isDirectory) {
      items.push({
        label: t('explorer.open'),
        action: () => ctx.navigateTo(item.path),
        shortcut: 'Enter'
      });
      pushSeparator(items);
      const alreadyInLibrary = isLibraryFolder(item.path);
      items.push({
        label: alreadyInLibrary ? t('explorer.removeFromLibrary') : t('explorer.addToLibrary'),
        action: () => {
          if (alreadyInLibrary) library.removeFolder(item.path);
          else library.addFolder(item.path);
        }
      });
      items.push({
        label: t('explorer.openInTerminal'),
        action: () => window.api?.invoke('shell:openTerminal', item.path)
      });
      pushFileCommon(items, item.path);
      pushSeparator(items);
      pushRenameDelete(items, item, isLibraryFolder(item.path));
    } else if (item.extension && IMAGE_EXT_SET.has(item.extension)) {
      items.push({
        label: t('explorer.openImage'),
        action: () => {
          const idx = filteredFiles.value.findIndex((f) => f.path === item.path);
          ctx.openImageViewer(idx);
        },
        shortcut: 'Enter'
      });
      pushSeparator(items);
      pushFileCommon(items, item.path);
      pushSeparator(items);
      pushRenameDelete(items, item);
    } else if (item.extension && MEDIA_EXT_SET.has(item.extension)) {
      items.push({
        label: t('common.play'),
        action: () => ctx.playItem(item),
        shortcut: 'Enter'
      });
      items.push({
        label: t('common.addToQueue'),
        action: () => ctx.addToQueueItem(item)
      });
      pushSeparator(items);
      pushFileCommon(items, item.path);
      pushSeparator(items);
      pushRenameDelete(items, item);
    } else {
      pushFileCommon(items, item.path);
      pushSeparator(items);
      pushRenameDelete(items, item);
      pushSeparator(items);
    }

    pushSeparator(items);
    items.push({
      label: t('explorer.properties'),
      action: () => ctx.openProperties(item),
      shortcut: 'Alt+Enter'
    });
    pushSeparator(items);
    pushSelectAll(items);
    ui.showContextMenu(event.clientX, event.clientY, items);
  }

  return { handleContextMenu, handleEmptyContextMenu };
}
