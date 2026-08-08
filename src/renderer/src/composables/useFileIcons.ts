import { shallowRef, onBeforeUnmount, triggerRef } from 'vue';
import type { Ref } from 'vue';
import { logger } from '@shared/logger';
import type { FileItem } from '@renderer/types/explorer';
import { cachedIcon, setCachedIcon } from '@renderer/utils/thumbLoader';

const ICON_CONCURRENCY = 6;

export function useFileIcons() {
  const extraSmallIcons = shallowRef<Record<string, string>>({});
  const iconPendingQueue = new Set<string>();
  let iconActive = 0;
  let iconQueueTimer: ReturnType<typeof setTimeout> | null = null;
  let iconRenderTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingIcons: Record<string, string> = {};

  function scheduleIconRender() {
    if (iconRenderTimer !== null) return;
    iconRenderTimer = setTimeout(() => {
      iconRenderTimer = null;
      if (Object.keys(pendingIcons).length === 0) return;
      extraSmallIcons.value = { ...extraSmallIcons.value, ...pendingIcons };
      pendingIcons = {};
      triggerRef(extraSmallIcons);
    }, 0);
  }

  function pumpIcons() {
    while (iconActive < ICON_CONCURRENCY && iconPendingQueue.size > 0) {
      const path = iconPendingQueue.values().next().value as string;
      iconPendingQueue.delete(path);
      iconActive++;
      window.api
        ?.invoke('shell:getFileIcon', path)
        .then((icon) => {
          if (icon) {
            setCachedIcon(path, icon as string);
            pendingIcons[path] = icon as string;
            scheduleIconRender();
          }
        })
        .catch((err) => logger.error('Explorer', 'getFileIcon', err))
        .finally(() => {
          iconActive--;
          pumpIcons();
        });
    }
  }

  function extraSmallIcon(item: FileItem): string | null {
    if (item.isDirectory) return null;
    const cached = cachedIcon(item.path);
    if (cached) {
      return extraSmallIcons.value[item.path] ?? cached;
    }
    if (!iconPendingQueue.has(item.path)) {
      iconPendingQueue.add(item.path);
      if (iconQueueTimer === null) {
        iconQueueTimer = setTimeout(() => {
          iconQueueTimer = null;
          pumpIcons();
        }, 0);
      }
    }
    return null;
  }

  onBeforeUnmount(() => {
    if (iconQueueTimer) {
      clearTimeout(iconQueueTimer);
      iconQueueTimer = null;
    }
    if (iconRenderTimer) {
      clearTimeout(iconRenderTimer);
      iconRenderTimer = null;
    }
  });

  return { extraSmallIcons, extraSmallIcon };
}

export type FileIcons = { extraSmallIcons: Ref<Record<string, string>>; extraSmallIcon: (item: FileItem) => string | null };
