<script setup lang="ts">
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
import Button from '@renderer/components/ui/Button.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import PathInput from '@renderer/components/ui/PathInput.vue';
import Select from '@renderer/components/ui/Select.vue';
import { useVideoConcat } from '@renderer/composables/useVideoConcat';

const { t } = useI18n();

const {
  files,
  outputDir,
  container,
  mode,
  audio,
  status,
  progress,
  speed,
  error,
  outputPath,
  busy,
  canConcat,
  copyHint,
  fileName,
  pickFiles,
  onDrop,
  removeFile,
  moveFile,
  clearFiles,
  pickOutputDir,
  startConcat,
  cancelConcat,
  openOutput
} = useVideoConcat();
</script>

<template>
  <ToolWindowShell :title="t('tools.videoConcatTitle')" :icon="Layers">
    <div
      data-testid="concat-view"
      class="flex h-full flex-col gap-4 overflow-auto p-4"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <section class="rounded-box border border-hairline bg-base-100/70 p-4">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-semibold">
            {{ t('tools.concatFiles') }}
            <span class="ml-1 text-xs font-normal text-base-content/50">
              {{ t('tools.fileCount', { count: files.length }) }}
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              data-testid="concat-add"
              :disabled="busy"
              @click="pickFiles"
            >
              <template #leading><Plus :size="12" /></template>
              {{ t('tools.addFiles') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy || files.length === 0"
              @click="clearFiles"
            >
              {{ t('tools.clear') }}
            </Button>
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
            class="flex items-center gap-2 rounded-field border border-hairline/70 bg-base-200/40 px-2.5 py-2"
          >
            <span class="w-5 shrink-0 text-center font-mono text-2xs text-base-content/40">
              {{ index + 1 }}
            </span>
            <span class="min-w-0 flex-1 truncate text-xs" :title="path">{{ fileName(path) }}</span>
            <IconButton
              :icon="ChevronUp"
              :label="t('tools.concatMoveUp')"
              :size="12"
              :disabled="busy || index === 0"
              @click="moveFile(index, -1)"
            />
            <IconButton
              :icon="ChevronDown"
              :label="t('tools.concatMoveDown')"
              :size="12"
              :disabled="busy || index === files.length - 1"
              @click="moveFile(index, 1)"
            />
            <IconButton
              :icon="Trash2"
              :label="t('tools.remove')"
              :size="12"
              variant="danger"
              :disabled="busy"
              @click="removeFile(index)"
            />
          </div>
        </div>
      </section>

      <section class="grid gap-4 md:grid-cols-3">
        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.clipContainer') }}
          </span>
          <Select v-model="container" size="sm" data-testid="concat-container" :disabled="busy">
            <option value="mp4">{{ t('tools.mp4') }}</option>
            <option value="mkv">{{ t('tools.mkv') }}</option>
            <option value="webm">{{ t('tools.webm') }}</option>
          </Select>
        </label>
        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.clipMode') }}
          </span>
          <Select v-model="mode" size="sm" :disabled="busy">
            <option value="copy">{{ t('tools.clipModeCopy') }}</option>
            <option value="exact">{{ t('tools.clipModeExact') }}</option>
          </Select>
        </label>
        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.clipAudio') }}
          </span>
          <Select v-model="audio" size="sm" :disabled="busy">
            <option value="keep">{{ t('tools.clipAudioKeep') }}</option>
            <option value="mute">{{ t('tools.clipAudioMute') }}</option>
            <option value="remove">{{ t('tools.clipAudioRemove') }}</option>
          </Select>
        </label>
      </section>

      <section class="rounded-box border border-hairline bg-base-100/70 p-4">
        <label class="block">
          <span class="mb-1 block text-2xs font-medium text-base-content/60">
            {{ t('tools.outputFolder') }}
          </span>
          <PathInput
            v-model="outputDir"
            :readonly="false"
            :label="t('tools.outputFolder')"
            :placeholder="t('tools.outputDefault')"
            :disabled="busy"
            @browse="pickOutputDir"
          />
        </label>
        <p class="mt-2 text-2xs leading-relaxed text-base-content/45">{{ copyHint }}</p>
      </section>

      <section
        v-if="status !== 'idle'"
        data-testid="concat-job"
        :data-status="status"
        class="rounded-box border border-hairline bg-base-100/70 px-3 py-2"
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
          <span class="shrink-0 text-2xs text-base-content/50">
            {{ status === 'exporting' ? t('tools.concatExporting') : t(`tools.${status}`) }}
            <template v-if="status === 'exporting'">
              {{ t('tools.progress', { percent: Math.round(progress) }) }}
              <template v-if="speed"> · {{ speed }}</template>
            </template>
          </span>
          <IconButton
            v-if="outputPath"
            :icon="FolderOpen"
            :label="t('tools.openOutput')"
            :size="12"
            @click="openOutput"
          />
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
    </div>

    <template #footer>
      <Button v-if="busy" variant="outline" data-testid="concat-cancel" @click="cancelConcat">
        <template #leading><Square :size="12" /></template>
        {{ t('tools.cancel') }}
      </Button>
      <Button
        variant="solid"
        data-testid="concat-export"
        :disabled="!canConcat"
        :loading="busy"
        @click="startConcat"
      >
        <template #leading><Layers :size="14" /></template>
        {{ busy ? t('tools.concatExporting') : t('tools.concatExport') }}
      </Button>
    </template>
  </ToolWindowShell>
</template>
