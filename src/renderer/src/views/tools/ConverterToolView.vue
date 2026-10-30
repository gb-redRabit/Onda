<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Music,
  Plus,
  Square,
  Trash2,
  Video,
  Wrench
} from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import type {
  MediaConvertProgress,
  MediaConvertRequest,
  ToolAudioFormat,
  ToolMediaKind,
  ToolVideoContainer,
  ToolVideoQuality
} from '@shared/types/tools';

type JobStatus = 'pending' | 'converting' | 'done' | 'error' | 'canceled';

interface ConvertJob {
  id: string;
  path: string;
  name: string;
  status: JobStatus;
  progress: number;
  speed?: string;
  outputPath?: string;
  error?: string;
}

const AUDIO_EXTS = new Set(['mp3', 'flac', 'wav', 'ogg', 'opus', 'aac', 'm4a', 'wma']);
const VIDEO_EXTS = new Set(['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts']);

const { t } = useI18n();
const { sendToMain } = useToolBridge();
const kind = ref<ToolMediaKind>('audio');
const files = ref<string[]>([]);
const jobs = ref<ConvertJob[]>([]);
const outputDir = ref('');
const audioFormat = ref<ToolAudioFormat>('mp3');
const audioBitrate = ref(192);
const videoContainer = ref<ToolVideoContainer>('mp4');
const videoQuality = ref<ToolVideoQuality>('medium');
const busy = ref(false);
const cancelRequested = ref(false);
const currentJobId = ref('');
let offProgress: (() => void) | null = null;

const bitrateDisabled = computed(
  () => kind.value === 'audio' && (audioFormat.value === 'flac' || audioFormat.value === 'wav')
);

