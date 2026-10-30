<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  Layers,
  LocateFixed,
  Magnet,
  Maximize2,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Scan,
  Scissors,
  Square,
  Trash2,
  Video
} from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { useVideoThumbnails } from '@renderer/composables/useVideoThumbnails';
import {
  FRAME_STRIP_MIN_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  TRACK_PAD_PCT,
  TRACK_SPAN_PCT,
  ZOOM_LEVELS,
  buildTimelineTicks,
  extensionOf as extensionOfPath,
  fileNameOf,
  formatTimecode as formatTimecodeOf,
  frameStripCovers as frameStripCoversOf,
  percentageOf,
  snapTimeToTargets,
  trackPctOf
} from '@renderer/utils/videoClipper';
import type {
  MediaConvertProgress,
  VideoClipAudio,
  VideoClipContainer,
  VideoClipFormat,
  VideoClipMode,
  VideoClipRequest,
  VideoClipRotation
} from '@shared/types/tools';

type ClipStatus = 'idle' | 'exporting' | 'done' | 'error' | 'canceled';
type DragTarget = 'playhead' | 'start' | 'end' | null;

interface ClipItem {
  id: string;
  startSec: number;
  endSec: number;
  status: 'pending' | 'exporting' | 'done' | 'error' | 'canceled';
  outputPath?: string;
  error?: string;
}

const VIDEO_EXTS = new Set(['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts']);

const { t } = useI18n();
const { sendToMain } = useToolBridge();
const videoEl = ref<HTMLVideoElement | null>(null);
const timelineEl = ref<HTMLElement | null>(null);
const timelineScrollEl = ref<HTMLElement | null>(null);
const timelineZoom = ref(1);
const videoPath = ref('');
const duration = ref(0);
const videoFps = ref(30);
const timelineScrollLeft = ref(0);
const timelineViewportWidth = ref(0);
const timelineWidthPx = ref(0);
const currentTime = ref(0);
const startSec = ref(0);
const endSec = ref(0);
const container = ref<VideoClipContainer>('mp4');
const clipMode = ref<VideoClipMode>('copy');
const clipFormat = ref<VideoClipFormat>('video');
const audioMode = ref<VideoClipAudio>('keep');
const rotation = ref<VideoClipRotation>(0);
const targetSizeMb = ref(0);
const outputDir = ref('');
const status = ref<ClipStatus>('idle');
const progress = ref(0);
const speed = ref('');
const error = ref('');
const outputPath = ref('');
const busy = ref(false);
const isPlaying = ref(false);
const previewing = ref(false);
const dragging = ref<DragTarget>(null);
const snapEnabled = ref(true);
const loopRange = ref(false);
const followPlayhead = ref(true);
const cancelRequested = ref(false);
const clips = ref<ClipItem[]>([]);
let currentJobId = '';
let offProgress: (() => void) | null = null;

const videoUrl = computed(() => (videoPath.value ? toMediaServerUrl(videoPath.value) : ''));
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
const canExport = computed(
  () =>
    !!videoPath.value &&
    !busy.value &&
    Number.isFinite(startSec.value) &&
    Number.isFinite(endSec.value) &&
    endSec.value - startSec.value >= 0.05
);

watch([clipFormat, audioMode, rotation, targetSizeMb], () => {
  if (
    clipFormat.value === 'gif' ||
    audioMode.value === 'mute' ||
    rotation.value !== 0 ||
    targetSizeMb.value > 0
  ) {
    clipMode.value = 'exact';
  }
});

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

function extensionOf(path: string): string {
  return extensionOfPath(path);
}

async function loadVideo(path: string): Promise<void> {
  if (path) {
    try {
      await window.api.invoke('media:grantAccess', path);
    } catch {
      // Podgląd może się nie załadować, ale eksport nadal sprawdzi ścieżkę w main.
    }
  }
  cancelThumbnails();
  cancelFrameStrip();
  thumbnails.value = [];
  videoPath.value = path;
  const ext = extensionOf(path);
  container.value = ext === 'webm' || ext === 'mkv' ? 'mkv' : 'mp4';
  duration.value = 0;
  videoFps.value = 30;
  timelineScrollLeft.value = 0;
  timelineWidthPx.value = 0;
  timelineViewportWidth.value = 0;
  currentTime.value = 0;
  startSec.value = 0;
  endSec.value = 0;
  status.value = 'idle';
  progress.value = 0;
  speed.value = '';
  error.value = '';
  outputPath.value = '';
  previewing.value = false;
  isPlaying.value = false;
}

