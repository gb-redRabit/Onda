import { useI18n } from 'vue-i18n';
import { useOnlineStore } from '@renderer/stores/online';
import { useContextMenu, type ContextMenuAction } from './useContextMenu';
import type { DownloadTask } from '@renderer/types/online';

export interface DownloadCtx {
  task: DownloadTask;
  onPlay: (task: DownloadTask) => void;
  onOpenFolder?: (path?: string) => void;
  onCopyText?: (text: string) => void;
}

const ACTIVE_STATUSES = ['pending', 'downloading', 'paused'];

export function useDownloadsContextMenu() {
  const { t } = useI18n();
  const yt = useOnlineStore();
  const { open } = useContextMenu();

  function build(_ctx: DownloadCtx): ContextMenuAction<DownloadCtx>[] {
    return [
      {
        label: t('ctx.downloads.play'),
        when: (c) => c.task.status === 'completed' && !!c.task.outputPath,
        action: (c) => c.onPlay(c.task)
      },
      {
        label: t('ctx.downloads.resume'),
        when: (c) => c.task.status === 'paused',
        action: (c) => yt.resumeDownload(c.task.id)
      },
      {
        label: t('ctx.downloads.cancel'),
        when: (c) => ACTIVE_STATUSES.includes(c.task.status),
        action: (c) => yt.cancelDownload(c.task.id)
      },
      {
        label: t('ctx.downloads.retry'),
        when: (c) => c.task.status === 'error' || c.task.status === 'cancelled',
        action: (c) => yt.retryDownload(c.task)
      },
      {
        label: t('ctx.downloads.moveToFront'),
        when: (c) => ACTIVE_STATUSES.includes(c.task.status),
        action: (c) => yt.moveToFront(c.task.id)
      },
      { separator: true, label: '' },
      {
        label: t('ctx.downloads.showInFolder'),
        when: (c) => !!c.task.outputPath && !!c.onOpenFolder,
        action: (c) => c.onOpenFolder?.(c.task.outputPath)
      },
      { separator: true, label: '' },
      {
        label: t('ctx.downloads.copyTitle'),
        action: (c) => c.onCopyText?.(c.task.title)
      },
      {
        label: t('ctx.downloads.copyPath'),
        when: (c) => !!c.task.outputPath && !!c.onCopyText,
        action: (c) => c.onCopyText?.(c.task.outputPath)
      }
    ];
  }

  function openMenu(e: MouseEvent, ctx: DownloadCtx) {
    open(e, build(ctx), ctx);
  }

  return { openMenu };
}