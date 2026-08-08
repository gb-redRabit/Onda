import type { ComputedRef } from 'vue';
import type { useI18n } from 'vue-i18n';
import type { useExplorerStore } from '@renderer/stores/explorer';
import type { useClipboardStore } from '@renderer/stores/clipboard';
import type { usePlayerStore } from '@renderer/stores/player';
import type { useUIStore } from '@renderer/stores/ui';
import { IMAGE_EXTS, AUDIO_EXTS, VIDEO_EXTS } from '@shared/constants';
import type { FileItem } from '@renderer/types/explorer';
import type { MediaFile } from '@renderer/types/media';
import { buildMediaFile } from '@renderer/utils/explorerMedia';
import type { useRouter } from 'vue-router';

export interface ExplorerActionsCtx {
  explorer: ReturnType<typeof useExplorerStore>;
  fileClipboard: ReturnType<typeof useClipboardStore>;
  player: ReturnType<typeof usePlayerStore>;
  ui: ReturnType<typeof useUIStore>;
  t: ReturnType<typeof useI18n>['t'];
  router: ReturnType<typeof useRouter>;
  filteredFiles: ComputedRef<FileItem[]>;
  showPrompt: (msg: string, initial?: string) => Promise<string | null>;
  showConfirm: (msg: string) => Promise<boolean>;
  openImageViewer: (index: number) => void;
  openProperties: (item: FileItem) => void;
  openInWindow: () => void;
}

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);
const MEDIA_EXT_SET = new Set([...AUDIO_EXTS, ...VIDEO_EXTS, ...IMAGE_EXTS]);

function toMediaFile(item: FileItem): MediaFile {
  return buildMediaFile({
    path: item.path,
    name: item.name,
    extension: item.extension || '',
    size: item.size,
    mimeType: item.mimeType || ''
  });
}

export function useExplorerActions(ctx: ExplorerActionsCtx) {
  const { explorer, fileClipboard, player, t, filteredFiles } = ctx;

  function playItem(item: FileItem) {
    if (item.isDirectory) {
      explorer.navigateTo(item.path);
    } else if (item.extension && IMAGE_EXT_SET.has(item.extension)) {
      const idx = filteredFiles.value.findIndex((f) => f.path === item.path);
      ctx.openImageViewer(idx);
    } else if (item.extension && MEDIA_EXT_SET.has(item.extension)) {
      const track = toMediaFile(item);
      player.setTrack(track);
      if (track.type === 'video') ctx.router.push('/player');
    }
  }

  function addToQueueItem(item: FileItem) {
    if (!item.extension || !MEDIA_EXT_SET.has(item.extension)) return;
    player.addToQueue(toMediaFile(item));
  }

  async function deleteSelected() {
    const items = filteredFiles.value.filter((f) => explorer.selectedFiles.has(f.path));
    if (items.length === 0) return;
    const msg =
      items.length === 1
        ? t('explorer.deleteConfirm', { name: items[0].name })
        : t('explorer.deleteMultipleConfirm', { count: items.length });
    const ok = await ctx.showConfirm(msg);
    if (!ok) return;
    await Promise.all(items.map((f) => window.api?.invoke('fs:delete', f.path)));
    explorer.loadFiles(explorer.currentPath);
  }

  async function deleteItem(item: FileItem) {
    const ok = await ctx.showConfirm(t('explorer.deleteConfirm', { name: item.name }));
    if (!ok) return;
    await window.api?.invoke('fs:delete', item.path);
    explorer.loadFiles(explorer.currentPath);
  }

  async function renameSelected() {
    const item = filteredFiles.value.find((f) => explorer.selectedFiles.has(f.path));
    if (!item) return;
    await renameItem(item);
  }

  async function renameItem(item: FileItem) {
    const newName = await ctx.showPrompt(t('explorer.rename') + ':', item.name);
    if (newName && newName !== item.name) {
      await window.api?.invoke('media:renameFile', item.path, newName);
      explorer.loadFiles(explorer.currentPath);
    }
  }

  function enterSelected() {
    const item = filteredFiles.value.find((f) => explorer.selectedFiles.has(f.path));
    if (item) playItem(item);
  }

  function copySelectedPaths() {
    const paths = filteredFiles.value
      .filter((f) => explorer.selectedFiles.has(f.path))
      .map((f) => f.path);
    if (paths.length > 0) fileClipboard.setClipboard(paths, 'copy');
  }

  function cutSelectedPaths() {
    const paths = filteredFiles.value
      .filter((f) => explorer.selectedFiles.has(f.path))
      .map((f) => f.path);
    if (paths.length > 0) fileClipboard.setClipboard(paths, 'cut');
  }

  async function pasteClipboard() {
    if (fileClipboard.items.length === 0 || !fileClipboard.action) return;
    if (!explorer.currentPath) return;
    const paths = fileClipboard.items.map((i) => i.path);
    const dest = explorer.currentPath;
    if (fileClipboard.action === 'copy') {
      await window.api?.invoke('fs:copy', paths, dest);
    } else {
      await window.api?.invoke('fs:move', paths, dest);
      fileClipboard.clear();
    }
    explorer.loadFiles(dest);
    window.api?.send('explorer:refreshAll');
  }

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      explorer.clearSelection();
    } else if (e.key === 'Delete') {
      void deleteSelected();
    } else if (e.key === 'F2') {
      e.preventDefault();
      void renameSelected();
    } else if (e.altKey && e.key === 'Enter') {
      e.preventDefault();
      const item = filteredFiles.value.find((f) => explorer.selectedFiles.has(f.path));
      if (item) ctx.openProperties(item);
    } else if (e.key === 'Enter') {
      enterSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      explorer.clearSelection();
      filteredFiles.value.forEach((f) => explorer.selectedFiles.add(f.path));
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      copySelectedPaths();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault();
      cutSelectedPaths();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      void pasteClipboard();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'n') {
      e.preventDefault();
      void ctx.openInWindow();
    }
  }

  return {
    playItem,
    addToQueueItem,
    deleteSelected,
    deleteItem,
    renameSelected,
    renameItem,
    copySelectedPaths,
    cutSelectedPaths,
    pasteClipboard,
    onKeydown
  };
}
