import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { useVideoThumbnails } from '@renderer/composables/useVideoThumbnails';
import {
  FRAME_STRIP_MIN_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  TRACK_PAD_PCT,
  TRACK_SPAN_PCT,
  ZOOM_LEVELS,
  buildTimelineTicks,
  fileNameOf,
  formatTimecode as formatTimecodeOf,
  frameStripCovers as frameStripCoversOf,
  percentageOf,
  snapTimeToTargets,
  trackPctOf
} from '@renderer/utils/videoClipper';

export type DragTarget = 'playhead' | 'start' | 'end' | null;

interface ClipTimelineOptions {
  videoPath: Ref<string>;
  videoEl: Ref<HTMLVideoElement | null>;
  timelineEl: Ref<HTMLElement | null>;
  timelineScrollEl: Ref<HTMLElement | null>;
  duration: Ref<number>;
  currentTime: Ref<number>;
  startSec: Ref<number>;
  endSec: Ref<number>;
  videoFps: Ref<number>;
  busy: Ref<boolean>;
}

/**
 * Oś czasu Video Clippera: metryki przewijania, zoom, zaznaczenie, przeciąganie
 * markerów i synchronizacja z elementem `<video>`. Widok zostaje przy ładowaniu
 * pliku i eksporcie, dzięki czemu ten kod da się testować bez montowania całego
 * narzędzia.
 */
