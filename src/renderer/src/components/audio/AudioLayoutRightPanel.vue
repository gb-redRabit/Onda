<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, EyeOff, GripVertical } from '@lucide/vue';
import { usePluginsStore } from '@renderer/stores/plugins';
import {
  ELEMENT_META,
  PRESET_ICONS,
  PRESET_KEYS,
  SUBTAB_KEYS,
  TABS,
  VARIANT_DEFAULT,
  VARIANT_KEYS,
  type RightTab
} from '@renderer/utils/audioLayoutEditorMeta';
import { decorationOptionsFor } from '@renderer/utils/audioLayoutDecorations';
import AudioLayoutPositionTab from './AudioLayoutPositionTab.vue';
import type {
  AudioLayoutElement,
  AudioLayoutElementId,
  AudioLayoutPreset
} from '@renderer/types/settings';

const props = defineProps<{
  elements: AudioLayoutElement[];
  selected?: AudioLayoutElement;
  selectedId: AudioLayoutElementId;
  currentPreset: AudioLayoutPreset;
}>();

const emit = defineEmits<{
  select: [id: AudioLayoutElementId];
  update: [id: AudioLayoutElementId, patch: Partial<AudioLayoutElement>];
  applyPreset: [preset: AudioLayoutPreset];
}>();

const { t } = useI18n();
const pluginsStore = usePluginsStore();
const rightTab = ref<RightTab>('elements');

// Plugin-only decorations for the selected element (empty when no active plugin
// declares variants — the section is then hidden).
const decorationOptions = computed(() =>
  props.selected ? decorationOptionsFor(props.selected.id, pluginsStore.layoutVariants, t) : []
);
</script>

<template>
  <div class="w-64 shrink-0 flex flex-col gap-3 relative z-[60]">
    <!-- Presets -->
    <div>
      <div class="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 mb-2">
        {{ t('audioView.layoutEditor') }}
      </div>
      <div class="flex gap-1">
        <button
          v-for="key in PRESET_KEYS"
          :key="key"
          class="fx-noise flex-1 flex flex-col items-center gap-0.5 px-1 py-1.5 fx-depth rounded-field text-[10px] font-medium transition-all border"
          :class="
            props.currentPreset === key
              ? 'bg-primary/15 text-primary border-primary/30'
              : 'bg-base-300/60 text-base-content/60 border-transparent hover:bg-base-content/10 hover:text-base-content'
          "
          :title="t(`audioView.preset${key.charAt(0).toUpperCase() + key.slice(1)}`)"
          @click="emit('applyPreset', key)"
        >
          <component :is="PRESET_ICONS[key]" :size="14" />
          <span class="truncate w-full text-center">{{
            t(`audioView.preset${key.charAt(0).toUpperCase() + key.slice(1)}`)
          }}</span>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-0.5 p-0.5 rounded-field bg-base-300/50">
      <button
        v-for="tab in TABS"
        :key="tab"
        class="flex-1 px-2 py-1.5 rounded-field text-[10px] font-semibold uppercase tracking-wider transition-colors"
        :class="
          rightTab === tab
            ? 'bg-primary/15 text-primary'
            : 'text-base-content/50 hover:text-base-content hover:bg-base-content/10'
        "
        @click="rightTab = tab"
      >
        {{ t('audioView.' + SUBTAB_KEYS[tab]) }}
      </button>
    </div>

    <div class="flex flex-col gap-3 flex-1 min-h-0 overflow-auto">
      <!-- Element list -->
      <div v-if="rightTab === 'elements'" class="flex flex-col gap-1">
        <div
          v-for="el in props.elements"
          :key="el.id"
          class="flex items-center gap-2 px-2.5 py-2 rounded-field text-left transition-all text-xs cursor-pointer"
          :class="
            el.id === props.selectedId
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-base-content/70 hover:bg-base-content/10 border border-transparent'
          "
          @click="emit('select', el.id)"
        >
          <GripVertical :size="12" class="opacity-30 shrink-0" />
          <component :is="ELEMENT_META[el.id].icon" :size="14" class="shrink-0" />
          <span class="flex-1 truncate">{{ t(ELEMENT_META[el.id].labelKey) }}</span>
          <button
            class="p-0.5 rounded hover:bg-base-content/10 transition-colors"
            :title="el.visible ? t('audioView.hideElement') : t('audioView.showElement')"
            @click.stop="emit('update', el.id, { visible: !el.visible })"
          >
            <EyeOff v-if="el.visible" :size="12" class="text-base-content/50" />
            <Eye v-else :size="12" class="text-base-content/30" />
          </button>
        </div>
      </div>

      <!-- Variant tab -->
      <div v-else-if="rightTab === 'variant' && props.selected" class="flex flex-col gap-2">
        <div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wider">
          {{ t(ELEMENT_META[props.selected.id].labelKey) }}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="v in VARIANT_KEYS[props.selected.id]"
            :key="v.value"
            class="px-2.5 py-1.5 rounded-field text-[11px] font-medium border transition-colors"
            :class="
              (props.selected.variant ?? VARIANT_DEFAULT[props.selected.id]) === v.value
                ? 'bg-primary/15 text-primary border-primary/40'
                : 'bg-base-300/60 text-base-content/60 border-transparent hover:bg-base-content/10 hover:text-base-content'
            "
            @click="emit('update', props.selected.id, { variant: v.value })"
          >
            {{ t('audioView.' + v.key) }}
          </button>
        </div>
        <p
          v-if="props.selected.id === 'visualization'"
          class="text-[10px] text-base-content/40 leading-relaxed"
        >
          {{ t('audioView.variantVizHint') }}
        </p>

        <!-- Dekoracje (tylko z wtyczek) -->
        <div v-if="decorationOptions.length" class="mt-3 pt-3 border-t border-base-300/60">
          <div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wider mb-2">
            {{ t('audioView.decorationLabel') }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="opt in decorationOptions"
              :key="opt.value"
              class="px-2.5 py-1.5 rounded-field text-[11px] font-medium border transition-colors"
              :class="
                (props.selected.decoration ?? 'none') === opt.value
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-base-300/60 text-base-content/60 border-transparent hover:bg-base-content/10 hover:text-base-content'
              "
              @click="emit('update', props.selected.id, { decoration: opt.value })"
            >
              {{ opt.label }}<template v-if="opt.plugin"> · {{ opt.plugin }}</template>
            </button>
          </div>
          <p class="text-[10px] text-base-content/40 leading-relaxed">
            {{ t('audioView.decorationHint') }}
          </p>
        </div>
      </div>

      <!-- Layout tab -->
      <AudioLayoutPositionTab
        v-else-if="rightTab === 'layout'"
        :element="props.selected"
        @update="(patch) => props.selected && emit('update', props.selected.id, patch)"
      />
    </div>
  </div>
</template>
