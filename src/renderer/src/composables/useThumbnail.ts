import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  thumbTasks,
  cachedThumb,
  setCachedThumb,
  cachedIcon,
  setCachedIcon,
  processThumbQueue,
  thumbTaskDone
} from '@renderer/utils/thumbLoader';
import { logger } from '@shared/logger';

// Single shared IntersectionObserver for every thumbnail element — one
// observer instead of one per row.
const thumbVisibleCallbacks = new WeakMap<Element, () => void>();

const thumbVisibilityObserver: IntersectionObserver | null =
  typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const cb = thumbVisibleCallbacks.get(entry.target);
            if (entry.isIntersecting && cb) {
              thumbVisibleCallbacks.delete(entry.target);
              cb();
            }
          }
        },
        { rootMargin: '400px' }
      )
    : null;

export function useThumbnail(
  path: string,
  isDirectory: boolean,
  isAtDrives: boolean,
  thumbSize = 320
) {
  const systemIcon = ref<string | null>(null);
  const mediaThumb = ref<string | null>(null);
  const rootEl = ref<HTMLElement | null>(null);
  const visible = ref(false);
  let thumbFired = false;

  onMounted(() => {
    if (rootEl.value && thumbVisibilityObserver) {
      thumbVisibleCallbacks.set(rootEl.value, () => {
        visible.value = true;
      });
      thumbVisibilityObserver.observe(rootEl.value);
    }
  });

  onBeforeUnmount(() => {
    if (rootEl.value) {
      thumbVisibilityObserver?.unobserve(rootEl.value);
      thumbVisibleCallbacks.delete(rootEl.value);
    }
  });

  watch(visible, (isVisible) => {
    if (!isVisible || isAtDrives || isDirectory) return;
    if (thumbFired) return;
    thumbFired = true;
    const cached = cachedThumb(path);
    if (cached) {
      mediaThumb.value = cached;
      return;
    }
    thumbTasks.push(() => {
      const thumbReq = window.api?.invoke('media:getThumbnail', path, thumbSize);
      if (!thumbReq) {
        thumbTaskDone();
        return;
      }
      thumbReq
        .then((dataUrl) => {
          if (dataUrl) {
            setCachedThumb(path, dataUrl as string);
            mediaThumb.value = dataUrl as string;
          } else {
            const icon = cachedIcon(path);
            if (icon) {
              systemIcon.value = icon;
            } else {
              const iconReq = window.api?.invoke('shell:getFileIcon', path);
              if (iconReq) {
                iconReq
                  .then((icon) => {
                    if (icon) {
                      setCachedIcon(path, icon as string);
                      systemIcon.value = icon as string;
                    }
                  })
                  .catch((err) => logger.error('Thumbnail', 'getFileIcon (fallback)', err));
              }
            }
          }
        })
        .catch((err) => {
          logger.error('Thumbnail', 'getThumbnail', err);
          const icon = cachedIcon(path);
          if (icon) {
            systemIcon.value = icon;
          } else {
            const iconReq = window.api?.invoke('shell:getFileIcon', path);
            if (iconReq) {
              iconReq
                .then((icon) => {
                  if (icon) {
                    setCachedIcon(path, icon as string);
                    systemIcon.value = icon as string;
                  }
                })
                .catch((err) => logger.error('Thumbnail', 'getFileIcon (error fallback)', err));
            }
          }
        })
        .finally(() => {
          thumbTaskDone();
        });
    });
    processThumbQueue();
  });

  return { rootEl, systemIcon, mediaThumb };
}
