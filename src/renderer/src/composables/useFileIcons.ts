import { shallowRef, onBeforeUnmount, triggerRef } from 'vue';
import { logger } from '@shared/logger';
import type { FileItem } from '@renderer/types/explorer';
import { cachedIcon, setCachedIcon, isUsableImageDataUrl } from '@renderer/utils/thumbLoader';

const ICON_CONCURRENCY = 6;
// Górny limit „trwale nieudanych" ikon, aby zbiór nie rósł bez ograniczeń przez
// cały czas życia widoku (po przekroczeniu najstarsze wpisy są zapominane).
const MAX_FAILED_ICONS = 2000;

export function useFileIcons() {
  const extraSmallIcons = shallowRef<Record<string, string>>({});
  const iconPendingQueue = new Set<string>();
  // Ścieżki, których ikona powłoki wróciła pusta/uszkodzona — nigdy nie pytamy o nie ponownie
  // (wywołujący renderuje zastępczą ikonę kategorii zamiast nieskończonej pętli ponowień).
  const failedIcons = new Set<string>();

  function rememberFailedIcon(path: string): void {
    if (failedIcons.size >= MAX_FAILED_ICONS) {
      // Set iteruje w kolejności wstawiania — usuń najstarszy wpis.
      const oldest = failedIcons.values().next().value;
      if (oldest !== undefined) failedIcons.delete(oldest);
    }
    failedIcons.add(path);
  }
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
          if (isUsableImageDataUrl(icon)) {
            setCachedIcon(path, icon as string);
            pendingIcons[path] = icon as string;
            scheduleIconRender();
          } else {
            rememberFailedIcon(path);
          }
        })
        .catch((err) => {
          rememberFailedIcon(path);
          logger.error('Explorer', 'getFileIcon', err);
        })
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
    if (failedIcons.has(item.path)) return null;
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
