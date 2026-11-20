<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
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
import Spinner from '@renderer/components/ui/Spinner.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import Button from '@renderer/components/ui/Button.vue';
import ClipExportSettings from '@renderer/components/tools/clip/ClipExportSettings.vue';
import ClipJobStatus from '@renderer/components/tools/clip/ClipJobStatus.vue';
import ClipList from '@renderer/components/tools/clip/ClipList.vue';
import ClipTimeline from '@renderer/components/tools/clip/ClipTimeline.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { useClipExporter } from '@renderer/composables/useClipExporter';
import { CLIP_TIMELINE_KEY, useClipTimeline } from '@renderer/composables/useClipTimeline';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { filesForTool, toolContextPaths } from '@shared/tool-input';
import { VIDEO_TOOL_EXTS } from '@shared/types/tools';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { MAX_ZOOM, MIN_ZOOM, extensionOf } from '@renderer/utils/videoClipper';

const VIDEO_EXTS = new Set<string>(VIDEO_TOOL_EXTS);

const { t } = useI18n();
const { context } = useToolBridge();
const videoEl = ref<HTMLVideoElement | null>(null);
const timelineEl = ref<HTMLElement | null>(null);
const timelineScrollEl = ref<HTMLElement | null>(null);
const videoPath = ref('');
const videoLoading = ref(false);
const duration = ref(0);
const videoFps = ref(30);
const currentTime = ref(0);
const startSec = ref(0);
const endSec = ref(0);
const isPlaying = ref(false);
const videoUrl = computed(() => (videoPath.value ? toMediaServerUrl(videoPath.value) : ''));

const {
  container,
  clipMode,
  clipFormat,
  audioMode,
  rotation,
  targetSizeMb,
  outputDir,
  status,
  progress,
  speed,
  error,
  outputPath,
  busy,
  clips,
  canExport,
  resetExportState,
  addClip,
  removeClip,
  clearClips,
  startClipList,
  startClip,
  cancelClip,
  openPath,
  openOutput,
  unsubscribeProgress
} = useClipExporter({ videoPath, duration, startSec, endSec, clampRange: () => clampRange() });

const timelineApi = useClipTimeline({
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
});

const {
  timelineZoom,
  previewing,
  snapEnabled,
  loopRange,
  followPlayhead,
  clipDuration,
  zoomLabel,
  fpsLabel,
  thumbnails,
  formatTimecode,
  onMetadata,
  onTimeUpdate,
  clampRange,
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
  onWindowResize,
  keepPlayheadVisible,
  ratioFromEvent,
  applyDrag,
  onPointerMove,
  endDrag,
  onDurationReset,
  cancelThumbnails,
  cancelFrameStrip
} = timelineApi;

// Os czasu renderuje `ClipTimeline`, który dostaje ten sam stan przez provide.
provide(CLIP_TIMELINE_KEY, { ...timelineApi, duration, timelineEl, timelineScrollEl });

// Helpery osi czasu używane w szablonie pośrednio (przez handlery) i w testach
// jednostkowych przez `wrapper.vm` — jawna referencja zapobiega TS6133.
void keepPlayheadVisible;
void ratioFromEvent;
void applyDrag;
void onPointerMove;

