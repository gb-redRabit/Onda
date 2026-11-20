<script setup lang="ts">
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
import Button from '@renderer/components/ui/Button.vue';
import IconButton from '@renderer/components/ui/IconButton.vue';
import PathInput from '@renderer/components/ui/PathInput.vue';
import SegmentedControl from '@renderer/components/ui/SegmentedControl.vue';
import Select from '@renderer/components/ui/Select.vue';
import { useConverter } from '@renderer/composables/useConverter';

const { t } = useI18n();

const {
  kind,
  files,
  jobs,
  outputDir,
  audioFormat,
  audioBitrate,
  videoContainer,
  videoQuality,
  busy,
  bitrateDisabled,
  fileName,
  pickFiles,
  onDrop,
  pickOutputDir,
  removeFile,
  clearFiles,
  statusLabel,
  fileCountLabel,
  startConvert,
  cancelConvert,
  openOutput
} = useConverter();
</script>

<template>
  <ToolWindowShell :title="t('tools.converterTitle')" :icon="Wrench">
    <div data-testid="tools-converter-view" class="flex h-full flex-col">
      <div class="flex-1 overflow-auto p-4 space-y-4">
        <SegmentedControl
          :model-value="kind"
          :options="[
            { value: 'audio', label: t('tools.audio'), icon: Music },
            { value: 'video', label: t('tools.video'), icon: Video }
          ]"
          test-id-prefix="tools-kind"
          :label="t('tools.converterTitle')"
          @update:model-value="kind = $event as 'audio' | 'video'"
        />

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            class="flex min-h-64 flex-col rounded-box border border-hairline bg-base-100/70 p-4"
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
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="tools-add-files"
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
              :title="t('tools.empty')"
              :description="t('tools.dropHint')"
              :icon="kind === 'audio' ? Music : Video"
            />

            <div v-else class="mt-3 space-y-1.5">
              <div
                v-for="path in files"
                :key="path"
                class="flex items-center gap-2 rounded-field border border-hairline/70 bg-base-200/40 px-2.5 py-2"
              >
                <component
                  :is="kind === 'audio' ? Music : Video"
                  :size="14"
                  class="shrink-0 text-primary-text"
                />
                <span class="min-w-0 flex-1 truncate text-xs" :title="path">{{
                  fileName(path)
                }}</span>
                <IconButton
                  :icon="Trash2"
                  :label="t('tools.remove')"
                  :size="12"
                  variant="danger"
                  :disabled="busy"
                  @click="removeFile(path)"
                />
              </div>
            </div>
          </section>

          <aside class="space-y-4">
            <section class="rounded-box border border-hairline bg-base-100/70 p-4 space-y-3">
              <label v-if="kind === 'audio'" class="block">
                <span class="mb-1 block text-2xs font-medium text-base-content/60">
                  {{ t('tools.audioFormat') }}
                </span>
                <Select v-model="audioFormat" size="sm" :disabled="busy">
                  <option value="mp3">MP3</option>
                  <option value="flac">FLAC</option>
                  <option value="wav">WAV</option>
                  <option value="ogg">OGG</option>
                  <option value="opus">OPUS</option>
                  <option value="aac">AAC</option>
                  <option value="m4a">M4A</option>
                </Select>
              </label>

              <label v-if="kind === 'audio'" class="block">
                <span class="mb-1 block text-2xs font-medium text-base-content/60">
                  {{ t('tools.bitrate') }}
                </span>
                <Select
                  :model-value="audioBitrate"
                  size="sm"
                  :disabled="busy || bitrateDisabled"
                  @update:model-value="audioBitrate = Number($event)"
                >
                  <option :value="128">{{ t('tools.bitrateOption', { value: 128 }) }}</option>
                  <option :value="192">{{ t('tools.bitrateOption', { value: 192 }) }}</option>
                  <option :value="256">{{ t('tools.bitrateOption', { value: 256 }) }}</option>
                  <option :value="320">{{ t('tools.bitrateOption', { value: 320 }) }}</option>
                </Select>
              </label>

              <label v-if="kind === 'video'" class="block">
                <span class="mb-1 block text-2xs font-medium text-base-content/60">
                  {{ t('tools.videoFormat') }}
                </span>
                <Select
                  v-model="videoContainer"
                  size="sm"
                  data-testid="tools-video-format"
                  :disabled="busy"
                >
                  <option value="mp4">{{ t('tools.mp4') }}</option>
                  <option value="mkv">{{ t('tools.mkv') }}</option>
                  <option value="webm">{{ t('tools.webm') }}</option>
                </Select>
              </label>

              <label v-if="kind === 'video'" class="block">
                <span class="mb-1 block text-2xs font-medium text-base-content/60">
                  {{ t('tools.quality') }}
                </span>
                <Select v-model="videoQuality" size="sm" :disabled="busy">
                  <option value="high">{{ t('tools.qualityHigh') }}</option>
                  <option value="medium">{{ t('tools.qualityMedium') }}</option>
                  <option value="low">{{ t('tools.qualityLow') }}</option>
                </Select>
              </label>

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
            class="rounded-box border border-hairline bg-base-100/70 px-3 py-2"
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
              <IconButton
                v-if="job.outputPath"
                :icon="FolderOpen"
                :label="t('tools.openOutput')"
                :size="12"
                @click="openOutput(job.outputPath)"
              />
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

    <template #footer>
      <Button v-if="busy" variant="outline" @click="cancelConvert">
        <template #leading><Square :size="12" /></template>
        {{ t('tools.cancel') }}
      </Button>
      <Button
        variant="solid"
        data-testid="tools-convert"
        :disabled="busy || files.length === 0"
        :loading="busy"
        @click="startConvert"
      >
        <template #leading><Wrench :size="14" /></template>
        {{ busy ? t('tools.converting') : t('tools.convert') }}
      </Button>
    </template>
  </ToolWindowShell>
</template>
