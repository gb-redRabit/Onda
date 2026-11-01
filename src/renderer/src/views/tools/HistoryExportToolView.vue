<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckCircle2, FolderOpen, History, Save } from '@lucide/vue';
import ToolWindowShell, { type ToolStatus } from '@renderer/components/tools/ToolWindowShell.vue';
import Button from '@renderer/components/ui/Button.vue';
import Checkbox from '@renderer/components/ui/Checkbox.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import Input from '@renderer/components/ui/Input.vue';
import Select from '@renderer/components/ui/Select.vue';
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

const status = computed<ToolStatus | null>(() => {
  if (busy.value) return { tone: 'busy', text: t('tools.historyExportRunning') };
  if (errorMsg.value) return { tone: 'error', text: errorMsg.value };
  return null;
});

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
  <ToolWindowShell :title="t('tools.historyExportTitle')" :icon="History" :status="status">
    <div data-testid="history-export-view" class="flex h-full flex-col overflow-auto p-4">
      <p class="mb-4 text-xs leading-relaxed text-base-content/60">
        {{ t('tools.historyExportHint') }}
      </p>

      <div class="space-y-3 rounded-box border border-hairline bg-base-100/70 p-4">
        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.historyExportFormat') }}
          </span>
          <Select v-model="format" size="sm" data-testid="history-export-format" :disabled="busy">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </Select>
        </label>

        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.historyExportType') }}
          </span>
          <Select v-model="type" size="sm" data-testid="history-export-type" :disabled="busy">
            <option value="all">{{ t('tools.historyExportTypeAll') }}</option>
            <option value="audio">{{ t('tools.historyExportTypeAudio') }}</option>
            <option value="video">{{ t('tools.historyExportTypeVideo') }}</option>
          </Select>
        </label>

        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.historyExportSort') }}
          </span>
          <Select v-model="sort" size="sm" data-testid="history-export-sort" :disabled="busy">
            <option value="lastPlayed">{{ t('tools.historyExportSortLastPlayed') }}</option>
            <option value="playCount">{{ t('tools.historyExportSortPlayCount') }}</option>
            <option value="title">{{ t('tools.historyExportSortTitle') }}</option>
          </Select>
        </label>

        <Checkbox
          v-model="onlyPlayed"
          data-testid="history-export-only-played"
          :label="t('tools.historyExportOnlyPlayed')"
          :disabled="busy"
        />

        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.historyExportOutput') }}
          </span>
          <div class="flex items-center gap-1.5">
            <Input
              v-model="outputPath"
              size="sm"
              data-testid="history-export-output"
              :disabled="busy"
              :placeholder="t('tools.historyExportOutputHint')"
            />
            <IconButton
              :icon="FolderOpen"
              :label="t('tools.chooseFolder')"
              :size="13"
              class="shrink-0 border border-hairline"
              :disabled="busy"
              @click="pickFolder"
            />
          </div>
        </label>
      </div>

      <p
        v-if="result?.success"
        data-testid="history-export-result"
        class="mt-3 flex items-center gap-1.5 text-2xs text-success"
      >
        <CheckCircle2 :size="13" />
        {{
          t('tools.historyExportResult', {
            rows: result.rows ?? 0,
            size: formatBytes(result.bytes)
          })
        }}
        <Button variant="ghost" size="sm" class="ml-1" @click="openOutput">
          {{ t('tools.openOutput') }}
        </Button>
      </p>
    </div>

    <template #footer>
      <Button
        variant="solid"
        data-testid="history-export-run"
        :disabled="busy"
        :loading="busy"
        @click="run"
      >
        <template #leading><Save :size="14" /></template>
        {{ busy ? t('tools.historyExportRunning') : t('tools.historyExportRun') }}
      </Button>
    </template>
  </ToolWindowShell>
</template>
