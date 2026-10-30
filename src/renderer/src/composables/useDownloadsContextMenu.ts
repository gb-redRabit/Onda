import { useI18n } from 'vue-i18n';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  FolderOpen,
  Hash,
  Library,
  Pencil,
  Play,
  RotateCcw,
  X
} from '@lucide/vue';
import { useOnlineStore } from '@renderer/stores/online';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';
import type { DownloadTask } from '@renderer/types/online';

export interface DownloadCtx {
  task: DownloadTask;
  onPlay: (task: DownloadTask) => void;
  onOpenFolder?: (path?: string) => void;
  onCopyText?: (text: string) => void;
  onEditMeta?: () => void;
  onOpenLibrary?: () => void;
  /** Anulowanie z potwierdzeniem; bez niego zadanie jest anulowane od razu. */
  onCancel?: () => void;
}

const ACTIVE_STATUSES: DownloadTask['status'][] = ['pending', 'downloading', 'paused'];
const isActive = (c: DownloadCtx) => ACTIVE_STATUSES.includes(c.task.status);
const isCompleted = (c: DownloadCtx) => c.task.status === 'completed' && !!c.task.outputPath;

/**
 * Akcje wiersza pobierania. Jedna lista obsługuje menu kontekstowe (prawy
 * przycisk) i menu `⋯` w wierszu, więc etykiety i warunki widoczności są zawsze
 * spójne.
 */
export function useDownloadsContextMenu() {
  const { t } = useI18n();
  const yt = useOnlineStore();
  const { open, openAt } = useContextMenu();

  function actions(): ContextMenuAction<DownloadCtx>[] {
    return [
      {
        label: t('ctx.downloads.play'),
        icon: Play,
        when: isCompleted,
        action: (c) => c.onPlay(c.task)
      },
      {
        label: t('ctx.downloads.resume'),
        icon: Play,
        when: (c) => c.task.status === 'paused',
        action: (c) => yt.resumeDownload(c.task.id)
      },
      {
        label: t('ctx.downloads.cancel'),
        icon: X,
        when: isActive,
        action: (c) => (c.onCancel ? c.onCancel() : yt.cancelDownload(c.task.id))
      },
      {
        label: t('ctx.downloads.retry'),
        icon: RotateCcw,
        when: (c) => c.task.status === 'error' || c.task.status === 'cancelled',
        action: (c) => yt.retryDownload(c.task)
      },
      {
        label: t('ctx.downloads.moveToFront'),
        icon: ArrowUpToLine,
        when: (c) => c.task.status === 'pending',
        action: (c) => yt.moveToFront(c.task.id)
      },
      {
        label: t('ctx.downloads.moveUp'),
        icon: ArrowUp,
        when: (c) => c.task.status === 'pending',
        action: (c) => yt.move(c.task.id, -1)
      },
      {
        label: t('ctx.downloads.moveDown'),
        icon: ArrowDown,
        when: (c) => c.task.status === 'pending',
        action: (c) => yt.move(c.task.id, 1)
      },
      { separator: true, label: '' },
      {
        label: t('ctx.downloads.editMetadata'),
        icon: Pencil,
        when: (c) => c.task.status === 'completed' && !!c.onEditMeta,
        action: (c) => c.onEditMeta?.()
      },
      {
        label: t('ctx.downloads.showInFolder'),
        icon: FolderOpen,
        when: (c) => isCompleted(c) && !!c.onOpenFolder,
        action: (c) => c.onOpenFolder?.(c.task.outputPath)
      },
      {
        label: t('ctx.downloads.openLibrary'),
        icon: Library,
        when: (c) => !!c.task.inLibrary && !!c.onOpenLibrary,
        action: (c) => c.onOpenLibrary?.()
      },
      { separator: true, label: '' },
      {
        label: t('ctx.downloads.copyPath'),
        icon: Copy,
        when: (c) => !!c.task.outputPath && !!c.onCopyText,
        action: (c) => c.onCopyText?.(c.task.outputPath ?? '')
      },
      {
        label: t('ctx.downloads.copyHash'),
        icon: Hash,
        when: (c) => !!c.task.fileHash && !!c.onCopyText,
        action: (c) => c.onCopyText?.(c.task.fileHash ?? '')
      },
      {
        label: t('ctx.downloads.copyTitle'),
        icon: Copy,
        when: (c) => !!c.onCopyText,
        action: (c) => c.onCopyText?.(c.task.title)
      }
    ];
  }

  function openMenu(e: MouseEvent, ctx: DownloadCtx) {
    open(e, actions(), ctx);
  }

  function openMenuAt(target: HTMLElement, ctx: DownloadCtx) {
    openAt(target, actions(), ctx);
  }

  return { openMenu, openMenuAt };
}