watch(kind, () => {
  if (busy.value) return;
  files.value = [];
  jobs.value = [];
});

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function extensionOf(path: string): string {
  const name = fileName(path);
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function accepts(path: string): boolean {
  const ext = extensionOf(path);
  return kind.value === 'audio' ? AUDIO_EXTS.has(ext) : VIDEO_EXTS.has(ext);
}

function addFiles(paths: string[]): void {
  const next = new Set(files.value);
  for (const path of paths) {
    if (accepts(path)) next.add(path);
  }
  files.value = [...next];
}

async function pickFiles(): Promise<void> {
  if (busy.value) return;
  const filters =
    kind.value === 'audio'
      ? [{ name: t('tools.audio'), extensions: [...AUDIO_EXTS] }]
      : [{ name: t('tools.video'), extensions: [...VIDEO_EXTS] }];
  const result = (await window.api.invoke('dialog:openFile', {
    properties: ['openFile', 'multiSelections'],
    filters
  })) as { canceled: boolean; filePaths: string[] };
  if (!result.canceled) addFiles(result.filePaths);
}

function onDrop(event: DragEvent): void {
  if (busy.value) return;
  addFiles(getDroppedFilePaths(event.dataTransfer));
}

async function pickOutputDir(): Promise<void> {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

function removeFile(path: string): void {
  if (busy.value) return;
  files.value = files.value.filter((p) => p !== path);
}

function clearFiles(): void {
  if (busy.value) return;
  files.value = [];
  jobs.value = [];
}

function statusLabel(status: JobStatus): string {
  return t(`tools.${status}`);
}

function fileCountLabel(count: number): string {
  const key =
    count === 1
      ? 'tools.fileCountOne'
      : count >= 2 && count <= 4
        ? 'tools.fileCountFew'
        : 'tools.fileCountMany';
  return t(key, { count });
}

function startConvert(): void {
  if (busy.value || files.value.length === 0) return;
  busy.value = true;
  cancelRequested.value = false;
  jobs.value = files.value.map((path) => ({
    id: crypto.randomUUID(),
    path,
    name: fileName(path),
    status: 'pending',
    progress: 0
  }));

  offProgress?.();
  offProgress = window.api.on('tools:progress', (payload) => {
    const progress = payload as MediaConvertProgress;
    const job = jobs.value.find((j) => j.id === progress.jobId);
    if (!job) return;
    if (progress.percent >= 0) job.progress = progress.percent;
    if (progress.speed) job.speed = progress.speed;
  });

  void runQueue();
}

async function runQueue(): Promise<void> {
  try {
    for (const job of jobs.value) {
      if (cancelRequested.value) {
        job.status = 'canceled';
        continue;
      }
      currentJobId.value = job.id;
      job.status = 'converting';
      job.progress = 0;
      const request: MediaConvertRequest = {
        jobId: job.id,
        kind: kind.value,
        inputPath: job.path,
        outputDir: outputDir.value.trim() || undefined,
        ...(kind.value === 'audio'
          ? { audioFormat: audioFormat.value, audioBitrate: audioBitrate.value }
          : { videoContainer: videoContainer.value, videoQuality: videoQuality.value })
      };
      try {
        const result = await window.api.convertMedia(request);
        if (result.canceled) {
          job.status = 'canceled';
          cancelRequested.value = true;
        } else if (result.success) {
          job.status = 'done';
          job.progress = 100;
          job.outputPath = result.outputPath;
          void sendToMain('conversion-complete', {
            name: job.name,
            outputPath: result.outputPath
          });
        } else {
          job.status = 'error';
          job.error = result.error || t('tools.convertFailed');
        }
      } catch (error) {
        job.status = 'error';
        job.error = error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    offProgress?.();
    offProgress = null;
    currentJobId.value = '';
    busy.value = false;
  }
}

function cancelConvert(): void {
  cancelRequested.value = true;
  if (currentJobId.value) void window.api.cancelMediaConvert(currentJobId.value);
}

function openOutput(path?: string): void {
  if (path) void window.api.invoke('shell:showItemInFolder', path);
}

onBeforeUnmount(() => {
  offProgress?.();
  offProgress = null;
});
</script>

<template>
  <ToolWindowShell :title="t('tools.converterTitle')" :icon="Wrench">
    <div data-testid="tools-converter-view" class="flex h-full flex-col">
      <div class="flex-1 overflow-auto p-4 space-y-4">
        <div class="inline-flex rounded-field border border-base-300 bg-base-100 p-1">
          <button
            data-testid="tools-kind-audio"
            class="flex items-center gap-1.5 rounded-field px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="kind === 'audio' ? 'bg-primary text-primary-content' : 'text-base-content/60'"
            :disabled="busy"
            @click="kind = 'audio'"
          >
            <Music :size="13" />
            {{ t('tools.audio') }}
          </button>
          <button
            data-testid="tools-kind-video"
            class="flex items-center gap-1.5 rounded-field px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :class="kind === 'video' ? 'bg-primary text-primary-content' : 'text-base-content/60'"
            :disabled="busy"
            @click="kind = 'video'"
          >
            <Video :size="13" />
            {{ t('tools.video') }}
          </button>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            class="flex min-h-64 flex-col rounded-box border border-base-300 bg-base-100/70 p-4"
            @dragover.prevent
            @drop.prevent="onDrop"
          >
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold">
                {{ t('tools.addFiles') }}
                <span class="ml-1 text-xs font-normal text-base-content/50">
                  {{ fileCountLabel(files.length) }}
                </span>
              </div>
              <div class="flex items-center gap-1.5">
                <button
                  data-testid="tools-add-files"
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
              :title="t('tools.empty')"
              :description="t('tools.dropHint')"
              :icon="kind === 'audio' ? Music : Video"
            />

            <div v-else class="mt-3 space-y-1.5">
              <div
                v-for="path in files"
                :key="path"
                class="flex items-center gap-2 rounded-field border border-base-300/70 bg-base-200/40 px-2.5 py-2"
              >
                <component
                  :is="kind === 'audio' ? Music : Video"
                  :size="14"
                  class="shrink-0 text-primary-text"
                />
                <span class="min-w-0 flex-1 truncate text-xs" :title="path">{{
                  fileName(path)
                }}</span>
                <button
                  class="fx-noise rounded-field p-1 text-base-content/40 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"
                  :title="t('tools.remove')"
                  :aria-label="t('tools.remove')"
                  :disabled="busy"
                  @click="removeFile(path)"
                >
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>
          </section>

          <aside class="space-y-4">
            <section class="rounded-box border border-base-300 bg-base-100/70 p-4 space-y-3">
              <label v-if="kind === 'audio'" class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.audioFormat') }}
                </span>
                <select
                  v-model="audioFormat"
                  :disabled="busy"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option value="mp3">MP3</option>
                  <option value="flac">FLAC</option>
                  <option value="wav">WAV</option>
                  <option value="ogg">OGG</option>
                  <option value="opus">OPUS</option>
                  <option value="aac">AAC</option>
                  <option value="m4a">M4A</option>
                </select>
              </label>

              <label v-if="kind === 'audio'" class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.bitrate') }}
                </span>
                <select
                  v-model.number="audioBitrate"
                  :disabled="busy || bitrateDisabled"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option :value="128">{{ t('tools.bitrateOption', { value: 128 }) }}</option>
                  <option :value="192">{{ t('tools.bitrateOption', { value: 192 }) }}</option>
                  <option :value="256">{{ t('tools.bitrateOption', { value: 256 }) }}</option>
                  <option :value="320">{{ t('tools.bitrateOption', { value: 320 }) }}</option>
                </select>
              </label>

              <label v-if="kind === 'video'" class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.videoFormat') }}
                </span>
                <select
                  v-model="videoContainer"
                  data-testid="tools-video-format"
                  :disabled="busy"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option value="mp4">{{ t('tools.mp4') }}</option>
                  <option value="mkv">{{ t('tools.mkv') }}</option>
                  <option value="webm">{{ t('tools.webm') }}</option>
                </select>
              </label>

              <label v-if="kind === 'video'" class="block">
                <span class="text-2xs font-medium text-base-content/60">
                  {{ t('tools.quality') }}
                </span>
                <select
                  v-model="videoQuality"
                  :disabled="busy"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                >
                  <option value="high">{{ t('tools.qualityHigh') }}</option>
                  <option value="medium">{{ t('tools.qualityMedium') }}</option>
                  <option value="low">{{ t('tools.qualityLow') }}</option>
                </select>
              </label>

              <label class="block">
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
            </section>

            <section class="rounded-box border border-base-300 bg-base-100/70 p-4 space-y-2">
              <button
                data-testid="tools-convert"
                class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field bg-primary px-3 py-2.5 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
                :disabled="busy || files.length === 0"
                @click="startConvert"
              >
                <Wrench :size="14" />
                {{ busy ? t('tools.converting') : t('tools.convert') }}
              </button>
              <button
                v-if="busy"
                class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field border border-base-300 px-3 py-2 text-xs text-base-content/70 transition-colors hover:bg-base-content/10"
                @click="cancelConvert"
              >
                <Square :size="12" />
                {{ t('tools.cancel') }}
              </button>
            </section>
          </aside>
        </div>

        <section v-if="jobs.length" class="space-y-1.5">
          <div class="text-xs font-semibold uppercase tracking-wider text-base-content/50">
            {{ t('tools.converted') }}
          </div>
          <div
            v-for="job in jobs"
            :key="job.id"
            :data-testid="`tools-job-${job.status}`"
            class="rounded-box border border-base-300 bg-base-100/70 px-3 py-2"
          >
            <div class="flex items-center gap-2">
              <CheckCircle2 v-if="job.status === 'done'" :size="14" class="shrink-0 text-success" />
              <AlertCircle
                v-else-if="job.status === 'error'"
                :size="14"
                class="shrink-0 text-error"
              />
              <Square
                v-else-if="job.status === 'canceled'"
                :size="14"
                class="shrink-0 text-base-content/40"
              />
              <Clock v-else :size="14" class="shrink-0 text-primary-text" />
              <span class="min-w-0 flex-1 truncate text-xs">{{ job.name }}</span>
              <span class="shrink-0 text-2xs text-base-content/50">
                {{ statusLabel(job.status) }}
                <template v-if="job.status === 'converting'">
                  {{ t('tools.progress', { percent: Math.round(job.progress) }) }}
                  <template v-if="job.speed"> · {{ job.speed }}</template>
                </template>
              </span>
              <button
                v-if="job.outputPath"
                class="fx-noise shrink-0 rounded-field p-1 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
                :title="t('tools.openOutput')"
                :aria-label="t('tools.openOutput')"
                @click="openOutput(job.outputPath)"
              >
                <FolderOpen :size="12" />
              </button>
            </div>
            <div
              v-if="job.status === 'converting'"
              class="mt-1.5 h-1 overflow-hidden rounded-full bg-base-300"
            >
              <div
                class="h-full rounded-full bg-primary transition-[width] duration-300"
                :style="{ width: `${Math.max(2, Math.min(100, job.progress))}%` }"
              />
            </div>
            <p v-if="job.error" class="mt-1 text-2xs text-error line-clamp-2" :title="job.error">
              {{ job.error }}
            </p>
          </div>
        </section>
      </div>
    </div>
  </ToolWindowShell>
</template>