async function pickVideo(): Promise<void> {
  if (busy.value) return;
  const result = (await window.api.invoke('dialog:openFile', {
    properties: ['openFile'],
    filters: [{ name: t('tools.video'), extensions: [...VIDEO_EXTS] }]
  })) as { canceled: boolean; filePaths: string[] };
  if (!result.canceled && result.filePaths[0]) await loadVideo(result.filePaths[0]);
}

function onDrop(event: DragEvent): void {
  if (busy.value) return;
  const path = getDroppedFilePaths(event.dataTransfer).find((candidate) =>
    VIDEO_EXTS.has(extensionOf(candidate))
  );
  if (path) void loadVideo(path);
}

function clearVideo(): void {
  if (busy.value) return;
  videoEl.value?.pause();
  void loadVideo('');
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
  startSec.value = Math.min(snapTime(currentTime.value, 'start'), Math.max(0, endSec.value - 0.05));
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

function addClip(): void {
  if (busy.value || duration.value <= 0) return;
  clampRange();
  if (endSec.value - startSec.value < 0.05) return;
  clips.value.push({
    id: crypto.randomUUID(),
    startSec: startSec.value,
    endSec: endSec.value,
    status: 'pending'
  });
}

function removeClip(id: string): void {
  if (busy.value) return;
  clips.value = clips.value.filter((clip) => clip.id !== id);
}

function clearClips(): void {
  if (busy.value) return;
  clips.value = [];
}

function requestFor(jobId: string, start: number, end: number): VideoClipRequest {
  return {
    jobId,
    inputPath: videoPath.value,
    outputDir: outputDir.value.trim() || undefined,
    startSec: start,
    endSec: end,
    container: container.value,
    mode: clipMode.value,
    format: clipFormat.value,
    audio: audioMode.value,
    rotation: rotation.value,
    targetSizeMb: targetSizeMb.value || undefined
  };
}

async function startClipList(): Promise<void> {
  if (busy.value || clips.value.length === 0) return;
  busy.value = true;
  cancelRequested.value = false;
  status.value = 'exporting';
  progress.value = 0;
  speed.value = '';
  error.value = '';
  outputPath.value = '';

  for (const clip of clips.value) {
    clip.status = 'pending';
    clip.error = undefined;
    clip.outputPath = undefined;
  }

  offProgress?.();
  offProgress = window.api.on('tools:progress', (payload) => {
    const update = payload as MediaConvertProgress;
    if (update.jobId !== currentJobId) return;
    if (update.percent >= 0) progress.value = update.percent;
    if (update.speed) speed.value = update.speed;
  });

  try {
    for (const clip of clips.value) {
      if (cancelRequested.value) {
        clip.status = 'canceled';
        continue;
      }
      currentJobId = crypto.randomUUID();
      clip.status = 'exporting';
      progress.value = 0;
      try {
        const result = await window.api.clipVideo(
          requestFor(currentJobId, clip.startSec, clip.endSec)
        );
        if (result.canceled) {
          clip.status = 'canceled';
          cancelRequested.value = true;
        } else if (result.success) {
          clip.status = 'done';
          clip.outputPath = result.outputPath;
          outputPath.value = result.outputPath ?? '';
        } else {
          clip.status = 'error';
          clip.error = result.error || t('tools.clipFailed');
          error.value = clip.error;
        }
      } catch (e) {
        clip.status = 'error';
        clip.error = e instanceof Error ? e.message : String(e);
        error.value = clip.error;
      }
    }

    const done = clips.value.filter((clip) => clip.status === 'done').length;
    if (done > 0) {
      void sendToMain('clip-complete', {
        name: t('tools.clipListComplete', { count: done }),
        outputPath: outputPath.value
      });
    }
    if (clips.value.some((clip) => clip.status === 'canceled')) {
      status.value = 'canceled';
    } else if (clips.value.some((clip) => clip.status === 'error')) {
      status.value = 'error';
      error.value =
        clips.value.find((clip) => clip.status === 'error')?.error || t('tools.clipFailed');
    } else {
      status.value = 'done';
      progress.value = 100;
    }
  } finally {
    busy.value = false;
    currentJobId = '';
    offProgress?.();
    offProgress = null;
  }
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

async function pickOutputDir(): Promise<void> {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

async function startClip(): Promise<void> {
  if (!canExport.value) return;
  clampRange();
  if (endSec.value - startSec.value < 0.05) {
    error.value = t('tools.clipInvalidRange');
    return;
  }

  busy.value = true;
  cancelRequested.value = false;
  status.value = 'exporting';
  progress.value = 0;
  speed.value = '';
  error.value = '';
  outputPath.value = '';
  currentJobId = crypto.randomUUID();

  offProgress?.();
  offProgress = window.api.on('tools:progress', (payload) => {
    const update = payload as MediaConvertProgress;
    if (update.jobId !== currentJobId) return;
    if (update.percent >= 0) progress.value = update.percent;
    if (update.speed) speed.value = update.speed;
  });

  const request: VideoClipRequest = {
    jobId: currentJobId,
    inputPath: videoPath.value,
    outputDir: outputDir.value.trim() || undefined,
    startSec: startSec.value,
    endSec: endSec.value,
    container: container.value,
    mode: clipMode.value,
    format: clipFormat.value,
    audio: audioMode.value,
    rotation: rotation.value,
    targetSizeMb: targetSizeMb.value || undefined
  };

  try {
    const result = await window.api.clipVideo(request);
    if (result.canceled) {
      status.value = 'canceled';
    } else if (result.success) {
      status.value = 'done';
      progress.value = 100;
      outputPath.value = result.outputPath ?? '';
      void sendToMain('clip-complete', {
        name: fileName(videoPath.value),
        outputPath: result.outputPath
      });
    } else {
      status.value = 'error';
      error.value = result.error || t('tools.clipFailed');
    }
  } catch (e) {
    status.value = 'error';
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
    offProgress?.();
    offProgress = null;
  }
}

function cancelClip(): void {
  cancelRequested.value = true;
  if (!busy.value || !currentJobId) return;
  void window.api.cancelVideoClip(currentJobId);
}

function openPath(path?: string): void {
  if (path) void window.api.invoke('shell:showItemInFolder', path);
}

function openOutput(): void {
  openPath(outputPath.value);
}

function onGlobalKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    void togglePlay();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    if (event.altKey) {
      seekByFrames(direction * (event.shiftKey ? 10 : 1));
    } else {
      seekBy(direction);
    }
  } else if (event.key === '[') {
    event.preventDefault();
    setStart();
  } else if (event.key === ']') {
    event.preventDefault();
    setEnd();
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'i') {
    event.preventDefault();
    setStart();
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    setEnd();
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoomBy(1);
  } else if (event.key === '-' || event.key === '_') {
    event.preventDefault();
    zoomBy(-1);
  }
}

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('resize', onWindowResize);
  endDrag();
  cancelThumbnails();
  cancelFrameStrip();
  offProgress?.();
  offProgress = null;
  videoEl.value?.pause();
});
</script>