export function useClipTimeline(options: ClipTimelineOptions) {
  const {
    videoPath,
    videoEl,
    timelineEl,
    timelineScrollEl,
    duration,
    currentTime,
    startSec,
    endSec,
    videoFps,
    busy
  } = options;

  const timelineZoom = ref(1);
  const timelineScrollLeft = ref(0);
  const timelineViewportWidth = ref(0);
  const timelineWidthPx = ref(0);
  const previewing = ref(false);
  const dragging = ref<DragTarget>(null);
  const snapEnabled = ref(true);
  const loopRange = ref(false);
  const followPlayhead = ref(true);

  const clipDuration = computed(() => Math.max(0, endSec.value - startSec.value));
  const startPct = computed(() => percentageOf(startSec.value, duration.value));
  const endPct = computed(() => percentageOf(endSec.value, duration.value));
  const currentPct = computed(() => percentageOf(currentTime.value, duration.value));
  const zoomLabel = computed(() => {
    const zoom = Math.round(timelineZoom.value * 100) / 100;
    return Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(1);
  });
  const fpsLabel = computed(() =>
    Number.isInteger(videoFps.value) ? String(videoFps.value) : videoFps.value.toFixed(2)
  );

  const frameDuration = computed(() => 1 / Math.max(1, videoFps.value));
  const timelineContentWidth = computed(() => (timelineWidthPx.value * TRACK_SPAN_PCT) / 100);
  const pixelsPerSecond = computed(() =>
    duration.value > 0 && timelineContentWidth.value > 0
      ? timelineContentWidth.value / duration.value
      : 0
  );
  const frameWidthPx = computed(() =>
    pixelsPerSecond.value > 0 ? pixelsPerSecond.value / Math.max(1, videoFps.value) : 0
  );
  const frameStripActive = computed(
    () => frameWidthPx.value >= FRAME_STRIP_MIN_PX && duration.value > 0
  );

  const {
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
    generateThumbnails
  } = useVideoThumbnails({
    videoPath,
    duration,
    videoFps,
    timelineZoom,
    timelineScrollEl,
    timelineEl,
    frameStripActive: () => frameStripActive.value
  });

  const frameStripCovers = computed(() =>
    frameStripCoversOf({
      strip: frameStrip.value,
      duration: duration.value,
      widthPx: timelineWidthPx.value,
      scrollLeft: timelineScrollLeft.value,
      viewportWidth: timelineViewportWidth.value
    })
  );

  const timelineTicks = computed(() =>
    buildTimelineTicks({
      duration: duration.value,
      widthPx: timelineWidthPx.value,
      pixelsPerSecond: pixelsPerSecond.value,
      zoom: timelineZoom.value,
      frameWidthPx: frameWidthPx.value,
      frameDuration: frameDuration.value,
      scrollLeft: timelineScrollLeft.value,
      viewportWidth: timelineViewportWidth.value
    })
  );

  function updateTimelineMetrics(): void {
    const outer = timelineScrollEl.value;
    const el = timelineEl.value;
    if (!outer || !el) return;
    timelineScrollLeft.value = outer.scrollLeft;
    timelineViewportWidth.value = outer.clientWidth;
    timelineWidthPx.value = el.clientWidth;
  }

  function onTimelineScroll(): void {
    updateTimelineMetrics();
    scheduleFrameStrip();
  }

  function trackPct(value: number): number {
    return trackPctOf(value);
  }

  function fileName(path: string): string {
    return fileNameOf(path);
  }

  function formatTimecode(seconds: number): string {
    return formatTimecodeOf(seconds, videoFps.value);
  }

  function snapTime(value: number, exclude?: DragTarget): number {
    return snapTimeToTargets(value, {
      duration: duration.value,
      fps: videoFps.value,
      enabled: snapEnabled.value,
      pixelsPerSecond: pixelsPerSecond.value,
      targets: { start: startSec.value, end: endSec.value, playhead: currentTime.value },
      exclude
    });
  }

  function onMetadata(): void {
    const value = videoEl.value?.duration;
    duration.value = Number.isFinite(value) && value !== undefined && value > 0 ? value : 0;
    startSec.value = 0;
    endSec.value = duration.value;
    currentTime.value = 0;
    void nextTick(updateTimelineMetrics);
    void generateThumbnails();
  }

  function keepPlayheadVisible(): void {
    if (!followPlayhead.value) return;
    const outer = timelineScrollEl.value;
    const el = timelineEl.value;
    if (!outer || !el) return;
    const x = (trackPct(currentPct.value) / 100) * el.clientWidth;
    const margin = Math.min(80, outer.clientWidth * 0.2);
    if (x < outer.scrollLeft + margin || x > outer.scrollLeft + outer.clientWidth - margin) {
      outer.scrollLeft = Math.max(
        0,
        Math.min(outer.scrollWidth - outer.clientWidth, x - outer.clientWidth / 2)
      );
      updateTimelineMetrics();
    }
  }

  function onTimeUpdate(): void {
    const video = videoEl.value;
    if (!video) return;
    currentTime.value = video.currentTime;
    if (
      loopRange.value &&
      !video.paused &&
      currentTime.value >= endSec.value - frameDuration.value / 2
    ) {
      video.currentTime = startSec.value;
      currentTime.value = startSec.value;
      keepPlayheadVisible();
      return;
    }
    if (previewing.value && currentTime.value >= endSec.value) {
      video.pause();
      video.currentTime = endSec.value;
      currentTime.value = endSec.value;
      previewing.value = false;
    }
    if (!video.paused) keepPlayheadVisible();
  }

  function clampRange(): void {
    if (duration.value <= 0) return;
    startSec.value = Math.min(Math.max(0, startSec.value || 0), duration.value);
    endSec.value = Math.min(Math.max(startSec.value + 0.05, endSec.value || 0), duration.value);
  }

  function seekTo(seconds: number): void {
    const video = videoEl.value;
    if (!video) return;
    const value = snapTime(Math.min(Math.max(0, seconds), duration.value || 0), 'playhead');
    video.currentTime = value;
    currentTime.value = value;
    keepPlayheadVisible();
  }

  function seekBy(delta: number): void {
    seekTo(currentTime.value + delta);
  }

  function seekByFrames(frames: number): void {
    seekBy(frames * frameDuration.value);
  }

  async function togglePlay(): Promise<void> {
    const video = videoEl.value;
    if (!video) return;
    if (video.paused) {
      previewing.value = false;
      await video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  async function previewClip(): Promise<void> {
    const video = videoEl.value;
    if (!video) return;
    clampRange();
    seekTo(startSec.value);
    previewing.value = true;
    await video.play().catch(() => {
      previewing.value = false;
    });
  }

  function setStart(): void {
    startSec.value = Math.min(
      snapTime(currentTime.value, 'start'),
      Math.max(0, endSec.value - 0.05)
    );
  }

  function setEnd(): void {
    endSec.value = Math.max(snapTime(currentTime.value, 'end'), startSec.value + 0.05);
  }

  function resetRange(): void {
    startSec.value = 0;
    endSec.value = duration.value;
    seekTo(0);
  }

  function toggleLoop(): void {
    loopRange.value = !loopRange.value;
    if (
      loopRange.value &&
      (currentTime.value < startSec.value || currentTime.value >= endSec.value)
    ) {
      seekTo(startSec.value);
    }
  }

  function fitAll(): void {
    timelineZoom.value = MIN_ZOOM;
    void nextTick(() => {
      const outer = timelineScrollEl.value;
      if (outer) outer.scrollLeft = 0;
      updateTimelineMetrics();
      scheduleThumbnailRefresh();
      scheduleFrameStrip();
    });
  }

  function fitSelection(): void {
    if (clipDuration.value <= 0) return;
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, duration.value / clipDuration.value));
    timelineZoom.value = target;
    void nextTick(() => {
      const outer = timelineScrollEl.value;
      const el = timelineEl.value;
      if (outer && el) {
        const startX = (trackPct(startPct.value) / 100) * el.clientWidth;
        outer.scrollLeft = Math.max(
          0,
          Math.min(outer.scrollWidth - outer.clientWidth, startX - outer.clientWidth * 0.04)
        );
      }
      updateTimelineMetrics();
      scheduleThumbnailRefresh();
      scheduleFrameStrip();
    });
  }

  function fitSecond(): void {
    if (duration.value <= 0) return;
    const target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, duration.value / (TRACK_SPAN_PCT / 100)));
    timelineZoom.value = target;
    void nextTick(() => {
      const outer = timelineScrollEl.value;
      const el = timelineEl.value;
      if (outer && el) {
        const x = (trackPct(currentPct.value) / 100) * el.clientWidth;
        outer.scrollLeft = Math.max(
          0,
          Math.min(outer.scrollWidth - outer.clientWidth, x - outer.clientWidth / 2)
        );
      }
      updateTimelineMetrics();
      scheduleThumbnailRefresh();
      scheduleFrameStrip();
    });
  }

  function zoomBy(direction: number, clientX?: number): void {
    const current = timelineZoom.value;
    const next =
      direction > 0
        ? (ZOOM_LEVELS.find((level) => level > current + 0.001) ?? MAX_ZOOM)
        : ([...ZOOM_LEVELS].reverse().find((level) => level < current - 0.001) ?? MIN_ZOOM);
    if (next !== current) applyZoom(next, clientX);
  }

  function applyZoom(next: number, clientX?: number): void {
    const outer = timelineScrollEl.value;
    const el = timelineEl.value;
    if (!outer || !el) return;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (Math.abs(zoom - timelineZoom.value) < 0.001) return;

    const outerRect = outer.getBoundingClientRect();
    let contentX: number;
    let viewportX: number;
    if (clientX !== undefined) {
      viewportX = Math.min(outer.clientWidth, Math.max(0, clientX - outerRect.left));
      contentX = outer.scrollLeft + viewportX;
    } else {
      const playheadContent = (trackPct(currentPct.value) / 100) * el.clientWidth;
      const playheadViewport = playheadContent - outer.scrollLeft;
      contentX = playheadContent;
      viewportX =
        playheadViewport >= 0 && playheadViewport <= outer.clientWidth
          ? playheadViewport
          : outer.clientWidth / 2;
    }
    const contentRatio = contentX / Math.max(1, el.clientWidth);

    timelineZoom.value = zoom;
    void nextTick(() => {
      const maxScroll = Math.max(0, outer.scrollWidth - outer.clientWidth);
      outer.scrollLeft = Math.min(
        maxScroll,
        Math.max(0, contentRatio * outer.scrollWidth - viewportX)
      );
      updateTimelineMetrics();
      scheduleThumbnailRefresh();
      scheduleFrameStrip();
    });
  }

  function onTimelineWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    applyZoom(timelineZoom.value * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX);
  }

  function onWindowResize(): void {
    updateTimelineMetrics();
    scheduleThumbnailRefresh(300);
    scheduleFrameStrip(300);
  }

  function ratioFromEvent(event: PointerEvent): number | null {
    const el = timelineEl.value;
    if (!el || duration.value <= 0) return null;
    const rect = el.getBoundingClientRect();
    const position = ((event.clientX - rect.left) / rect.width) * 100;
    return Math.min(1, Math.max(0, (position - TRACK_PAD_PCT) / TRACK_SPAN_PCT));
  }

  function applyDrag(event: PointerEvent): void {
    const ratio = ratioFromEvent(event);
    if (ratio === null) return;
    const value = snapTime(ratio * duration.value, dragging.value);
    if (dragging.value === 'start') {
      startSec.value = Math.min(value, Math.max(0, endSec.value - 0.05));
    } else if (dragging.value === 'end') {
      endSec.value = Math.max(value, Math.min(duration.value, startSec.value + 0.05));
    } else {
      previewing.value = false;
      seekTo(value);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging.value) return;
    applyDrag(event);
  }

  function endDrag(): void {
    dragging.value = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  }

  function beginDrag(target: DragTarget, event: PointerEvent): void {
    if (busy.value || duration.value <= 0) return;
    event.preventDefault();
    dragging.value = target;
    applyDrag(event);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
  }

  function onTimelinePointerDown(event: PointerEvent): void {
    beginDrag('playhead', event);
  }

  function beginMarkerDrag(target: 'start' | 'end', event: PointerEvent): void {
    beginDrag(target, event);
  }

  // Nowe wideo unieważnia metryki osi; widok woła to z `loadVideo`.
  function onDurationReset(): void {
    timelineScrollLeft.value = 0;
    timelineWidthPx.value = 0;
    timelineViewportWidth.value = 0;
    previewing.value = false;
  }

  watch(duration, () => {
    void nextTick(updateTimelineMetrics);
  });

  return {
    timelineZoom,
    timelineScrollLeft,
    timelineViewportWidth,
    timelineWidthPx,
    previewing,
    dragging,
    snapEnabled,
    loopRange,
    followPlayhead,
    clipDuration,
    startPct,
    endPct,
    currentPct,
    zoomLabel,
    fpsLabel,
    frameDuration,
    frameStripActive,
    thumbnails,
    thumbsLoading,
    thumbsRefreshing,
    thumbsError,
    frameStrip,
    frameStripLoading,
    frameStripCovers,
    timelineTicks,
    updateTimelineMetrics,
    onTimelineScroll,
    trackPct,
    fileName,
    formatTimecode,
    snapTime,
    onMetadata,
    onTimeUpdate,
    keepPlayheadVisible,
    clampRange,
    seekTo,
    seekBy,
    seekByFrames,
    togglePlay,
    previewClip,
    setStart,
    setEnd,
    resetRange,
    toggleLoop,
    fitAll,
    fitSelection,
    fitSecond,
    zoomBy,
    applyZoom,
    onTimelineWheel,
    onWindowResize,
    ratioFromEvent,
    applyDrag,
    onPointerMove,
    endDrag,
    beginDrag,
    onTimelinePointerDown,
    beginMarkerDrag,
    onDurationReset,
    cancelThumbnails,
    cancelFrameStrip,
    scheduleThumbnailRefresh,
    scheduleFrameStrip,
    generateThumbnails
  };
}
