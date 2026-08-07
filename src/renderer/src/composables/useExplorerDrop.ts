import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useExplorerStore } from '@renderer/stores/explorer';
import { useSettingsStore } from '@renderer/stores/settings';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { handleTabDrop } from '@renderer/utils/explorerTabDrop';

export function useExplorerDrop(
  explorer: ReturnType<typeof useExplorerStore>,
  settings: ReturnType<typeof useSettingsStore>,
  showConfirm: (msg: string) => Promise<boolean>
) {
  const { t } = useI18n();
  const hoveredFolderPath = ref<string | null>(null);

  function getDropPaths(dt: DataTransfer | null, raw: string): string[] {
    const fromPlain = raw.split('\n').filter(Boolean);
    if (fromPlain.length > 0) return fromPlain;
    return getDroppedFilePaths(dt);
  }

  function onContentDragOver(e: DragEvent) {
    if (e.dataTransfer) e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'copy' : 'move';
    const el = (e.target as HTMLElement)?.closest('[data-folder-path]');
    hoveredFolderPath.value = el ? el.getAttribute('data-folder-path') : null;
  }

  function onContentDragLeave(e: DragEvent) {
    const el = (e.target as HTMLElement)?.closest('[data-folder-path]');
    if (!el) hoveredFolderPath.value = null;
  }

  async function onContentDrop(e: DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer?.getData('text/plain') || '';
    if (await handleTabDrop(raw)) return;
    const paths = getDropPaths(e.dataTransfer, raw);
    const targetDir = hoveredFolderPath.value || explorer.currentPath;
    hoveredFolderPath.value = null;
    if (paths.length === 0) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (settings.explorer.confirmBeforeMove) {
      const key = ctrl ? 'explorer.copyConfirm' : 'explorer.moveConfirm';
      const ok = await showConfirm(
        t(key, { n: paths.length, dir: targetDir.split('\\').pop() || targetDir })
      );
      if (!ok) return;
    }
    const method = ctrl ? 'fs:copy' : 'fs:move';
    await window.api?.invoke(method, paths, targetDir);
    explorer.loadFiles(explorer.currentPath);
    window.api?.send('explorer:refreshAll');
  }

  return {
    hoveredFolderPath,
    onContentDragOver,
    onContentDragLeave,
    onContentDrop
  };
}
