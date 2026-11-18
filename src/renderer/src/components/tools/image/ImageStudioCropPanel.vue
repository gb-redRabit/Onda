<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from '@lucide/vue';
import type { Aspect } from '@renderer/utils/imageStudio';

const aspect = defineModel<Aspect>('aspect', { required: true });
const emit = defineEmits<{ apply: []; rotate: [direction: 1 | -1]; flip: [axis: 'h' | 'v'] }>();

const { t } = useI18n();

const ASPECTS: Array<{ id: Aspect; key: string }> = [
  { id: 'free', key: 'imageStudioAspectFree' },
  { id: '1:1', key: 'imageStudioAspectSquare' },
  { id: '16:9', key: 'imageStudioAspectWide' },
  { id: '4:3', key: 'imageStudioAspectClassic' }
];
</script>

<template>
  <section class="space-y-2 rounded-box border border-hairline bg-base-100/70 p-3">
    <div class="text-xs font-semibold">{{ t('tools.imageStudioCrop') }}</div>
    <div class="flex flex-wrap gap-1">
      <button
        v-for="item in ASPECTS"
        :key="item.id"
        type="button"
        :data-testid="`image-studio-aspect-${item.id}`"
        class="rounded-field border px-2 py-1 text-2xs transition-colors"
        :class="
          aspect === item.id
            ? 'border-primary bg-primary/10 text-primary-text'
            : 'border-hairline text-base-content/60 hover:bg-base-content/10'
        "
        @click="
          aspect = item.id;
          emit('apply');
        "
      >
        {{ t(`tools.${item.key}`) }}
      </button>
    </div>
    <p class="text-3xs text-base-content/50">
      {{ t('tools.imageStudioCropHint') }}
    </p>
    <div class="flex gap-1">
      <button
        type="button"
        data-testid="image-studio-rotate-left"
        class="fx-noise flex-1 rounded-field border border-hairline p-1.5 hover:bg-base-content/10"
        :title="t('tools.imageStudioRotateLeft')"
        :aria-label="t('tools.imageStudioRotateLeft')"
        @click="emit('rotate', -1)"
      >
        <RotateCcw :size="14" class="mx-auto" />
      </button>
      <button
        type="button"
        data-testid="image-studio-rotate-right"
        class="fx-noise flex-1 rounded-field border border-hairline p-1.5 hover:bg-base-content/10"
        :title="t('tools.imageStudioRotateRight')"
        :aria-label="t('tools.imageStudioRotateRight')"
        @click="emit('rotate', 1)"
      >
        <RotateCw :size="14" class="mx-auto" />
      </button>
      <button
        type="button"
        data-testid="image-studio-flip-h"
        class="fx-noise flex-1 rounded-field border border-hairline p-1.5 hover:bg-base-content/10"
        :title="t('tools.imageStudioFlipH')"
        :aria-label="t('tools.imageStudioFlipH')"
        @click="emit('flip', 'h')"
      >
        <FlipHorizontal2 :size="14" class="mx-auto" />
      </button>
      <button
        type="button"
        data-testid="image-studio-flip-v"
        class="fx-noise flex-1 rounded-field border border-hairline p-1.5 hover:bg-base-content/10"
        :title="t('tools.imageStudioFlipV')"
        :aria-label="t('tools.imageStudioFlipV')"
        @click="emit('flip', 'v')"
      >
        <FlipVertical2 :size="14" class="mx-auto" />
      </button>
    </div>
  </section>
</template>
