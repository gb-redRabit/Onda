<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Slider from '@renderer/components/ui/Slider.vue';

const brightness = defineModel<number>('brightness', { required: true });
const contrast = defineModel<number>('contrast', { required: true });
const saturation = defineModel<number>('saturation', { required: true });
const temperature = defineModel<number>('temperature', { required: true });
const sharpen = defineModel<number>('sharpen', { required: true });

const { t } = useI18n();
</script>

<template>
  <section class="space-y-2 rounded-box border border-hairline bg-base-100/70 p-3">
    <div class="text-xs font-semibold">{{ t('tools.imageStudioAdjust') }}</div>
    <label class="block">
      <span class="flex justify-between text-2xs text-base-content/60">
        <span>{{ t('tools.imageStudioBrightness') }}</span>
        <span>{{ brightness }}</span>
      </span>
      <Slider
        v-model="brightness"
        class="mt-1"
        :label="t('tools.imageStudioBrightness')"
        :min="0"
        :max="200"
        :value-text="String(brightness)"
      />
    </label>
    <label class="block">
      <span class="flex justify-between text-2xs text-base-content/60">
        <span>{{ t('tools.imageStudioContrast') }}</span>
        <span>{{ contrast }}</span>
      </span>
      <Slider
        v-model="contrast"
        class="mt-1"
        :label="t('tools.imageStudioContrast')"
        :min="0"
        :max="200"
        :value-text="String(contrast)"
      />
    </label>
    <label class="block">
      <span class="flex justify-between text-2xs text-base-content/60">
        <span>{{ t('tools.imageStudioSaturation') }}</span>
        <span>{{ saturation }}</span>
      </span>
      <Slider
        v-model="saturation"
        class="mt-1"
        :label="t('tools.imageStudioSaturation')"
        :min="0"
        :max="200"
        :value-text="String(saturation)"
      />
    </label>
    <label class="block">
      <span class="flex justify-between text-2xs text-base-content/60">
        <span>{{ t('tools.imageStudioTemperature') }}</span>
        <span>{{ temperature }}</span>
      </span>
      <Slider
        v-model="temperature"
        class="mt-1"
        :label="t('tools.imageStudioTemperature')"
        :min="-100"
        :max="100"
        :value-text="String(temperature)"
      />
    </label>
    <label class="block">
      <span class="flex justify-between text-2xs text-base-content/60">
        <span>{{ t('tools.imageStudioSharpen') }}</span>
        <span>{{ sharpen }}</span>
      </span>
      <Slider
        v-model="sharpen"
        class="mt-1"
        :label="t('tools.imageStudioSharpen')"
        :min="0"
        :max="100"
        :value-text="String(sharpen)"
      />
    </label>
  </section>
</template>
