<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Check } from '@lucide/vue';
import NumberField from '@renderer/components/ui/NumberField.vue';
import PathInput from '@renderer/components/ui/PathInput.vue';
import Select from '@renderer/components/ui/Select.vue';
import Slider from '@renderer/components/ui/Slider.vue';
import { MAX_OUTPUT_DIMENSION, formatBytes } from '@renderer/utils/imageStudio';
import { IMAGE_OUTPUT_FORMATS, type ImageOutputFormat } from '@shared/types/tools';

const outputFormat = defineModel<ImageOutputFormat>('outputFormat', { required: true });
const quality = defineModel<number>('quality', { required: true });
const outputWidth = defineModel<number>('outputWidth', { required: true });
const outputPath = defineModel<string>('outputPath', { required: true });

defineProps<{
  outputHeight: number;
  estimatedBytes: number | null;
  estimating: boolean;
  savedPath: string;
  savedBytes: number | null;
  errorMessage: string;
}>();

const emit = defineEmits<{ estimate: []; browse: [] }>();
const { t } = useI18n();
</script>

<template>
  <section class="space-y-2 rounded-box border border-hairline bg-base-100/70 p-3">
    <div class="text-xs font-semibold">{{ t('tools.imageStudioOutput') }}</div>
    <label class="block">
      <span class="mb-1 block text-2xs text-base-content/60">{{
        t('tools.imageStudioFormat')
      }}</span>
      <Select v-model="outputFormat" size="sm" data-testid="image-studio-format">
        <option v-for="format in IMAGE_OUTPUT_FORMATS" :key="format" :value="format">
          {{ format.toUpperCase() }}
        </option>
      </Select>
    </label>
    <div v-if="outputFormat !== 'png'">
      <div class="flex justify-between text-2xs text-base-content/60">
        <span>{{ t('tools.imageStudioQuality') }}</span>
        <span>{{ quality }}</span>
      </div>
      <Slider
        v-model="quality"
        :label="t('tools.imageStudioQuality')"
        :min="1"
        :max="100"
        :value-text="String(quality)"
      />
    </div>
    <div class="block">
      <span class="text-2xs text-base-content/60">{{ t('tools.imageStudioWidth') }}</span>
      <div class="mt-1 flex items-center gap-2">
        <NumberField
          v-model="outputWidth"
          size="sm"
          class="w-24"
          data-testid="image-studio-width"
          :label="t('tools.imageStudioWidth')"
          :min="1"
          :max="MAX_OUTPUT_DIMENSION"
        />
        <span class="text-2xs text-base-content/50">→ {{ outputHeight }} px</span>
      </div>
    </div>
    <div class="flex items-center justify-between text-2xs text-base-content/60">
      <span
        >{{ t('tools.imageStudioEstimated') }}:
        {{ estimating ? '…' : formatBytes(estimatedBytes) }}</span
      >
      <button
        type="button"
        data-testid="image-studio-estimate"
        class="rounded-field border border-hairline px-2 py-0.5 hover:bg-base-content/10"
        :disabled="estimating"
        @click="emit('estimate')"
      >
        {{ t('tools.imageStudioCheckSize') }}
      </button>
    </div>
    <label class="block">
      <span class="mb-1 block text-2xs text-base-content/60">{{ t('tools.imageStudioPath') }}</span>
      <PathInput
        v-model="outputPath"
        :readonly="false"
        data-testid="image-studio-output-path"
        :label="t('tools.imageStudioPath')"
        @browse="emit('browse')"
      />
    </label>
    <p
      v-if="savedPath"
      data-testid="image-studio-saved"
      class="flex items-center gap-1 text-2xs text-success"
    >
      <Check :size="12" />
      {{ t('tools.imageStudioSaved', { size: formatBytes(savedBytes) }) }}
    </p>
    <p v-if="errorMessage" class="text-2xs text-error">{{ errorMessage }}</p>
  </section>
</template>
