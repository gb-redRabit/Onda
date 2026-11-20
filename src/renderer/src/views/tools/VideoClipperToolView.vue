<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Layers, Pause, Play, Scissors, Square, Trash2, Video } from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import Spinner from '@renderer/components/ui/Spinner.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import Button from '@renderer/components/ui/Button.vue';
import ClipExportSettings from '@renderer/components/tools/clip/ClipExportSettings.vue';
import ClipJobStatus from '@renderer/components/tools/clip/ClipJobStatus.vue';
import ClipList from '@renderer/components/tools/clip/ClipList.vue';
import ClipTimeline from '@renderer/components/tools/clip/ClipTimeline.vue';
import ClipTransport from '@renderer/components/tools/clip/ClipTransport.vue';
import { CLIP_TRANSPORT_KEY } from '@renderer/components/tools/clip/clip-transport-context';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { useClipExporter } from '@renderer/composables/useClipExporter';
import { CLIP_TIMELINE_KEY, useClipTimeline } from '@renderer/composables/useClipTimeline';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import { filesForTool, toolContextPaths } from '@shared/tool-input';
import { VIDEO_TOOL_EXTS } from '@shared/types/tools';
import { toMediaServerUrl } from '@renderer/utils/mediaUrl';
import { extensionOf } from '@renderer/utils/videoClipper';

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

// Toolbar dostaje uchwyty, a nie refy do zapisu — dziecko tylko woła handlery.
provide(CLIP_TRANSPORT_KEY, {
  busy,
  duration,
  isPlaying,
  startSec,
  endSec,
  addClip,
  toggleSnap: () => {
    snapEnabled.value = !snapEnabled.value;
  },
  toggleFollow: () => {
    followPlayhead.value = !followPlayhead.value;
  },
  togglePlay,
  seekBy,
  seekByFrames,
  snapEnabled,
  loopRange,
  toggleLoop,
  setStart,
  setEnd,
  previewing,
  previewClip,
  clipDuration,
  followPlayhead,
  fitAll,
  fitSelection,
  fitSecond,
  timelineZoom,
  zoomBy,
  zoomLabel,
  fpsLabel,
  formatTimecode,
  resetRange
});

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
            <ClipTransport />

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
