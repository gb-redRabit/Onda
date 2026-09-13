<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AudioLayoutElement } from '@renderer/types/settings';
import { CONSTRAINTS } from '@renderer/utils/audioLayout';
import { ELEMENT_META } from '@renderer/utils/audioLayoutEditorMeta';

const props = defineProps<{ element?: AudioLayoutElement }>();
const emit = defineEmits<{ update: [patch: Partial<AudioLayoutElement>] }>();

const hasLockedAspect = computed(
  () => typeof CONSTRAINTS[props.element?.id ?? 'visualization']?.aspect === 'number'
);

const { t } = useI18n();
</script>

<template>
  <div v-if="element" class="flex flex-col gap-3 pt-2 border-t border-base-300">
    <div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wider">
      {{ t(ELEMENT_META[element.id].labelKey) }}
    </div>

    <!-- X -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">X</label>
        <span class="text-[11px] font-mono text-primary tabular-nums">{{ element.x }}%</span>
      </div>
      <input
        type="range"
        min="0"
        :max="100 - element.width"
        :value="element.x"
        class="w-full"
        @input="emit('update', { x: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>

    <!-- Y -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">Y</label>
        <span class="text-[11px] font-mono text-primary tabular-nums">{{ element.y }}%</span>
      </div>
      <input
        type="range"
        min="0"
        :max="100 - element.height"
        :value="element.y"
        class="w-full"
        @input="emit('update', { y: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>

    <!-- Width -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">{{ t('audioView.width') }}</label>
        <span class="text-[11px] font-mono text-primary tabular-nums">{{ element.width }}%</span>
      </div>
      <input
        type="range"
        :min="CONSTRAINTS[element.id]?.minW ?? 1"
        :max="100 - element.x"
        :value="element.width"
        class="w-full"
        @input="emit('update', { width: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>

    <!-- Height -->
    <div v-if="!hasLockedAspect">
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">{{ t('audioView.height') }}</label>
        <span class="text-[11px] font-mono text-primary tabular-nums">{{ element.height }}%</span>
      </div>
      <input
        type="range"
        :min="CONSTRAINTS[element.id]?.minH ?? 1"
        :max="100 - element.y"
        :value="element.height"
        class="w-full"
        @input="emit('update', { height: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>
    <!-- Height poz. aspekt zablokowany (16:9) -->
    <div v-else>
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">{{ t('audioView.height') }}</label>
        <span class="text-[11px] font-mono text-primary tabular-nums">
          {{ element.height }}% · 16:9
        </span>
      </div>
      <p class="text-[10px] text-base-content/40">{{ t('audioView.coverAspectLocked') }}</p>
    </div>

    <!-- Opacity -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">{{ t('audioView.opacity') }}</label>
        <span class="text-[11px] font-mono text-primary tabular-nums"
          >{{ element.opacity ?? 100 }}%</span
        >
      </div>
      <input
        type="range"
        min="0"
        max="100"
        :value="element.opacity ?? 100"
        class="w-full"
        @input="emit('update', { opacity: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>

    <!-- Layer -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">{{ t('audioView.layer') }}</label>
        <span class="text-[11px] font-mono text-primary tabular-nums">{{ element.layer }}</span>
      </div>
      <input
        type="range"
        min="1"
        max="5"
        :value="element.layer"
        class="w-full"
        @input="emit('update', { layer: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>

    <!-- Background -->
    <div class="flex items-center justify-between pt-1">
      <span class="text-[11px] text-base-content/50">{{ t('audioView.elementBg') }}</span>
      <button
        class="relative w-9 h-5 rounded-full border transition-colors"
        :class="
          element.bg ? 'bg-primary border-primary/50' : 'bg-base-content/10 border-base-content/30'
        "
        :title="element.bg ? t('audioView.showElement') : t('audioView.hideElement')"
        @click="emit('update', { bg: !element.bg })"
      >
        <span
          class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-all shadow"
          :class="element.bg ? 'translate-x-4 bg-white' : 'bg-base-content/60'"
        />
      </button>
    </div>
    <div v-if="element.bg">
      <div class="flex items-center justify-between mb-1">
        <label class="text-[11px] text-base-content/50">{{
          t('audioView.elementBgOpacity')
        }}</label>
        <span class="text-[11px] font-mono text-primary tabular-nums">
          {{ element.bgOpacity ?? 40 }}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        :value="element.bgOpacity ?? 40"
        class="w-full"
        @input="emit('update', { bgOpacity: Number(($event.target as HTMLInputElement).value) })"
      />
    </div>
  </div>
</template>