<template>
  <ToolWindowShell :title="t('tools.videoClipperTitle')" :icon="Scissors">
    <div
      data-testid="clip-view"
      class="flex h-full flex-col overflow-auto p-4"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <section
        v-if="!videoPath"
        data-testid="clip-dropzone"
        class="flex min-h-72 flex-col items-center justify-center rounded-box border border-base-300 bg-base-100/70 p-6"
      >
        <EmptyState
          :title="t('tools.clipEmpty')"
          :description="t('tools.clipDropHint')"
          :icon="Video"
        />
        <button
          data-testid="clip-pick"
          class="fx-noise mt-4 flex items-center gap-1.5 rounded-field border border-base-300 px-3 py-2 text-xs transition-colors hover:bg-base-content/10"
          @click="pickVideo"
        >
          <Video :size="14" />
          {{ t('tools.clipChoose') }}
        </button>
      </section>

      <div v-else class="flex flex-col gap-4">
        <section class="flex min-w-0 flex-col gap-3">
          <div
            class="relative h-[46vh] min-h-64 max-h-[520px] w-full overflow-hidden rounded-box border border-base-300 bg-black"
          >
            <video
              ref="videoEl"
              :src="videoUrl"
              class="h-full w-full object-contain"
              @loadedmetadata="onMetadata"
              @timeupdate="onTimeUpdate"
              @play="isPlaying = true"
              @pause="
                isPlaying = false;
                previewing = false;
              "
            />
            <button
              class="absolute inset-0 flex items-center justify-center bg-black/20 text-white/80 opacity-0 transition-opacity hover:opacity-100"
              :aria-label="isPlaying ? t('tools.clipPause') : t('tools.clipPlay')"
              @click="togglePlay"
            >
              <span class="flex h-12 w-12 items-center justify-center rounded-full bg-black/60">
                <Pause v-if="isPlaying" :size="22" />
                <Play v-else :size="22" />
              </span>
            </button>
            <div
              class="pointer-events-none absolute bottom-2 left-2 rounded bg-black/65 px-2 py-1 font-mono text-2xs text-white/90"
            >
              {{ formatTimecode(currentTime) }} / {{ formatTimecode(duration) }}
            </div>
            <button
              class="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-2xs text-white/80 transition-colors hover:bg-black/80"
              :disabled="busy"
              @click="clearVideo"
            >
              <Trash2 :size="12" />
              {{ t('tools.clipReplace') }}
            </button>
          </div>

          <div class="rounded-box border border-base-300 bg-base-100/70 p-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                data-testid="clip-play"
                class="fx-noise flex h-8 w-8 items-center justify-center rounded-field border border-base-300 transition-colors hover:bg-base-content/10 disabled:opacity-40"
                :disabled="busy"
                :aria-label="isPlaying ? t('tools.clipPause') : t('tools.clipPlay')"
                @click="togglePlay"
              >
                <Pause v-if="isPlaying" :size="14" />
                <Play v-else :size="14" />
              </button>
              <button
                class="fx-noise rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                @click="seekBy(-1)"
              >
                −1 s
              </button>
              <button
                class="fx-noise rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                @click="seekBy(1)"
              >
                +1 s
              </button>
              <button
                data-testid="clip-prev-frame"
                class="fx-noise rounded-field border border-base-300 px-2 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                :title="t('tools.clipPrevFrame')"
                :aria-label="t('tools.clipPrevFrame')"
                @click="seekByFrames(-1)"
              >
                −1 f
              </button>
              <button
                data-testid="clip-next-frame"
                class="fx-noise rounded-field border border-base-300 px-2 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                :title="t('tools.clipNextFrame')"
                :aria-label="t('tools.clipNextFrame')"
                @click="seekByFrames(1)"
              >
                +1 f
              </button>
              <span class="mx-1 h-5 w-px bg-base-300" />
              <button
                data-testid="clip-snap"
                class="fx-noise rounded-field border p-1.5 transition-colors"
                :class="
                  snapEnabled
                    ? 'border-primary/50 bg-primary/10 text-primary-text'
                    : 'border-base-300 text-base-content/50 hover:bg-base-content/10'
                "
                :aria-pressed="snapEnabled"
                :title="t('tools.clipSnap')"
                :aria-label="t('tools.clipSnap')"
                @click="snapEnabled = !snapEnabled"
              >
                <Magnet :size="13" />
              </button>
              <button
                data-testid="clip-loop"
                class="fx-noise rounded-field border p-1.5 transition-colors"
                :class="
                  loopRange
                    ? 'border-primary/50 bg-primary/10 text-primary-text'
                    : 'border-base-300 text-base-content/50 hover:bg-base-content/10'
                "
                :aria-pressed="loopRange"
                :title="t('tools.clipLoop')"
                :aria-label="t('tools.clipLoop')"
                @click="toggleLoop"
              >
                <Repeat :size="13" />
              </button>
              <span class="mx-1 h-5 w-px bg-base-300" />
              <button
                data-testid="clip-set-start"
                class="fx-noise rounded-field border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary-text transition-colors hover:bg-primary/15"
                :disabled="busy || duration <= 0"
                @click="setStart"
              >
                {{ t('tools.clipSetStart') }}
              </button>
              <button
                data-testid="clip-set-end"
                class="fx-noise rounded-field border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary-text transition-colors hover:bg-primary/15"
                :disabled="busy || duration <= 0"
                @click="setEnd"
              >
                {{ t('tools.clipSetEnd') }}
              </button>
              <button
                data-testid="clip-preview"
                class="fx-noise rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
                :disabled="busy || duration <= 0"
                @click="previewClip"
              >
                {{ previewing ? t('tools.clipStopPreview') : t('tools.clipPreview') }}
              </button>
              <button
                data-testid="clip-add"
                class="fx-noise flex items-center gap-1 rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
                :disabled="busy || clipDuration < 0.05"
                @click="addClip"
              >
                <Plus :size="12" />
                {{ t('tools.clipAddToList') }}
              </button>
              <div class="ml-auto flex items-center gap-1">
                <span class="mr-1 font-mono text-3xs text-base-content/40">
                  {{ t('tools.clipFps', { fps: fpsLabel }) }}
                </span>
                <button
                  data-testid="clip-follow"
                  class="fx-noise rounded-field border p-1.5 transition-colors"
                  :class="
                    followPlayhead
                      ? 'border-primary/50 bg-primary/10 text-primary-text'
                      : 'border-base-300 text-base-content/50 hover:bg-base-content/10'
                  "
                  :aria-pressed="followPlayhead"
                  :title="t('tools.clipFollow')"
                  :aria-label="t('tools.clipFollow')"
                  @click="followPlayhead = !followPlayhead"
                >
                  <LocateFixed :size="13" />
                </button>
                <button
                  data-testid="clip-fit"
                  class="fx-noise rounded-field border border-base-300 p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
                  :disabled="busy || duration <= 0"
                  :title="t('tools.clipFit')"
                  :aria-label="t('tools.clipFit')"
                  @click="fitAll"
                >
                  <Maximize2 :size="13" />
                </button>
                <button
                  data-testid="clip-fit-selection"
                  class="fx-noise rounded-field border border-base-300 p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
                  :disabled="busy || clipDuration <= 0"
                  :title="t('tools.clipFitSelection')"
                  :aria-label="t('tools.clipFitSelection')"
                  @click="fitSelection"
                >
                  <Scan :size="13" />
                </button>
                <button
                  data-testid="clip-fit-second"
                  class="fx-noise flex items-center gap-1 rounded-field border border-base-300 px-2 py-1.5 text-2xs text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
                  :disabled="busy || duration <= 0"
                  :title="t('tools.clipFitSecond')"
                  :aria-label="t('tools.clipFitSecond')"
                  @click="fitSecond"
                >
                  <Clock :size="12" />
                  {{ t('tools.clipFitSecondShort') }}
                </button>
                <span class="mx-1 h-5 w-px bg-base-300" />
                <button
                  data-testid="clip-zoom-out"
                  class="fx-noise rounded-field border border-base-300 px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 disabled:opacity-40"
                  :disabled="busy || timelineZoom <= MIN_ZOOM"
                  :aria-label="t('tools.clipZoomOut')"
                  @click="zoomBy(-1)"
                >
                  −
                </button>
                <span
                  data-testid="clip-zoom-label"
                  class="w-12 text-center text-3xs text-base-content/50"
                >
                  {{ zoomLabel }}×
                </span>
                <button
                  data-testid="clip-zoom-in"
                  class="fx-noise rounded-field border border-base-300 px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 disabled:opacity-40"
                  :disabled="busy || timelineZoom >= MAX_ZOOM"
                  :aria-label="t('tools.clipZoomIn')"
                  @click="zoomBy(1)"
                >
                  +
                </button>
                <button
                  class="fx-noise rounded-field border border-base-300 p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
                  :disabled="busy || duration <= 0"
                  :title="t('tools.clipReset')"
                  :aria-label="t('tools.clipReset')"
                  @click="resetRange"
                >
                  <RotateCcw :size="13" />
                </button>
              </div>
            </div>

            <div class="mt-3 flex items-center justify-between gap-2 text-2xs text-base-content/55">
              <span data-testid="clip-start-label" class="font-mono">{{
                formatTimecode(startSec)
              }}</span>
              <span class="rounded-full bg-base-300/70 px-2 py-0.5 font-medium">
                {{ t('tools.clipLength', { duration: formatTimecode(clipDuration) }) }}
              </span>
              <span data-testid="clip-end-label" class="font-mono">{{
                formatTimecode(endSec)
              }}</span>
            </div>

            <div
              ref="timelineScrollEl"
              data-testid="clip-timeline-scroll"
              class="mt-2 overflow-x-auto"
              @scroll.passive="onTimelineScroll"
              @wheel="onTimelineWheel"
            >
              <div
                ref="timelineEl"
                data-testid="clip-timeline"
                :data-duration="duration"
                :style="{ width: `${timelineZoom * 100}%` }"
                class="relative h-28 touch-none select-none rounded-field border border-base-300 bg-base-200/60"
                @pointerdown="onTimelinePointerDown"
              >
                <div
                  class="pointer-events-none absolute top-2 h-14 overflow-hidden rounded border border-base-300/50 bg-base-300/50"
                  :style="{ left: `${TRACK_PAD_PCT}%`, right: `${TRACK_PAD_PCT}%` }"
                >
                  <div
                    v-if="frameStripActive && frameStripCovers && frameStrip"
                    class="relative h-full w-full"
                  >
                    <div
                      v-for="(frame, index) in frameStrip.frames"
                      :key="index"
                      data-testid="clip-frame"
                      class="absolute inset-y-0 overflow-hidden border-r border-black/25"
                      :style="{
                        left: `${((frameStrip.startSec + index * frameStrip.stepSec) / duration) * 100}%`,
                        width: `${(frameStrip.stepSec / duration) * 100}%`
                      }"
                    >
                      <img
                        :src="frame"
                        alt=""
                        draggable="false"
                        class="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                  <div
                    v-else-if="thumbsLoading"
                    class="h-full w-full animate-pulse bg-base-content/10"
                  />
                  <div v-else-if="thumbnails.length" class="flex h-full w-full">
                    <img
                      v-for="(thumb, index) in thumbnails"
                      :key="index"
                      :src="thumb"
                      alt=""
                      draggable="false"
                      class="h-full min-w-0 flex-1 object-cover opacity-80"
                    />
                  </div>
                  <div
                    v-else
                    class="flex h-full items-center justify-center px-2 text-center text-3xs text-base-content/45"
                    :title="thumbsError"
                  >
                    {{ t('tools.clipThumbnailsUnavailable') }}
                  </div>
                  <div
                    v-if="(thumbsRefreshing || frameStripLoading) && thumbnails.length"
                    class="pointer-events-none absolute inset-0 animate-pulse bg-base-100/20"
                  />
                </div>
                <div
                  class="absolute top-[76%] h-2 -translate-y-1/2 overflow-hidden rounded-full bg-base-300"
                  :style="{ left: `${TRACK_PAD_PCT}%`, right: `${TRACK_PAD_PCT}%` }"
                >
                  <div
                    class="h-full bg-primary/35"
                    :style="{
                      marginLeft: `${startPct}%`,
                      width: `${Math.max(0, endPct - startPct)}%`
                    }"
                  />
                  <div
                    class="absolute inset-y-0 left-0 bg-primary/60"
                    :style="{ width: `${currentPct}%` }"
                  />
                </div>

                <div
                  v-for="tick in timelineTicks"
                  :key="`${tick.kind}-${tick.left}`"
                  data-testid="clip-tick"
                  :data-tick-kind="tick.kind"
                  class="pointer-events-none absolute w-px"
                  :class="
                    tick.kind === 'major'
                      ? 'inset-y-0 bg-base-content/15'
                      : tick.kind === 'minor'
                        ? 'bottom-4 h-4 bg-base-content/10'
                        : 'bottom-4 h-2 bg-base-content/10'
                  "
                  :style="{ left: `${trackPct(tick.left)}%` }"
                >
                  <span
                    v-if="tick.label"
                    class="absolute bottom-1 left-1 whitespace-nowrap font-mono text-[9px] text-base-content/45"
                  >
                    {{ tick.label }}
                  </span>
                </div>

                <div
                  class="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-error"
                  :style="{ left: `${trackPct(currentPct)}%` }"
                >
                  <span
                    class="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-error shadow"
                  />
                </div>

                <button
                  data-testid="clip-marker-start"
                  class="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
                  :style="{ left: `${trackPct(startPct)}%` }"
                  :aria-label="t('tools.clipSetStart')"
                  @pointerdown.stop.prevent="beginMarkerDrag('start', $event)"
                >
                  <span class="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-primary" />
                  <span
                    class="absolute left-1/2 top-1 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-base-100 bg-primary text-[9px] font-bold text-primary-content shadow"
                  >
                    A
                  </span>
                </button>

                <button
                  data-testid="clip-marker-end"
                  class="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize touch-none"
                  :style="{ left: `${trackPct(endPct)}%` }"
                  :aria-label="t('tools.clipSetEnd')"
                  @pointerdown.stop.prevent="beginMarkerDrag('end', $event)"
                >
                  <span class="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-primary" />
                  <span
                    class="absolute left-1/2 top-1 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-base-100 bg-primary text-[9px] font-bold text-primary-content shadow"
                  >
                    B
                  </span>
                </button>
              </div>
            </div>

            <p class="mt-2 text-2xs leading-relaxed text-base-content/45">
              {{
                clipFormat === 'gif'
                  ? t('tools.clipGifHint')
                  : clipMode === 'copy'
                    ? t('tools.clipLosslessHint')
                    : t('tools.clipExactHint')
              }}
            </p>
          </div>

          <section
            v-if="clips.length"
            data-testid="clip-list"
            class="rounded-box border border-base-300 bg-base-100/70 p-3"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="text-xs font-semibold">
                {{ t('tools.clipList', { count: clips.length }) }}
              </span>
              <button
                class="fx-noise rounded-field px-2 py-1 text-2xs text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
                :disabled="busy"
                @click="clearClips"
              >
                {{ t('tools.clipClearList') }}
              </button>
            </div>
            <div class="space-y-1">
              <div
                v-for="(clip, index) in clips"
                :key="clip.id"
                class="flex items-center gap-2 rounded-field border border-base-300/60 bg-base-200/40 px-2 py-1.5"
              >
                <span class="w-5 text-center font-mono text-3xs text-base-content/45">
                  {{ index + 1 }}
                </span>
                <span class="min-w-0 flex-1 font-mono text-2xs">
                  {{ formatTimecode(clip.startSec) }} – {{ formatTimecode(clip.endSec) }}
                </span>
                <span class="shrink-0 text-3xs text-base-content/45">
                  {{
                    clip.status === 'exporting'
                      ? t('tools.clipExporting')
                      : t(`tools.${clip.status}`)
                  }}
                </span>
                <button
                  v-if="clip.outputPath"
                  class="fx-noise shrink-0 rounded-field p-1 text-base-content/45 transition-colors hover:bg-base-content/10 hover:text-base-content"
                  :title="t('tools.openOutput')"
                  :aria-label="t('tools.openOutput')"
                  @click="openPath(clip.outputPath)"
                >
                  <FolderOpen :size="11" />
                </button>
                <button
                  class="fx-noise shrink-0 rounded-field p-1 text-base-content/40 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"
                  :disabled="busy"
                  :aria-label="t('tools.remove')"
                  @click="removeClip(clip.id)"
                >
                  <Trash2 :size="11" />
                </button>
              </div>
            </div>
          </section>
        </section>

        <aside class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section class="rounded-box border border-base-300 bg-base-100/70 p-4 lg:row-span-2">
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.clipFormat') }}
                </span>
                <select
                  v-model="clipFormat"
                  data-testid="clip-format"
                  :disabled="busy"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option value="video">{{ t('tools.clipFormatVideo') }}</option>
                  <option value="gif">{{ t('tools.clipFormatGif') }}</option>
                </select>
              </label>

              <label class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.clipMode') }}
                </span>
                <select
                  v-model="clipMode"
                  data-testid="clip-mode"
                  :disabled="busy || clipFormat === 'gif'"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option value="copy">{{ t('tools.clipModeCopy') }}</option>
                  <option value="exact">{{ t('tools.clipModeExact') }}</option>
                </select>
              </label>

              <label class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.clipContainer') }}
                </span>
                <select
                  v-model="container"
                  data-testid="clip-container"
                  :disabled="busy || clipFormat === 'gif'"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option value="mp4">{{ t('tools.mp4') }}</option>
                  <option value="mkv">{{ t('tools.mkv') }}</option>
                  <option value="webm">{{ t('tools.webm') }}</option>
                </select>
              </label>

              <label class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.clipAudio') }}
                </span>
                <select
                  v-model="audioMode"
                  data-testid="clip-audio"
                  :disabled="busy || clipFormat === 'gif'"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option value="keep">{{ t('tools.clipAudioKeep') }}</option>
                  <option value="mute">{{ t('tools.clipAudioMute') }}</option>
                  <option value="remove">{{ t('tools.clipAudioRemove') }}</option>
                </select>
              </label>

              <label class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.clipRotation') }}
                </span>
                <select
                  v-model.number="rotation"
                  data-testid="clip-rotation"
                  :disabled="busy || clipFormat === 'gif'"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option :value="0">{{ t('tools.clipRotationNone') }}</option>
                  <option :value="90">90°</option>
                  <option :value="180">180°</option>
                  <option :value="270">270°</option>
                </select>
              </label>

              <label class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.clipTargetSize') }}
                </span>
                <select
                  v-model.number="targetSizeMb"
                  data-testid="clip-target-size"
                  :disabled="busy || clipFormat === 'gif'"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option :value="0">{{ t('tools.clipTargetNone') }}</option>
                  <option :value="10">10 MB</option>
                  <option :value="25">25 MB</option>
                </select>
              </label>

              <label class="block sm:col-span-2">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.outputFolder') }}
                </span>
                <div class="mt-1 flex items-center gap-1.5">
                  <input
                    v-model="outputDir"
                    type="text"
                    :disabled="busy"
                    :placeholder="t('tools.outputDefault')"
                    class="min-w-0 flex-1 rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                  />
                  <button
                    class="fx-noise shrink-0 rounded-field border border-base-300 p-2 transition-colors hover:bg-base-content/10 disabled:opacity-40"
                    :disabled="busy"
                    :title="t('tools.chooseFolder')"
                    :aria-label="t('tools.chooseFolder')"
                    @click="pickOutputDir"
                  >
                    <FolderOpen :size="13" />
                  </button>
                </div>
              </label>
            </div>
          </section>

          <section class="rounded-box border border-base-300 bg-base-100/70 p-4 space-y-2">
            <button
              data-testid="clip-export"
              class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field bg-primary px-4 py-2.5 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
              :disabled="!canExport"
              @click="startClip"
            >
              <Scissors :size="14" />
              {{ busy ? t('tools.clipExporting') : t('tools.clipExport') }}
            </button>
            <button
              v-if="clips.length"
              data-testid="clip-export-list"
              class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field border border-base-300 px-3 py-2 text-xs text-base-content/75 transition-colors hover:bg-base-content/10 disabled:opacity-40"
              :disabled="busy"
              @click="startClipList"
            >
              <Layers :size="12" />
              {{ t('tools.clipExportList', { count: clips.length }) }}
            </button>
            <button
              v-if="busy"
              data-testid="clip-cancel"
              class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field border border-base-300 px-3 py-2 text-xs text-base-content/70 transition-colors hover:bg-base-content/10"
              @click="cancelClip"
            >
              <Square :size="12" />
              {{ t('tools.cancel') }}
            </button>
          </section>

          <section
            v-if="status !== 'idle'"
            data-testid="clip-job"
            :data-status="status"
            class="rounded-box border border-base-300 bg-base-100/70 px-3 py-2"
          >
            <div class="flex items-center gap-2">
              <CheckCircle2 v-if="status === 'done'" :size="14" class="shrink-0 text-success" />
              <Square
                v-else-if="status === 'canceled'"
                :size="14"
                class="shrink-0 text-base-content/40"
              />
              <Clock v-else :size="14" class="shrink-0 text-primary-text" />
              <span class="min-w-0 flex-1 truncate text-xs">{{ t('tools.clipJob') }}</span>
              <span class="shrink-0 text-2xs text-base-content/50">
                {{ status === 'exporting' ? t('tools.clipExporting') : t(`tools.${status}`) }}
                <template v-if="status === 'exporting'">
                  {{ t('tools.progress', { percent: Math.round(progress) }) }}
                  <template v-if="speed"> · {{ speed }}</template>
                </template>
              </span>
              <button
                v-if="outputPath"
                class="fx-noise shrink-0 rounded-field p-1 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
                :title="t('tools.openOutput')"
                :aria-label="t('tools.openOutput')"
                @click="openOutput"
              >
                <FolderOpen :size="12" />
              </button>
            </div>
            <div
              v-if="status === 'exporting'"
              class="mt-1.5 h-1 overflow-hidden rounded-full bg-base-300"
            >
              <div
                class="h-full rounded-full bg-primary transition-[width] duration-300"
                :style="{ width: `${Math.max(2, Math.min(100, progress))}%` }"
              />
            </div>
            <p v-if="error" class="mt-1 text-2xs text-error line-clamp-2" :title="error">
              {{ error }}
            </p>
          </section>
        </aside>
      </div>
    </div>
  </ToolWindowShell>
</template>
