<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertCircle, CheckCircle2, FolderOpen, History, Save } from '@lucide/vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import type {
  HistoryExportFormat,
  HistoryExportMediaType,
  HistoryExportResult,
  HistoryExportSort
} from '@shared/types/tools';

const { t } = useI18n();
const format = ref<HistoryExportFormat>('csv');
const type = ref<HistoryExportMediaType>('all');
const sort = ref<HistoryExportSort>('lastPlayed');
const onlyPlayed = ref(true);
const outputPath = ref('');
const busy = ref(false);
const errorMsg = ref('');
const result = ref<HistoryExportResult | null>(null);

function extensionFor(value: HistoryExportFormat): string {
  return value === 'json' ? 'json' : 'csv';
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

async function pickFolder(): Promise<void> {
  const paths = (await window.api.invoke('dialog:openFolder')) as string[];
  if (paths.length > 0) {
    outputPath.value = `${paths[0].replace(/\\/g, '/')}/onda-history.${extensionFor(format.value)}`;
  }
}

async function run(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  errorMsg.value = '';
  result.value = null;
  try {
    const res = await window.api.exportHistory({
      format: format.value,
      type: type.value,
      sort: sort.value,
      onlyPlayed: onlyPlayed.value,
      outputPath: outputPath.value.trim() || undefined
    });
    if (res.canceled) return;
    if (!res.success) {
      errorMsg.value = res.error || t('tools.historyExportError');
      return;
    }
    result.value = res;
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

function openOutput(): void {
  if (result.value?.path) void window.api.invoke('shell:showItemInFolder', result.value.path);
}

watch(format, (value) => {
  outputPath.value = outputPath.value.replace(/\.(csv|json)$/i, `.${extensionFor(value)}`);
});
</script>

<template>
  <ToolWindowShell :title="t('tools.historyExportTitle')" :icon="History">
    <div data-testid="history-export-view" class="flex h-full flex-col overflow-auto p-4">
      <p class="mb-4 text-xs leading-relaxed text-base-content/60">
        {{ t('tools.historyExportHint') }}
      </p>

      <div class="space-y-3 rounded-box border border-base-300 bg-base-100/70 p-4">
        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('tools.historyExportFormat') }}
          </span>
          <select
            v-model="format"
            data-testid="history-export-format"
            :disabled="busy"
            class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>

        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('tools.historyExportType') }}
          </span>
          <select
            v-model="type"
            data-testid="history-export-type"
            :disabled="busy"
            class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="all">{{ t('tools.historyExportTypeAll') }}</option>
            <option value="audio">{{ t('tools.historyExportTypeAudio') }}</option>
            <option value="video">{{ t('tools.historyExportTypeVideo') }}</option>
          </select>
        </label>

        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('tools.historyExportSort') }}
          </span>
          <select
            v-model="sort"
            data-testid="history-export-sort"
            :disabled="busy"
            class="mt-1 w-full rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
          >
            <option value="lastPlayed">{{ t('tools.historyExportSortLastPlayed') }}</option>
            <option value="playCount">{{ t('tools.historyExportSortPlayCount') }}</option>
            <option value="title">{{ t('tools.historyExportSortTitle') }}</option>
          </select>
        </label>

        <label class="flex items-center gap-2 text-xs text-base-content/70">
          <input
            v-model="onlyPlayed"
            data-testid="history-export-only-played"
            type="checkbox"
            :disabled="busy"
          />
          {{ t('tools.historyExportOnlyPlayed') }}
        </label>

        <label class="block">
          <span class="text-[11px] font-medium text-base-content/60">
            {{ t('tools.historyExportOutput') }}
          </span>
          <div class="mt-1 flex items-center gap-1.5">
            <input
              v-model="outputPath"
              data-testid="history-export-output"
              type="text"
              :disabled="busy"
              :placeholder="t('tools.historyExportOutputHint')"
              class="min-w-0 flex-1 rounded-field border border-base-300 bg-base-100 px-2.5 py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-40"
            />
            <button
              class="fx-noise shrink-0 rounded-field border border-base-300 p-2 transition-colors hover:bg-base-content/10 disabled:opacity-40"
              :disabled="busy"
              :title="t('tools.chooseFolder')"
              :aria-label="t('tools.chooseFolder')"
              @click="pickFolder"
            >
              <FolderOpen :size="13" />
            </button>
          </div>
        </label>
      </div>

      <button
        data-testid="history-export-run"
        class="fx-noise mt-4 flex items-center justify-center gap-1.5 rounded-field bg-primary px-3 py-2.5 text-sm font-medium text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-40"
        :disabled="busy"
        @click="run"
      >
        <Save :size="14" />
        {{ busy ? t('tools.historyExportRunning') : t('tools.historyExportRun') }}
      </button>

      <p
        v-if="result?.success"
        data-testid="history-export-result"
        class="mt-3 flex items-center gap-1.5 text-[11px] text-success"
      >
        <CheckCircle2 :size="13" />
        {{
          t('tools.historyExportResult', {
            rows: result.rows ?? 0,
            size: formatBytes(result.bytes)
          })
        }}
        <button
          class="ml-1 rounded-field border border-base-300 px-2 py-0.5 text-base-content/70 hover:bg-base-content/10"
          @click="openOutput"
        >
          {{ t('tools.openOutput') }}
        </button>
      </p>
      <p v-if="errorMsg" class="mt-3 flex items-center gap-1.5 text-[11px] text-error">
        <AlertCircle :size="13" />
        {{ errorMsg }}
      </p>
    </div>
  </ToolWindowShell>
</template>
