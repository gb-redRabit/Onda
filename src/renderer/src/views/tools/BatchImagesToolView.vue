<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Image as ImageIcon,
  Play,
  Plus,
  Square,
  Trash2
} from '@lucide/vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import { useToolBridge } from '@renderer/composables/useToolBridge';
import { getDroppedFilePaths } from '@renderer/utils/fileDrag';
import {
  BATCH_IMAGES_MAX_FILES,
  IMAGE_OUTPUT_FORMATS,
  type BatchImageProgress,
  type ImageOutputFormat
} from '@shared/types/tools';

type RowStatus = 'pending' | 'processing' | 'done' | 'error' | 'canceled';

interface BatchRow {
  path: string;
  name: string;
  status: RowStatus;
  outputPath?: string;
  bytes?: number;
  error?: string;
}

const IMAGE_EXTS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'avif',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif'
];

const { t } = useI18n();
const { context } = useToolBridge();
const files = ref<BatchRow[]>([]);
const format = ref<ImageOutputFormat>('webp');
const quality = ref(85);
const maxWidth = ref(0);
const maxHeight = ref(0);
const outputDir = ref('');
const busy = ref(false);
const cancelRequested = ref(false);
const jobId = ref('');
const doneCount = ref(0);
const errorMsg = ref('');

const total = computed(() => files.value.length);
const doneRows = computed(() => files.value.filter((row) => row.status === 'done').length);
const failedRows = computed(() => files.value.filter((row) => row.status === 'error').length);
const processed = computed(() => doneRows.value + failedRows.value);

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function extensionOf(path: string): string {
  const name = fileName(path);
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function statusLabel(status: RowStatus): string {
  if (status === 'processing') return t('tools.batchImagesProcessing');
  if (status === 'pending') return t('tools.pending');
  if (status === 'done') return t('tools.done');
  if (status === 'error') return t('tools.error');
  return t('tools.canceled');
}

function addFiles(paths: string[]): void {
  if (busy.value) return;
  const existing = new Set(files.value.map((row) => row.path));
  for (const path of paths) {
    if (!IMAGE_EXTS.includes(extensionOf(path))) continue;
    if (existing.has(path)) continue;
    existing.add(path);
    files.value.push({ path, name: fileName(path), status: 'pending' });
    if (files.value.length >= BATCH_IMAGES_MAX_FILES) break;
  }
}

async function pickFiles(): Promise<void> {
  if (busy.value) return;
  const result = (await window.api.invoke('dialog:openFile', {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: t('tools.imageStudioTitle'), extensions: IMAGE_EXTS }]
  })) as { canceled: boolean; filePaths: string[] };
  if (!result.canceled) addFiles(result.filePaths);
}

function onDrop(event: DragEvent): void {
  addFiles(getDroppedFilePaths(event.dataTransfer));
}

function removeRow(path: string): void {
  if (busy.value) return;
  files.value = files.value.filter((row) => row.path !== path);
}

function clearAll(): void {
  if (busy.value) return;
  files.value = [];
  doneCount.value = 0;
  errorMsg.value = '';
}

async function pickOutputDir(): Promise<void> {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) outputDir.value = paths[0];
}

function openOutput(path?: string): void {
  if (path) void window.api.invoke('shell:showItemInFolder', path);
}

