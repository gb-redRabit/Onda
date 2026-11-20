<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ArrowUpRight, Crop, Droplets, Grid2x2, Square, Trash2, Type, Undo2 } from '@lucide/vue';
import type { Component } from 'vue';
import ColorInput from '@renderer/components/ui/ColorInput.vue';
import Slider from '@renderer/components/ui/Slider.vue';
import type { AnnotationKind } from '@renderer/utils/imageStudio';

type Tool = 'crop' | AnnotationKind;

const tool = defineModel<Tool>('tool', { required: true });
const textValue = defineModel<string>('textValue', { required: true });
const color = defineModel<string>('color', { required: true });
const strokeWidth = defineModel<number>('strokeWidth', { required: true });

defineProps<{ annotationCount: number; hasSelection: boolean }>();
const emit = defineEmits<{ undo: []; remove: []; clear: [] }>();

const { t } = useI18n();

const TOOLS: Array<{ id: Tool; key: string; icon: Component }> = [
  { id: 'crop', key: 'imageStudioToolCrop', icon: Crop },
  { id: 'rect', key: 'imageStudioToolRect', icon: Square },
  { id: 'arrow', key: 'imageStudioToolArrow', icon: ArrowUpRight },
  { id: 'text', key: 'imageStudioToolText', icon: Type },
  { id: 'blur', key: 'imageStudioToolBlur', icon: Droplets },
  { id: 'pixelate', key: 'imageStudioToolPixelate', icon: Grid2x2 }
];
</script>

<template>
  <section class="space-y-2 rounded-box border border-hairline bg-base-100/70 p-3">
    <div class="text-xs font-semibold">{{ t('tools.imageStudioAnnotations') }}</div>
    <div class="grid grid-cols-3 gap-1">
      <button
        v-for="item in TOOLS"
        :key="item.id"
        type="button"
        :data-testid="`image-studio-tool-${item.id}`"
        class="flex flex-col items-center gap-1 rounded-field border px-1 py-1.5 text-3xs transition-colors"
        :class="
          tool === item.id
            ? 'border-primary bg-primary/10 text-primary-text'
            : 'border-hairline text-base-content/60 hover:bg-base-content/10'
        "
        @click="tool = item.id"
      >
        <component :is="item.icon" :size="14" />
        {{ t(`tools.${item.key}`) }}
      </button>
    </div>
    <div v-if="tool === 'text'" class="space-y-1">
      <input
        v-model="textValue"
        type="text"
        :placeholder="t('tools.imageStudioTextPlaceholder')"
        :aria-label="t('tools.imageStudioTextPlaceholder')"
        class="w-full rounded-field border border-hairline bg-base-100 px-2 py-1.5 text-xs"
      />
      <p class="text-3xs text-base-content/50">{{ t('tools.imageStudioTextHint') }}</p>
    </div>
    <div class="flex items-center gap-2">
      <ColorInput v-model="color" class="shrink-0" :label="t('tools.imageStudioStroke')" />
      <div class="min-w-0 flex-1">
        <div class="flex justify-between text-2xs text-base-content/60">
          <span>{{ t('tools.imageStudioStroke') }}: {{ strokeWidth }}</span>
        </div>
        <Slider
          v-model="strokeWidth"
          data-testid="image-studio-stroke"
          :label="t('tools.imageStudioStroke')"
          :min="2"
          :max="40"
          :value-text="String(strokeWidth)"
        />
      </div>
    </div>
    <p class="text-3xs text-base-content/50">
      {{ t('tools.imageStudioAnnotationHint') }}
    </p>
    <div class="flex gap-1">
      <button
        type="button"
        class="fx-noise flex-1 rounded-field border border-hairline px-2 py-1 text-2xs hover:bg-base-content/10 disabled:opacity-40"
        :disabled="annotationCount === 0"
        @click="emit('undo')"
      >
        <Undo2 :size="12" class="mr-1 inline" />{{ t('tools.imageStudioUndo') }}
      </button>
      <button
        type="button"
        data-testid="image-studio-delete"
        class="fx-noise flex-1 rounded-field border border-hairline px-2 py-1 text-2xs hover:bg-base-content/10 disabled:opacity-40"
        :disabled="!hasSelection"
        @click="emit('remove')"
      >
        <Trash2 :size="12" class="mr-1 inline" />{{ t('tools.imageStudioDelete') }}
      </button>
      <button
        type="button"
        class="fx-noise flex-1 rounded-field border border-hairline px-2 py-1 text-2xs hover:bg-base-content/10 disabled:opacity-40"
        :disabled="annotationCount === 0"
        @click="emit('clear')"
      >
        {{ t('tools.imageStudioClear') }}
      </button>
    </div>
  </section>
</template>
