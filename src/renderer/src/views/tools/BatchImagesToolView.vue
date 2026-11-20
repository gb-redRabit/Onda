<script setup lang="ts">
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
import Button from '@renderer/components/ui/Button.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import Input from '@renderer/components/ui/Input.vue';
import NumberField from '@renderer/components/ui/NumberField.vue';
import Select from '@renderer/components/ui/Select.vue';
import Slider from '@renderer/components/ui/Slider.vue';
import ToolWindowShell from '@renderer/components/tools/ToolWindowShell.vue';
import { formatBytesCompact as formatBytes } from '@renderer/utils/formatters';
import { useBatchImages } from '@renderer/composables/useBatchImages';
import { IMAGE_OUTPUT_FORMATS } from '@shared/types/tools';

const { t } = useI18n();

const {
  files,
  format,
  quality,
  maxWidth,
  maxHeight,
  outputDir,
  busy,
  status,
  total,
  doneRows,
  failedRows,
  processed,
  statusLabel,
  pickFiles,
  onDrop,
  removeRow,
  clearAll,
  pickOutputDir,
  openOutput,
  start,
  cancel
} = useBatchImages();
</script>

<template>
  <ToolWindowShell :title="t('tools.batchImagesTitle')" :icon="ImageIcon" :status="status">
    <div
      data-testid="batch-images-view"
      class="flex h-full flex-col"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <div class="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          class="flex min-h-0 flex-col rounded-box border border-hairline bg-base-100/70 p-3"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-sm font-semibold">
              {{ t('tools.addFiles') }}
              <span class="ml-1 text-xs font-normal text-base-content/50">{{ total }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                data-testid="batch-images-add"
                :disabled="busy"
                @click="pickFiles"
              >
                <template #leading><Plus :size="12" /></template>
                {{ t('tools.addFiles') }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="batch-images-clear"
                :disabled="busy || total === 0"
                @click="clearAll"
              >
                {{ t('tools.clear') }}
              </Button>
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
              class="rounded-field border border-hairline/70 bg-base-200/40 px-2.5 py-2"
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
                <span class="shrink-0 text-2xs text-base-content/50">
                  {{ statusLabel(row.status) }}
                  <template v-if="row.bytes"> · {{ formatBytes(row.bytes) }}</template>
                </span>
                <IconButton
                  v-if="row.outputPath"
                  :icon="FolderOpen"
                  :label="t('tools.openOutput')"
                  :size="12"
                  @click="openOutput(row.outputPath)"
                />
                <IconButton
                  :icon="Trash2"
                  :label="t('tools.remove')"
                  :size="12"
                  variant="danger"
                  :disabled="busy"
                  @click="removeRow(row.path)"
                />
              </div>
              <p v-if="row.error" class="mt-1 text-2xs text-error line-clamp-2" :title="row.error">
                {{ row.error }}
              </p>
            </div>
          </div>
        </section>

        <aside class="space-y-3">
          <section class="space-y-2 rounded-box border border-hairline bg-base-100/70 p-3">
            <label class="block">
              <span class="mb-1 block text-2xs font-medium text-base-content/60">
                {{ t('tools.batchImagesFormat') }}
              </span>
              <Select v-model="format" size="sm" data-testid="batch-images-format" :disabled="busy">
                <option v-for="item in IMAGE_OUTPUT_FORMATS" :key="item" :value="item">
                  {{ item.toUpperCase() }}
                </option>
              </Select>
            </label>

            <div v-if="format !== 'png'">
              <div class="flex justify-between text-2xs font-medium text-base-content/60">
                <span>{{ t('tools.batchImagesQuality') }}</span>
                <span>{{ quality }}</span>
              </div>
              <Slider
                v-model="quality"
                class="mt-1"
                data-testid="batch-images-quality"
                :label="t('tools.batchImagesQuality')"
                :min="1"
                :max="100"
                :value-text="String(quality)"
              />
            </div>

            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="mb-1 block text-2xs font-medium text-base-content/60">
                  {{ t('tools.batchImagesWidth') }}
                </span>
                <NumberField
                  v-model="maxWidth"
                  size="sm"
                  data-testid="batch-images-width"
                  :label="t('tools.batchImagesWidth')"
                  :min="0"
                  :disabled="busy"
                />
              </label>
              <label class="block">
                <span class="mb-1 block text-2xs font-medium text-base-content/60">
                  {{ t('tools.batchImagesHeight') }}
                </span>
                <NumberField
                  v-model="maxHeight"
                  size="sm"
                  data-testid="batch-images-height"
                  :label="t('tools.batchImagesHeight')"
                  :min="0"
                  :disabled="busy"
                />
              </label>
            </div>
            <p class="text-3xs text-base-content/50">{{ t('tools.batchImagesResizeHint') }}</p>

            <label class="block">
              <span class="mb-1 block text-2xs font-medium text-base-content/60">
                {{ t('tools.outputFolder') }}
              </span>
              <div class="flex items-center gap-1.5">
                <Input
                  v-model="outputDir"
                  size="sm"
                  data-testid="batch-images-output"
                  :disabled="busy"
                  :placeholder="t('tools.outputDefault')"
                />
                <IconButton
                  :icon="FolderOpen"
                  :label="t('tools.chooseFolder')"
                  :size="13"
                  class="shrink-0 border border-hairline"
                  :disabled="busy"
                  @click="pickOutputDir"
                />
              </div>
            </label>
          </section>
        </aside>
      </div>
    </div>

    <template #footer>
      <p
        v-if="busy || processed > 0"
        data-testid="batch-images-progress"
        class="mr-auto text-2xs text-base-content/50"
      >
        {{ processed }}/{{ total }} ·
        {{ t('tools.batchImagesSummary', { done: doneRows, failed: failedRows }) }}
      </p>
      <Button v-if="busy" variant="outline" data-testid="batch-images-cancel" @click="cancel">
        <template #leading><Square :size="12" /></template>
        {{ t('tools.cancel') }}
      </Button>
      <Button
        variant="solid"
        data-testid="batch-images-start"
        :disabled="busy || total === 0"
        :loading="busy"
        @click="start"
      >
        <template #leading><Play :size="14" /></template>
        {{ busy ? t('tools.batchImagesProcessing') : t('tools.batchImagesStart') }}
      </Button>
    </template>
  </ToolWindowShell>
</template>
