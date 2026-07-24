import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { thumbTasks, cachedThumb, setCachedThumb, cachedIcon, setCachedIcon, processThumbQueue, thumbTaskDone } from '@renderer/utils/thumbLoader';
import { logger } from '@renderer/utils/logger';

export function useThumbnail(path: string, isDirectory: boolean, isAtDrives: boolean, thumbSize = 320) {
  const systemIcon = ref<string | null>(null);
  const mediaThumb = ref<string | null>(null);
  const rootEl = ref<HTMLElement | null>(null);
  const visible = ref(false);
  let observer: IntersectionObserver | null = null;
  let thumbFired = false;

  onMounted(() => {
    if (rootEl.value) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            visible.value = true;
            observer?.disconnect();
          }
        },
        { rootMargin: '400px' }
      );
      observer.observe(rootEl.value);
    }
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
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
      window.api?.invoke('media:getThumbnail', path, thumbSize).then((dataUrl) => {
        if (dataUrl) {
          setCachedThumb(path, dataUrl as string);
          mediaThumb.value = dataUrl as string;
        } else {
          const icon = cachedIcon(path);
          if (icon) { systemIcon.value = icon; }
          else {
            window.api?.invoke('shell:getFileIcon', path).then((icon) => {
              if (icon) { setCachedIcon(path, icon as string); systemIcon.value = icon as string; }
            }).catch((err) => logger.error('Thumbnail', 'getFileIcon (fallback)', err));
          }
        }
      }).catch((err) => {
        logger.error('Thumbnail', 'getThumbnail', err);
        const icon = cachedIcon(path);
        if (icon) { systemIcon.value = icon; }
        else {
          window.api?.invoke('shell:getFileIcon', path).then((icon) => {
            if (icon) { setCachedIcon(path, icon as string); systemIcon.value = icon as string; }
          }).catch((err) => logger.error('Thumbnail', 'getFileIcon (error fallback)', err));
        }
      }).finally(() => { thumbTaskDone(); });
    });
    processThumbQueue();
  });

  return { rootEl, systemIcon, mediaThumb };
}
