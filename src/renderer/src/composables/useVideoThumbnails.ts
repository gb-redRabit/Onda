import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeFrameStripWindow, desiredThumbnailCount } from '@renderer/utils/videoClipper';

// Miniatury i pasek klatek osi czasu. Wydzielone z Video Clippera: cały cykl
// pobierania (tokeny anulowania, debounce, cache ostatniej liczby) jest tutaj,
// a widok tylko podaje aktualne refy.

export interface VideoThumbnailsDeps {
  videoPath: Ref<string>;
  duration: Ref<number>;
  videoFps: Ref<number>;
  timelineZoom: Ref<number>;
  timelineScrollEl: Ref<HTMLElement | null>;
  timelineEl: Ref<HTMLElement | null>;
  /** Czy przy aktualnym zoomie pasek klatek wypiera miniatury. */
  frameStripActive: () => boolean;
}

export function useVideoThumbnails(deps: VideoThumbnailsDeps) {
  const { t } = useI18n();
  const { videoPath, duration, videoFps, timelineZoom, timelineScrollEl, timelineEl } = deps;

  const thumbnails = ref<string[]>([]);
  const thumbsLoading = ref(false);
  const thumbsRefreshing = ref(false);
  const thumbsError = ref('');
  const frameStrip = ref<{ startSec: number; stepSec: number; frames: string[] } | null>(null);
  const frameStripLoading = ref(false);

  let thumbToken = 0;
  let thumbRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let lastThumbCount = 0;
  let frameStripTimer: ReturnType<typeof setTimeout> | null = null;
  let frameStripToken = 0;

  function cancelThumbnails(): void {
    thumbToken += 1;
    thumbsLoading.value = false;
    thumbsRefreshing.value = false;
    thumbsError.value = '';
    lastThumbCount = 0;
    if (thumbRefreshTimer) {
      clearTimeout(thumbRefreshTimer);
      thumbRefreshTimer = null;
    }
  }

  function currentThumbnailCount(): number {
    return desiredThumbnailCount(timelineScrollEl.value?.clientWidth || 0, timelineZoom.value);
  }

  async function requestFfmpegThumbnails(count: number, token: number): Promise<boolean> {
    if (!videoPath.value) return false;
    thumbsRefreshing.value = true;
    try {
      const result = await window.api.clipThumbnails({
        inputPath: videoPath.value,
        count
      });
      if (token !== thumbToken) return false;
      if (result.success && result.frames?.length) {
        thumbnails.value = result.frames;
        if (result.fps && result.fps > 0) videoFps.value = result.fps;
        lastThumbCount = count;
        thumbsError.value = '';
        scheduleFrameStrip();
        return true;
      }
      if (!thumbnails.value.length) {
        thumbsError.value = result.error || t('tools.clipThumbnailsUnavailable');
      }
      return false;
    } catch (error) {
      if (token === thumbToken && !thumbnails.value.length) {
        thumbsError.value = error instanceof Error ? error.message : String(error);
      }
      return false;
    } finally {
      if (token === thumbToken) {
        thumbsLoading.value = false;
        thumbsRefreshing.value = false;
      }
    }
  }

  function scheduleThumbnailRefresh(delay = 220): void {
    if (!videoPath.value || duration.value <= 0 || deps.frameStripActive()) return;
    if (thumbRefreshTimer) clearTimeout(thumbRefreshTimer);
    thumbRefreshTimer = setTimeout(() => {
      thumbRefreshTimer = null;
      if (!videoPath.value || duration.value <= 0 || deps.frameStripActive()) return;
      const count = currentThumbnailCount();
      if (count === lastThumbCount && thumbnails.value.length) return;
      thumbToken += 1;
      const token = thumbToken;
      void requestFfmpegThumbnails(count, token);
    }, delay);
  }

  function cancelFrameStrip(): void {
    frameStripToken += 1;
    frameStripLoading.value = false;
    frameStrip.value = null;
    if (frameStripTimer) {
      clearTimeout(frameStripTimer);
      frameStripTimer = null;
    }
  }

  function scheduleFrameStrip(delay = 180): void {
    if (!videoPath.value || !deps.frameStripActive()) return;
    if (frameStripTimer) clearTimeout(frameStripTimer);
    frameStripTimer = setTimeout(() => {
      frameStripTimer = null;
      void requestFrameStrip();
    }, delay);
  }

  async function requestFrameStrip(): Promise<void> {
    if (!videoPath.value || !deps.frameStripActive() || duration.value <= 0) return;
    const outer = timelineScrollEl.value;
    const el = timelineEl.value;
    if (!outer || !el || el.clientWidth <= 0) return;

    const windowInfo = computeFrameStripWindow({
      duration: duration.value,
      widthPx: el.clientWidth,
      scrollLeft: outer.scrollLeft,
      viewportWidth: outer.clientWidth,
      fps: videoFps.value
    });
    if (!windowInfo) return;

    const current = frameStrip.value;
    const frameStep = 1 / Math.max(1, videoFps.value);
    if (
      current &&
      Math.abs(current.startSec - windowInfo.start) < frameStep / 2 &&
      Math.abs(current.stepSec - windowInfo.stepSec) < 1e-4
    ) {
      return;
    }

    const token = frameStripToken + 1;
    frameStripToken = token;
    frameStripLoading.value = true;
    try {
      const result = await window.api.clipThumbnails({
        inputPath: videoPath.value,
        count: windowInfo.count,
        startSec: windowInfo.start,
        endSec: windowInfo.end
      });
      if (token !== frameStripToken) return;
      if (result.success && result.frames?.length) {
        frameStrip.value = {
          startSec: result.startSec ?? windowInfo.start,
          stepSec: result.stepSec ?? windowInfo.stepSec,
          frames: result.frames
        };
      }
    } catch {
      // Przy dużym zoomie zostaje poprzedni pasek albo widok ogólny.
    } finally {
      if (token === frameStripToken) frameStripLoading.value = false;
    }
  }

  async function generateThumbnails(): Promise<void> {
    cancelThumbnails();
    thumbnails.value = [];
    if (!videoPath.value || duration.value <= 0) return;
    thumbsLoading.value = true;
    const token = thumbToken;
    await requestFfmpegThumbnails(currentThumbnailCount(), token);
  }

  return {
    thumbnails,
    thumbsLoading,
    thumbsRefreshing,
    thumbsError,
    frameStrip,
    frameStripLoading,
    cancelThumbnails,
    cancelFrameStrip,
    scheduleThumbnailRefresh,
    scheduleFrameStrip,
    generateThumbnails,
    currentThumbnailCount
  };
}
