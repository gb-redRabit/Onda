<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderOpen,
  Layers,
  Plus,
  Square,
  Trash2,
  Video
} from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import type {
  MediaConvertProgress,
  VideoClipAudio,
  VideoClipContainer,
  VideoClipMode,
  VideoConcatRequest
} from '@shared/types/tools';

type ConcatStatus = 'idle' | 'exporting' | 'done' | 'error' | 'canceled';

const VIDEO_EXTS = new Set(['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts']);

const { t } = useI18n();
const { sendToMain } = useToolBridge();
const files = ref<string[]>([]);
const outputDir = ref('');
const container = ref<VideoClipContainer>('mp4');
const mode = ref<VideoClipMode>('copy');
const audio = ref<VideoClipAudio>('keep');
const status = ref<ConcatStatus>('idle');
const progress = ref(0);
const speed = ref('');
const error = ref('');
const outputPath = ref('');
const busy = ref(false);
let currentJobId = '';
let offProgress: (() => void) | null = null;

const canConcat = computed(() => files.value.length >= 2 && !busy.value);
const copyHint = computed(() =>
  mode.value === 'copy' ? t('tools.concatCopyHint') : t('tools.concatExactHint')
);

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function extensionOf(path: string): string {
  const name = fileName(path);
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function addFiles(paths: string[]): void {
  const next = new Set(files.value);
  for (const path of paths) {
    if (VIDEO_EXTS.has(extensionOf(path))) next.add(path);
  }
  files.value = [...next];
  status.value = 'idle';
  error.value = '';
  outputPath.value = '';
}

async function pickFiles(): Promise<void> {
  if (busy.value) return;
  const result = (await window.api.invoke('dialog:openFile', {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: t('tools.video'), extensions: [...VIDEO_EXTS] }]
  })) as { canceled: boolean; filePaths: string[] };
  if (!result.canceled) addFiles(result.filePaths);
}

function onDrop(event: DragEvent): void {
  if (busy.value) return;
  addFiles(getDroppedFilePaths(event.dataTransfer));
}

function removeFile(index: number): void {
  if (busy.value) return;
  files.value = files.value.filter((_, i) => i !== index);
}

function moveFile(index: number, direction: -1 | 1): void {
  if (busy.value) return;
  const target = index + direction;
  if (target < 0 || target >= files.value.length) return;
  const next = [...files.value];
  [next[index], next[target]] = [next[target], next[index]];
  files.value = next;
}

function clearFiles(): void {
  if (busy.value) return;
  files.value = [];
  status.value = 'idle';
  error.value = '';
  outputPath.value = '';
}