async function start(): Promise<void> {
  if (busy.value || files.value.length === 0) return;
  busy.value = true;
  cancelRequested.value = false;
  errorMsg.value = '';
  doneCount.value = 0;
  const id = crypto.randomUUID();
  jobId.value = id;
  for (const row of files.value) {
    row.status = 'pending';
    row.outputPath = undefined;
    row.bytes = undefined;
    row.error = undefined;
  }

  const off = window.api.on('tools:batchImagesProgress', (payload) => {
    const progress = payload as BatchImageProgress;
    if (progress.jobId !== id) return;
    const row = files.value.find((item) => item.path === progress.path);
    if (row) {
      row.status = progress.status;
      row.outputPath = progress.outputPath;
      row.bytes = progress.bytes;
      row.error = progress.error;
    }
    if (progress.status === 'done' || progress.status === 'error') {
      doneCount.value = Math.max(doneCount.value, progress.index + 1);
    }
  });

  try {
    const result = await window.api.batchConvertImages({
      jobId: id,
      inputPaths: files.value.map((row) => row.path),
      outputDir: outputDir.value.trim() || undefined,
      format: format.value,
      quality: quality.value,
      maxWidth: maxWidth.value || undefined,
      maxHeight: maxHeight.value || undefined
    });
    if (!result.success && result.error) errorMsg.value = result.error;
    if (result.canceled) {
      for (const row of files.value) {
        if (row.status === 'pending') row.status = 'canceled';
      }
    }
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : String(error);
  } finally {
    off();
    busy.value = false;
  }
}

function cancel(): void {
  cancelRequested.value = true;
  if (jobId.value) void window.api.cancelBatchImages(jobId.value);
}

watch(
  () => context.value,
  (ctx) => {
    const paths =
      ctx && ctx.params && Array.isArray(ctx.params.paths)
        ? ctx.params.paths.filter((path): path is string => typeof path === 'string')
        : [];
    if (paths.length > 0) addFiles(paths);
  },
  { immediate: true }
);
</script>

