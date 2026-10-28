import { ref, watch, onMounted, onBeforeUnmount, isRef, type Ref } from 'vue';
import {
  thumbTasks,
  cachedThumb,
  setCachedThumb,
  cachedIcon,
  setCachedIcon,
  isUsableImageDataUrl,
  processThumbQueue,
  thumbTaskDone
} from '@renderer/utils/thumbLoader';
import { logger } from '@shared/logger';

// Pojedynczy wsp�łdzielony IntersectionObserver dla każdego elementu miniatury — jeden
// obserwator zamiast jednego na wiersz.
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

type ValueOrGetter<T> = T | (() => T);

function resolveValue<T>(source: ValueOrGetter<T>): T {
  return typeof source === 'function' ? (source as () => T)() : source;
}

function resolvePath(source: ValueOrGetter<string> | Ref<string>): string {
  if (isRef(source)) return source.value;
  return resolveValue(source);
}

export function useThumbnail(
  pathSource: ValueOrGetter<string> | Ref<string>,
  isDirectorySource: ValueOrGetter<boolean>,
  isAtDrivesSource: ValueOrGetter<boolean>,
  thumbSize = 320
) {
  const systemIcon = ref<string | null>(null);
  const mediaThumb = ref<string | null>(null);
  const rootEl = ref<HTMLElement | null>(null);
  const visible = ref(false);
  let thumbFired = false;
  let requestGeneration = 0;
  let disposed = false;

  function currentPath(): string {
    return resolvePath(pathSource);
  }

  function currentIsDirectory(): boolean {
    return resolveValue(isDirectorySource);
  }

  function currentIsAtDrives(): boolean {
    return resolveValue(isAtDrivesSource);
  }

  function requestThumb(): void {
    const path = currentPath();
    if (!path || currentIsAtDrives() || currentIsDirectory() || thumbFired) return;
    thumbFired = true;
    const generation = ++requestGeneration;

    const cached = cachedThumb(path);
    if (cached) {
      mediaThumb.value = cached;
      return;
    }

    thumbTasks.push(() => {
      if (disposed || generation !== requestGeneration) {
        thumbTaskDone();
        return;
      }
      const thumbReq = window.api?.invoke('media:getThumbnail', path, thumbSize);
      if (!thumbReq) {
        thumbTaskDone();
        return;
      }
      const applyIcon = (icon: unknown): void => {
        if (disposed || generation !== requestGeneration) return;
        if (isUsableImageDataUrl(icon as string | null | undefined)) {
          setCachedIcon(path, icon as string);
          systemIcon.value = icon as string;
        }
      };
      thumbReq
        .then((dataUrl) => {
          if (disposed || generation !== requestGeneration) return;
          if (isUsableImageDataUrl(dataUrl)) {
            setCachedThumb(path, dataUrl as string);
            mediaThumb.value = dataUrl as string;
          } else {
            const icon = cachedIcon(path);
            if (isUsableImageDataUrl(icon)) {
              systemIcon.value = icon;
            } else {
              const iconReq = window.api?.invoke('shell:getFileIcon', path);
              if (iconReq) {
                iconReq
                  .then(applyIcon)
                  .catch((err) => logger.error('Thumbnail', 'getFileIcon (fallback)', err));
              }
            }
          }
        })
        .catch((err) => {
          logger.error('Thumbnail', 'getThumbnail', err);
          if (disposed || generation !== requestGeneration) return;
          const icon = cachedIcon(path);
          if (isUsableImageDataUrl(icon)) {
            systemIcon.value = icon;
          } else {
            const iconReq = window.api?.invoke('shell:getFileIcon', path);
            if (iconReq) {
              iconReq
                .then(applyIcon)
                .catch((err2) => logger.error('Thumbnail', 'getFileIcon (error fallback)', err2));
            }
          }
        })
        .finally(() => {
          thumbTaskDone();
        });
    });
    processThumbQueue();
  }

  onMounted(() => {
    if (rootEl.value && thumbVisibilityObserver) {
      thumbVisibleCallbacks.set(rootEl.value, () => {
        visible.value = true;
      });
      thumbVisibilityObserver.observe(rootEl.value);
    }
  });

  onBeforeUnmount(() => {
    disposed = true;
    requestGeneration++;
    if (rootEl.value) {
      thumbVisibilityObserver?.unobserve(rootEl.value);
      thumbVisibleCallbacks.delete(rootEl.value);
    }
  });

  watch(visible, (isVisible) => {
    if (!isVisible) return;
    requestThumb();
  });

  // Wirtualizowane wiersze są reużywane: zmiana `path` musi wyczyścić starą
  // miniaturę i pobrać nową, zamiast zostawiać obraz poprzedniego pliku.
  watch(
    () => currentPath(),
    () => {
      mediaThumb.value = null;
      systemIcon.value = null;
      thumbFired = false;
      requestGeneration++;
      if (visible.value) requestThumb();
    }
  );

  return { rootEl, systemIcon, mediaThumb };
}
