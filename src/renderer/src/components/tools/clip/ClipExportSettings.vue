<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import PathInput from '@renderer/components/ui/PathInput.vue';
import Select from '@renderer/components/ui/Select.vue';
import type {
  VideoClipAudio,
  VideoClipContainer,
  VideoClipFormat,
  VideoClipMode,
  VideoClipRotation
} from '@shared/types/tools';

const clipFormat = defineModel<VideoClipFormat>('clipFormat', { required: true });
const clipMode = defineModel<VideoClipMode>('clipMode', { required: true });
const container = defineModel<VideoClipContainer>('container', { required: true });
const audioMode = defineModel<VideoClipAudio>('audioMode', { required: true });
const rotation = defineModel<VideoClipRotation>('rotation', { required: true });
const targetSizeMb = defineModel<number>('targetSizeMb', { required: true });
const outputDir = defineModel<string>('outputDir', { required: true });

defineProps<{ busy: boolean }>();
const emit = defineEmits<{ browse: [] }>();

const { t } = useI18n();

// `Select` przekazuje wartość z `<option>` jako string; model trzyma liczby.
const rotationModel = computed({
  get: () => rotation.value,
  set: (value: string | number) => (rotation.value = Number(value) as VideoClipRotation)
});
const targetSizeModel = computed({
  get: () => targetSizeMb.value,
  set: (value: string | number) => (targetSizeMb.value = Number(value))
});
</script>

<template>
  <section class="rounded-box border border-hairline bg-base-100/70 p-4 lg:row-span-2">
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label class="block">
        <span class="text-2xs font-medium text-base-content/60">
          {{ t('tools.clipFormat') }}
        </span>
        <Select
          v-model="clipFormat"
          size="sm"
          class="mt-1"
          data-testid="clip-format"
          :disabled="busy"
        >
          <option value="video">{{ t('tools.clipFormatVideo') }}</option>
          <option value="gif">{{ t('tools.clipFormatGif') }}</option>
        </Select>
      </label>

      <label class="block">
        <span class="mb-1 block text-2xs font-medium text-base-content/60">
          {{ t('tools.clipMode') }}
        </span>
        <Select
          v-model="clipMode"
          size="sm"
          data-testid="clip-mode"
          :disabled="busy || clipFormat === 'gif'"
        >
          <option value="copy">{{ t('tools.clipModeCopy') }}</option>
          <option value="exact">{{ t('tools.clipModeExact') }}</option>
        </Select>
      </label>

      <label class="block">
        <span class="mb-1 block text-2xs font-medium text-base-content/60">
          {{ t('tools.clipContainer') }}
        </span>
        <Select
          v-model="container"
          size="sm"
          data-testid="clip-container"
          :disabled="busy || clipFormat === 'gif'"
        >
          <option value="mp4">{{ t('tools.mp4') }}</option>
          <option value="mkv">{{ t('tools.mkv') }}</option>
          <option value="webm">{{ t('tools.webm') }}</option>
        </Select>
      </label>

      <label class="block">
        <span class="mb-1 block text-2xs font-medium text-base-content/60">
          {{ t('tools.clipAudio') }}
        </span>
        <Select
          v-model="audioMode"
          size="sm"
          data-testid="clip-audio"
          :disabled="busy || clipFormat === 'gif'"
        >
          <option value="keep">{{ t('tools.clipAudioKeep') }}</option>
          <option value="mute">{{ t('tools.clipAudioMute') }}</option>
          <option value="remove">{{ t('tools.clipAudioRemove') }}</option>
        </Select>
      </label>

      <label class="block">
        <span class="mb-1 block text-2xs font-medium text-base-content/60">
          {{ t('tools.clipRotation') }}
        </span>
        <Select
          v-model="rotationModel"
          size="sm"
          data-testid="clip-rotation"
          :disabled="busy || clipFormat === 'gif'"
        >
          <option :value="0">{{ t('tools.clipRotationNone') }}</option>
          <option :value="90">90°</option>
          <option :value="180">180°</option>
          <option :value="270">270°</option>
        </Select>
      </label>

      <label class="block">
        <span class="mb-1 block text-2xs font-medium text-base-content/60">
          {{ t('tools.clipTargetSize') }}
        </span>
        <Select
          v-model="targetSizeModel"
          size="sm"
          data-testid="clip-target-size"
          :disabled="busy || clipFormat === 'gif'"
        >
          <option :value="0">{{ t('tools.clipTargetNone') }}</option>
          <option :value="10">10 MB</option>
          <option :value="25">25 MB</option>
        </Select>
      </label>

      <label class="block sm:col-span-2">
        <span class="mb-1 block text-2xs font-medium text-base-content/60">
          {{ t('tools.outputFolder') }}
        </span>
        <PathInput
          v-model="outputDir"
          :readonly="false"
          :label="t('tools.outputFolder')"
          :placeholder="t('tools.outputDefault')"
          :disabled="busy"
          @browse="emit('browse')"
        />
      </label>
    </div>
  </section>
</template>
