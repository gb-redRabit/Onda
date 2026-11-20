<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { CheckCircle2, FolderOpen, History, Save } from '@lucide/vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import Button from '@renderer/components/ui/Button.vue';
import Checkbox from '@renderer/components/ui/Checkbox.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import Input from '@renderer/components/ui/Input.vue';
import Select from '@renderer/components/ui/Select.vue';
import { useHistoryExport } from '@renderer/composables/useHistoryExport';
import { formatBytesCompact as formatBytes } from '@renderer/utils/formatters';

const { t } = useI18n();

const {
  format,
  type,
  sort,
  onlyPlayed,
  outputPath,
  busy,
  result,
  status,
  pickFolder,
  run,
  openOutput
} = useHistoryExport();
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