async function pickOutputDir(): Promise<void> {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

async function startConcat(): Promise<void> {
  if (!canConcat.value) return;
  busy.value = true;
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

  const request: VideoConcatRequest = {
    jobId: currentJobId,
    inputPaths: [...files.value],
    outputDir: outputDir.value.trim() || undefined,
    container: container.value,
    mode: mode.value,
    audio: audio.value
  };

  try {
    const result = await window.api.concatVideos(request);
    if (result.canceled) {
      status.value = 'canceled';
    } else if (result.success) {
      status.value = 'done';
      progress.value = 100;
      outputPath.value = result.outputPath ?? '';
      void sendToMain('concat-complete', {
        name: fileName(files.value[0] ?? ''),
        outputPath: result.outputPath
      });
    } else {
      status.value = 'error';
      error.value = result.error || t('tools.concatFailed');
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

function cancelConcat(): void {
  if (!busy.value || !currentJobId) return;
  void window.api.cancelVideoConcat(currentJobId);
}

function openOutput(): void {
  if (outputPath.value) void window.api.invoke('shell:showItemInFolder', outputPath.value);
}

onBeforeUnmount(() => {
  offProgress?.();
  offProgress = null;
});
</script>

<template>
  <ToolWindowShell :title="t('tools.videoConcatTitle')" :icon="Layers">
    <div
      data-testid="concat-view"
      class="flex h-full flex-col gap-4 overflow-auto p-4"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <section class="rounded-box border border-base-300 bg-base-100/70 p-4">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-semibold">
            {{ t('tools.concatFiles') }}
            <span class="ml-1 text-xs font-normal text-base-content/50">
              {{ t('tools.fileCount', { count: files.length }) }}
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              data-testid="concat-add"
              class="fx-noise flex items-center gap-1 rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
              :disabled="busy"
              @click="pickFiles"
            >
              <Plus :size="12" />
              {{ t('tools.addFiles') }}
            </button>
            <button
              class="fx-noise rounded-field border border-base-300 px-2.5 py-1.5 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
              :disabled="busy || files.length === 0"
              @click="clearFiles"
            >
              {{ t('tools.clear') }}
            </button>
          </div>
        </div>

        <EmptyState
          v-if="files.length === 0"
          class="mt-4"
          :title="t('tools.concatEmpty')"
          :description="t('tools.concatDropHint')"
          :icon="Video"
        />

        <div v-else data-testid="concat-list" class="mt-3 space-y-1.5">
          <div
            v-for="(path, index) in files"
            :key="path"
            data-testid="concat-item"
            class="flex items-center gap-2 rounded-field border border-base-300/70 bg-base-200/40 px-2.5 py-2"
          >
            <span class="w-5 shrink-0 text-center font-mono text-[11px] text-base-content/40">
              {{ index + 1 }}
            </span>
            <span class="min-w-0 flex-1 truncate text-xs" :title="path">{{ fileName(path) }}</span>
            <button
              class="fx-noise rounded-field p-1 text-base-content/40 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-30"
              :disabled="busy || index === 0"
              :aria-label="t('tools.concatMoveUp')"
              @click="moveFile(index, -1)"
            >
              <ChevronUp :size="12" />
            </button>
            <button
              class="fx-noise rounded-field p-1 text-base-content/40 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-30"
              :disabled="busy || index === files.length - 1"
              :aria-label="t('tools.concatMoveDown')"
              @click="moveFile(index, 1)"
            >
              <ChevronDown :size="12" />
            </button>
            <button
              class="fx-noise rounded-field p-1 text-base-content/40 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"
              :disabled="busy"
              :aria-label="t('tools.remove')"
              @click="removeFile(index)"
            >
              <Trash2 :size="12" />
            </button>
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-3">
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('tools.clipContainer') }}
          </span>
          <select
            v-model="container"
            data-testid="concat-container"
            :disabled="busy"
            class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="mp4">{{ t('tools.mp4') }}</option>
            <option value="mkv">{{ t('tools.mkv') }}</option>
            <option value="webm">{{ t('tools.webm') }}</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('tools.clipMode') }}
          </span>
          <select
            v-model="mode"
            :disabled="busy"
            class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="copy">{{ t('tools.clipModeCopy') }}</option>
            <option value="exact">{{ t('tools.clipModeExact') }}</option>
          </select>
        </label>
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('tools.clipAudio') }}
          </span>
          <select
            v-model="audio"
            :disabled="busy"
            class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="keep">{{ t('tools.clipAudioKeep') }}</option>
            <option value="mute">{{ t('tools.clipAudioMute') }}</option>
            <option value="remove">{{ t('tools.clipAudioRemove') }}</option>
          </select>
        </label>
      </section>

      <section class="rounded-box border border-base-300 bg-base-100/70 p-4">
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
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
        <p class="mt-2 text-[11px] leading-relaxed text-base-content/45">{{ copyHint }}</p>
      </section>

      <section class="flex flex-wrap items-center gap-2">
        <button
          data-testid="concat-export"
          class="fx-noise flex items-center justify-center gap-1.5 rounded-field bg-primary px-4 py-2.5 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
          :disabled="!canConcat"
          @click="startConcat"
        >
          <Layers :size="14" />
          {{ busy ? t('tools.concatExporting') : t('tools.concatExport') }}
        </button>
        <button
          v-if="busy"
          data-testid="concat-cancel"
          class="fx-noise flex items-center justify-center gap-1.5 rounded-field border border-base-300 px-3 py-2 text-xs text-base-content/70 transition-colors hover:bg-base-content/10"
          @click="cancelConcat"
        >
          <Square :size="12" />
          {{ t('tools.cancel') }}
        </button>
      </section>

      <section
        v-if="status !== 'idle'"
        data-testid="concat-job"
        :data-status="status"
        class="rounded-box border border-base-300 bg-base-100/70 px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <CheckCircle2 v-if="status === 'done'" :size="14" class="shrink-0 text-success" />
          <AlertCircle v-else-if="status === 'error'" :size="14" class="shrink-0 text-error" />
          <Square
            v-else-if="status === 'canceled'"
            :size="14"
            class="shrink-0 text-base-content/40"
          />
          <Clock v-else :size="14" class="shrink-0 text-primary-text" />
          <span class="min-w-0 flex-1 truncate text-xs">{{ t('tools.concatJob') }}</span>
          <span class="shrink-0 text-[11px] text-base-content/50">
            {{ status === 'exporting' ? t('tools.concatExporting') : t(`tools.${status}`) }}
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
        <p v-if="error" class="mt-1 text-[11px] text-error line-clamp-2" :title="error">
          {{ error }}
        </p>
      </section>
    </div>
  </ToolWindowShell>
</template>