async function loadVideo(path: string): Promise<void> {
  videoLoading.value = path !== '';
  try {
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
    onDurationReset();
    currentTime.value = 0;
    startSec.value = 0;
    endSec.value = 0;
    resetExportState();
    isPlaying.value = false;
  } finally {
    videoLoading.value = false;
  }
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

let appliedContextKey = '';

// Nowe zaznaczenie w Eksploratorze podmienia wczytany film.
watch(
  () => context.value,
  () => {
    if (busy.value) return;
    const path = filesForTool('video-clipper', toolContextPaths(context.value))[0];
    if (!path || path === appliedContextKey) return;
    appliedContextKey = path;
    void loadVideo(path);
  },
  { immediate: true }
);

async function pickOutputDir(): Promise<void> {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
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
  unsubscribeProgress();
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
        v-if="!videoPath && !videoLoading"
        data-testid="clip-dropzone"
        class="flex min-h-72 flex-col items-center justify-center rounded-box border border-hairline bg-base-100/70 p-6"
      >
        <EmptyState
          :title="t('tools.clipEmpty')"
          :description="t('tools.clipDropHint')"
          :icon="Video"
        />
        <button
          type="button"
          data-testid="clip-pick"
          class="fx-noise mt-4 flex items-center gap-1.5 rounded-field border border-hairline px-3 py-2 text-xs transition-colors hover:bg-base-content/10"
          @click="pickVideo"
        >
          <Video :size="14" />
          {{ t('tools.clipChoose') }}
        </button>
      </section>

      <div
        v-else-if="!videoPath && videoLoading"
        class="grid min-h-72 place-items-center rounded-box border border-hairline bg-base-100/70 p-6 text-sm text-base-content/60"
      >
        <div class="flex items-center gap-2">
          <Spinner :size="18" />
          {{ t('common.loading') }}
        </div>
      </div>

      <div v-else class="flex flex-col gap-4">
        <section class="flex min-w-0 flex-col gap-3">
          <div
            class="relative h-[46vh] min-h-64 max-h-[520px] w-full overflow-hidden rounded-box border border-hairline bg-canvas"
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
              type="button"
              class="absolute inset-0 flex items-center justify-center bg-scrim/20 text-scrim-contrast/80 opacity-0 transition-opacity hover:opacity-100"
              :aria-label="isPlaying ? t('tools.clipPause') : t('tools.clipPlay')"
              @click="togglePlay"
            >
              <span class="flex h-12 w-12 items-center justify-center rounded-full bg-scrim/60">
                <Pause v-if="isPlaying" :size="22" />
                <Play v-else :size="22" />
              </span>
            </button>
            <div
              class="pointer-events-none absolute bottom-2 left-2 rounded bg-scrim/65 px-2 py-1 font-mono text-2xs text-scrim-contrast/90"
            >
              {{ formatTimecode(currentTime) }} / {{ formatTimecode(duration) }}
            </div>
            <button
              type="button"
              class="absolute right-2 top-2 flex items-center gap-1 rounded bg-scrim/60 px-2 py-1 text-2xs text-scrim-contrast/80 transition-colors hover:bg-canvas/80"
              :disabled="busy"
              @click="clearVideo"
            >
              <Trash2 :size="12" />
              {{ t('tools.clipReplace') }}
            </button>
          </div>

          <div class="rounded-box border border-hairline bg-base-100/70 p-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="clip-play"
                class="fx-noise flex h-8 w-8 items-center justify-center rounded-field border border-hairline transition-colors hover:bg-base-content/10 disabled:opacity-40"
                :disabled="busy"
                :aria-label="isPlaying ? t('tools.clipPause') : t('tools.clipPlay')"
                @click="togglePlay"
              >
                <Pause v-if="isPlaying" :size="14" />
                <Play v-else :size="14" />
              </button>
              <button
                type="button"
                class="fx-noise rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                @click="seekBy(-1)"
              >
                −1 s
              </button>
              <button
                type="button"
                class="fx-noise rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                @click="seekBy(1)"
              >
                +1 s
              </button>
              <button
                type="button"
                data-testid="clip-prev-frame"
                class="fx-noise rounded-field border border-hairline px-2 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                :title="t('tools.clipPrevFrame')"
                :aria-label="t('tools.clipPrevFrame')"
                @click="seekByFrames(-1)"
              >
                −1 f
              </button>
              <button
                type="button"
                data-testid="clip-next-frame"
                class="fx-noise rounded-field border border-hairline px-2 py-1.5 text-xs transition-colors hover:bg-base-content/10"
                :disabled="busy"
                :title="t('tools.clipNextFrame')"
                :aria-label="t('tools.clipNextFrame')"
                @click="seekByFrames(1)"
              >
                +1 f
              </button>
              <span class="mx-1 h-5 w-px bg-base-300" />
              <button
                type="button"
                data-testid="clip-snap"
                class="fx-noise rounded-field border p-1.5 transition-colors"
                :class="
                  snapEnabled
                    ? 'border-primary/50 bg-primary/10 text-primary-text'
                    : 'border-hairline text-base-content/50 hover:bg-base-content/10'
                "
                :aria-pressed="snapEnabled"
                :title="t('tools.clipSnap')"
                :aria-label="t('tools.clipSnap')"
                @click="snapEnabled = !snapEnabled"
              >
                <Magnet :size="13" />
              </button>
              <button
                type="button"
                data-testid="clip-loop"
                class="fx-noise rounded-field border p-1.5 transition-colors"
                :class="
                  loopRange
                    ? 'border-primary/50 bg-primary/10 text-primary-text'
                    : 'border-hairline text-base-content/50 hover:bg-base-content/10'
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
                type="button"
                data-testid="clip-set-start"
                class="fx-noise rounded-field border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary-text transition-colors hover:bg-primary/15"
                :disabled="busy || duration <= 0"
                @click="setStart"
              >
                {{ t('tools.clipSetStart') }}
              </button>
              <button
                type="button"
                data-testid="clip-set-end"
                class="fx-noise rounded-field border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary-text transition-colors hover:bg-primary/15"
                :disabled="busy || duration <= 0"
                @click="setEnd"
              >
                {{ t('tools.clipSetEnd') }}
              </button>
              <button
                type="button"
                data-testid="clip-preview"
                class="fx-noise rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
                :disabled="busy || duration <= 0"
                @click="previewClip"
              >
                {{ previewing ? t('tools.clipStopPreview') : t('tools.clipPreview') }}
              </button>
              <button
                type="button"
                data-testid="clip-add"
                class="fx-noise flex items-center gap-1 rounded-field border border-hairline px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
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
                  type="button"
                  data-testid="clip-follow"
                  class="fx-noise rounded-field border p-1.5 transition-colors"
                  :class="
                    followPlayhead
                      ? 'border-primary/50 bg-primary/10 text-primary-text'
                      : 'border-hairline text-base-content/50 hover:bg-base-content/10'
                  "
                  :aria-pressed="followPlayhead"
                  :title="t('tools.clipFollow')"
                  :aria-label="t('tools.clipFollow')"
                  @click="followPlayhead = !followPlayhead"
                >
                  <LocateFixed :size="13" />
                </button>
                <button
                  type="button"
                  data-testid="clip-fit"
                  class="fx-noise rounded-field border border-hairline p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
                  :disabled="busy || duration <= 0"
                  :title="t('tools.clipFit')"
                  :aria-label="t('tools.clipFit')"
                  @click="fitAll"
                >
                  <Maximize2 :size="13" />
                </button>
                <button
                  type="button"
                  data-testid="clip-fit-selection"
                  class="fx-noise rounded-field border border-hairline p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
                  :disabled="busy || clipDuration <= 0"
                  :title="t('tools.clipFitSelection')"
                  :aria-label="t('tools.clipFitSelection')"
                  @click="fitSelection"
                >
                  <Scan :size="13" />
                </button>
                <button
                  type="button"
                  data-testid="clip-fit-second"
                  class="fx-noise flex items-center gap-1 rounded-field border border-hairline px-2 py-1.5 text-2xs text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
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
                  type="button"
                  data-testid="clip-zoom-out"
                  class="fx-noise rounded-field border border-hairline px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 disabled:opacity-40"
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
                  type="button"
                  data-testid="clip-zoom-in"
                  class="fx-noise rounded-field border border-hairline px-2 py-1 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 disabled:opacity-40"
                  :disabled="busy || timelineZoom >= MAX_ZOOM"
                  :aria-label="t('tools.clipZoomIn')"
                  @click="zoomBy(1)"
                >
                  +
                </button>
                <button
                  type="button"
                  class="fx-noise rounded-field border border-hairline p-1.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
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

            <ClipTimeline />

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

          <ClipList
            :clips="clips"
            :busy="busy"
            :fps="videoFps"
            @clear="clearClips"
            @remove="removeClip"
            @open="openPath"
          />
        </section>

        <aside class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ClipExportSettings
            v-model:clip-format="clipFormat"
            v-model:clip-mode="clipMode"
            v-model:container="container"
            v-model:audio-mode="audioMode"
            v-model:rotation="rotation"
            v-model:target-size-mb="targetSizeMb"
            v-model:output-dir="outputDir"
            :busy="busy"
            @browse="pickOutputDir"
          />

          <ClipJobStatus
            :status="status"
            :progress="progress"
            :speed="speed"
            :error="error"
            :output-path="outputPath"
            @open="openOutput"
          />
        </aside>
      </div>
    </div>

    <template #footer>
      <Button v-if="busy" variant="outline" data-testid="clip-cancel" @click="cancelClip">
        <template #leading><Square :size="12" /></template>
        {{ t('tools.cancel') }}
      </Button>
      <Button
        v-if="clips.length"
        variant="outline"
        data-testid="clip-export-list"
        :disabled="busy"
        @click="startClipList"
      >
        <template #leading><Layers :size="12" /></template>
        {{ t('tools.clipExportList', { count: clips.length }) }}
      </Button>
      <Button
        variant="solid"
        data-testid="clip-export"
        :disabled="!canExport"
        :loading="busy"
        @click="startClip"
      >
        <template #leading><Scissors :size="14" /></template>
        {{ busy ? t('tools.clipExporting') : t('tools.clipExport') }}
      </Button>
    </template>
  </ToolWindowShell>
</template>