<template>
  <ToolWindowShell :title="t('tools.batchImagesTitle')" :icon="ImageIcon">
    <div
      data-testid="batch-images-view"
      class="flex h-full flex-col"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div class="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          class="flex min-h-0 flex-col rounded-box border border-base-300 bg-base-100/70 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-semibold">
              {{ t('tools.addFiles') }}
              <span class="ml-1 text-xs font-normal text-base-content/50">{{ total }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                data-testid="batch-images-add"
                class="fx-noise flex items-center gap-1 rounded-field border border-base-300 px-2.5 py-1.5 text-xs transition-colors hover:bg-base-content/10 disabled:opacity-40"
                :disabled="busy"
                @click="pickFiles"
              >
                <Plus :size="12" />
                {{ t('tools.addFiles') }}
              </button>
              <button
                data-testid="batch-images-clear"
                class="fx-noise rounded-field border border-base-300 px-2.5 py-1.5 text-xs text-base-content/60 transition-colors hover:bg-base-content/10 hover:text-base-content disabled:opacity-40"
                :disabled="busy || total === 0"
                @click="clearAll"
              >
                {{ t('tools.clear') }}
              </button>
            </div>
          </div>

          <EmptyState
            v-if="total === 0"
            class="mt-4"
            :title="t('tools.batchImagesEmpty')"
            :description="t('tools.batchImagesDropHint')"
            :icon="ImageIcon"
          />

          <div v-else class="mt-3 min-h-0 flex-1 space-y-1.5 overflow-auto">
            <div
              v-for="row in files"
              :key="row.path"
              :data-testid="`batch-images-row-${row.status}`"
              class="rounded-field border border-base-300/70 bg-base-200/40 px-2.5 py-2"
            >
              <div class="flex items-center gap-2">
                <CheckCircle2
                  v-if="row.status === 'done'"
                  :size="14"
                  class="shrink-0 text-success"
                />
                <AlertCircle
                  v-else-if="row.status === 'error'"
                  :size="14"
                  class="shrink-0 text-error"
                />
                <Square
                  v-else-if="row.status === 'canceled'"
                  :size="14"
                  class="shrink-0 text-base-content/40"
                />
                <Clock v-else :size="14" class="shrink-0 text-primary-text" />
                <span class="min-w-0 flex-1 truncate text-xs" :title="row.path">{{
                  row.name
                }}</span>
                <span class="shrink-0 text-[11px] text-base-content/50">
                  {{ statusLabel(row.status) }}
                  <template v-if="row.bytes"> · {{ formatBytes(row.bytes) }}</template>
                </span>
                <button
                  v-if="row.outputPath"
                  class="fx-noise shrink-0 rounded-field p-1 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
                  :title="t('tools.openOutput')"
                  :aria-label="t('tools.openOutput')"
                  @click="openOutput(row.outputPath)"
                >
                  <FolderOpen :size="12" />
                </button>
                <button
                  class="fx-noise shrink-0 rounded-field p-1 text-base-content/40 transition-colors hover:bg-error/10 hover:text-error disabled:opacity-30"
                  :title="t('tools.remove')"
                  :aria-label="t('tools.remove')"
                  :disabled="busy"
                  @click="removeRow(row.path)"
                >
                  <Trash2 :size="12" />
                </button>
              </div>
              <p
                v-if="row.error"
                class="mt-1 text-[11px] text-error line-clamp-2"
                :title="row.error"
              >
                {{ row.error }}
              </p>
            </div>
          </div>
        </section>

        <aside class="space-y-3">
          <section class="space-y-2 rounded-box border border-base-300 bg-base-100/70 p-3">
            <label class="block">
              <span class="text-[11px] font-medium text-base-content/60">
                {{ t('tools.batchImagesFormat') }}
              </span>
              <select
                v-model="format"
                data-testid="batch-images-format"
                :disabled="busy"
                class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
              >
                <option v-for="item in IMAGE_OUTPUT_FORMATS" :key="item" :value="item">
                  {{ item.toUpperCase() }}
                </option>
              </select>
            </label>

            <label v-if="format !== 'png'" class="block">
              <span class="flex justify-between text-[11px] font-medium text-base-content/60">
                <span>{{ t('tools.batchImagesQuality') }}</span>
                <span>{{ quality }}</span>
              </span>
              <input
                v-model.number="quality"
                data-testid="batch-images-quality"
                type="range"
                min="1"
                max="100"
                class="mt-1 w-full accent-primary"
              />
            </label>

            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="text-[11px] font-medium text-base-content/60">
                  {{ t('tools.batchImagesWidth') }}
                </span>
                <input
                  v-model.number="maxWidth"
                  data-testid="batch-images-width"
                  type="number"
                  min="0"
                  :disabled="busy"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                />
              </label>
              <label class="block">
                <span class="text-[11px] font-medium text-base-content/60">
                  {{ t('tools.batchImagesHeight') }}
                </span>
                <input
                  v-model.number="maxHeight"
                  data-testid="batch-images-height"
                  type="number"
                  min="0"
                  :disabled="busy"
                  class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
                />
              </label>
            </div>
            <p class="text-[10px] text-base-content/50">{{ t('tools.batchImagesResizeHint') }}</p>

            <label class="block">
              <span class="text-[11px] font-medium text-base-content/60">
                {{ t('tools.outputFolder') }}
              </span>
              <div class="mt-1 flex items-center gap-1.5">
                <input
                  v-model="outputDir"
                  data-testid="batch-images-output"
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

          <section class="space-y-2 rounded-box border border-base-300 bg-base-100/70 p-3">
            <button
              data-testid="batch-images-start"
              class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field bg-primary px-3 py-2.5 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
              :disabled="busy || total === 0"
              @click="start"
            >
              <Play :size="14" />
              {{ busy ? t('tools.batchImagesProcessing') : t('tools.batchImagesStart') }}
            </button>
            <button
              v-if="busy"
              data-testid="batch-images-cancel"
              class="fx-noise flex w-full items-center justify-center gap-1.5 rounded-field border border-base-300 px-3 py-2 text-xs text-base-content/70 transition-colors hover:bg-base-content/10"
              @click="cancel"
            >
              <Square :size="12" />
              {{ t('tools.cancel') }}
            </button>
            <p
              v-if="busy || processed > 0"
              data-testid="batch-images-progress"
              class="text-center text-[11px] text-base-content/50"
            >
              {{ processed }}/{{ total }} ·
              {{ t('tools.batchImagesSummary', { done: doneRows, failed: failedRows }) }}
            </p>
            <p v-if="errorMsg" class="text-[11px] text-error">{{ errorMsg }}</p>
          </section>
        </aside>
      </div>
    </div>
  </ToolWindowShell>
</template>
