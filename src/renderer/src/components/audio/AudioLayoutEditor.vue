<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Eye,
  EyeOff,
  RotateCcw,
  GripVertical,
  Music2,
  Disc3,
  Play,
  ListMusic,
  SlidersHorizontal,
  LayoutPanelLeft,
  AlignVerticalSpaceAround,
  Columns2,
  Maximize,
  Orbit
} from '@lucide/vue';
import { useSettingsStore } from '@renderer/stores/settings';
import { AUDIO_LAYOUT_PRESETS } from '@renderer/utils/constants';
import type { AudioLayoutElement, AudioLayoutElementId, AudioLayoutPreset } from '@renderer/types/settings';

const { t } = useI18n();
const settings = useSettingsStore();

const PREVIEW_W = 480;
const PREVIEW_H = 320;

const selectedId = ref<AudioLayoutElementId>('cover');
const draggingId = ref<AudioLayoutElementId | null>(null);
const grabOffsetPct = ref({ x: 0, y: 0 });

const elements = computed({
  get: () => settings.appearance.audioLayout?.elements ?? [],
  set: (v: AudioLayoutElement[]) => {
    settings.updateAppearance({ audioLayout: { elements: v } });
  }
});

const selected = computed(() => elements.value.find((e) => e.id === selectedId.value));
const currentPreset = computed(() => settings.appearance.audioLayout?.preset ?? 'full');

const PRESET_ICONS: Record<AudioLayoutPreset, typeof LayoutPanelLeft> = {
  compact: LayoutPanelLeft,
  stacked: AlignVerticalSpaceAround,
  split: Columns2,
  full: Maximize,
  immersive: Orbit
};

const PRESET_KEYS: AudioLayoutPreset[] = ['compact', 'stacked', 'split', 'full', 'immersive'];

function applyPreset(preset: AudioLayoutPreset) {
  const p = AUDIO_LAYOUT_PRESETS[preset];
  if (!p) return;
  settings.updateAppearance({
    audioLayout: {
      ...settings.appearance.audioLayout,
      preset,
      elements: p.elements.map((el) => ({ ...el }))
    }
  });
}

const ELEMENT_META: Record<
  AudioLayoutElementId,
  { icon: typeof Music2; labelKey: string; defaultLayer: number }
> = {
  visualization: { icon: Music2, labelKey: 'audioView.elementVisualization', defaultLayer: 1 },
  cover: { icon: Disc3, labelKey: 'audioView.elementCover', defaultLayer: 2 },
  trackInfo: { icon: ListMusic, labelKey: 'audioView.elementTrackInfo', defaultLayer: 3 },
  progress: { icon: Play, labelKey: 'audioView.elementProgress', defaultLayer: 3 },
  controls: { icon: SlidersHorizontal, labelKey: 'audioView.elementControls', defaultLayer: 5 }
};

function toPreview(px: number, py: number, pw: number, ph: number) {
  return {
    left: px + '%',
    top: py + '%',
    width: pw + '%',
    height: ph + '%'
  };
}

function updateElement(id: AudioLayoutElementId, patch: Partial<AudioLayoutElement>) {
  elements.value = elements.value.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

function onDragStart(id: AudioLayoutElementId, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  selectedId.value = id;
  draggingId.value = id;
  const el = elements.value.find((el) => el.id === id);
  if (!el) return;
  const container = document.getElementById('audio-layout-preview');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const mouseInPctX = ((e.clientX - rect.left) / rect.width) * 100;
  const mouseInPctY = ((e.clientY - rect.top) / rect.height) * 100;
  grabOffsetPct.value = { x: mouseInPctX - el.x, y: mouseInPctY - el.y };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e: MouseEvent) {
  if (!draggingId.value) return;
  const container = document.getElementById('audio-layout-preview');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const mouseInPctX = ((e.clientX - rect.left) / rect.width) * 100;
  const mouseInPctY = ((e.clientY - rect.top) / rect.height) * 100;
  const el = elements.value.find((el) => el.id === draggingId.value);
  if (!el) return;
  const newX = Math.max(0, Math.min(100 - el.width, mouseInPctX - grabOffsetPct.value.x));
  const newY = Math.max(0, Math.min(100 - el.height, mouseInPctY - grabOffsetPct.value.y));
  updateElement(draggingId.value, { x: newX, y: newY });
}

function onDragEnd() {
  draggingId.value = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
}

function resetLayout() {
  elements.value = [
    { id: 'visualization', x: 0, y: 0, width: 100, height: 100, opacity: 100, layer: 1, visible: true },
    { id: 'cover', x: 25, y: 15, width: 50, height: 55, opacity: 100, layer: 2, visible: true },
    { id: 'trackInfo', x: 20, y: 73, width: 60, height: 8, opacity: 100, layer: 3, visible: true },
    { id: 'progress', x: 20, y: 83, width: 60, height: 5, opacity: 100, layer: 3, visible: true },
    { id: 'controls', x: 20, y: 90, width: 60, height: 10, opacity: 100, layer: 5, visible: true }
  ];
}

const sortedElements = computed(() => {
  return [...elements.value].sort((a, b) => a.layer - b.layer);
});
</script>

<template>
  <div class="flex gap-4 h-full min-h-0">
    <!-- ─── Left: Mini Preview ─── -->
    <div class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-base-content">{{ t('audioView.layoutPreview') }}</h3>
        <button
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-field text-[11px] text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors"
          @click="resetLayout"
        >
          <RotateCcw :size="12" />
          {{ t('audioView.resetLayout') }}
        </button>
      </div>
      <div
        id="audio-layout-preview"
        class="relative z-0 isolate bg-base-300/50 rounded-box border border-base-300 overflow-hidden select-none"
        :style="{ aspectRatio: `${PREVIEW_W}/${PREVIEW_H}` }"
      >
        <!-- Grid (1%) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <pattern id="grid-1p" :width="PREVIEW_W / 100" :height="PREVIEW_H / 100" patternUnits="userSpaceOnUse">
              <rect width="1" height="1" fill="white" fill-opacity="0.06" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-1p)" />
        </svg>

        <!-- Elements -->
        <div
          v-for="el in sortedElements"
          v-show="el.visible"
          :key="el.id"
          class="absolute flex items-center justify-center text-[10px] font-medium rounded-field border-2 cursor-move"
          :class="[
            el.id === selectedId
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-base-content/20 bg-base-content/5 text-base-content/50',
            draggingId === el.id ? 'opacity-80' : 'transition-colors transition-opacity'
          ]"
          :style="{
            left: toPreview(el.x, el.y, el.width, el.height).left,
            top: toPreview(el.x, el.y, el.width, el.height).top,
            width: toPreview(el.x, el.y, el.width, el.height).width,
            height: toPreview(el.x, el.y, el.width, el.height).height,
            opacity: (el.opacity ?? 100) / 100
          }"
          @mousedown="onDragStart(el.id, $event)"
          @click.stop="selectedId = el.id"
        >
          <component :is="ELEMENT_META[el.id].icon" :size="14" class="opacity-40" />
        </div>
      </div>
    </div>

    <!-- ─── Right: Element Controls ─── -->
    <div class="w-64 shrink-0 flex flex-col gap-3 overflow-auto relative z-[60]">
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
              currentPreset === key
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-base-300/60 text-base-content/60 border-transparent hover:bg-base-content/10 hover:text-base-content'
            "
            :title="t(`audioView.preset${key.charAt(0).toUpperCase() + key.slice(1)}`)"
            @click="applyPreset(key)"
          >
            <component :is="PRESET_ICONS[key]" :size="14" />
            <span class="truncate w-full text-center">{{ t(`audioView.preset${key.charAt(0).toUpperCase() + key.slice(1)}`) }}</span>
          </button>
        </div>
      </div>

      <!-- Element list -->
      <div class="flex flex-col gap-1">
        <div
          v-for="el in elements"
          :key="el.id"
          class="flex items-center gap-2 px-2.5 py-2 rounded-field text-left transition-all text-xs cursor-pointer"
          :class="
            el.id === selectedId
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-base-content/70 hover:bg-base-content/10 border border-transparent'
          "
          @click="selectedId = el.id"
        >
          <GripVertical :size="12" class="opacity-30 shrink-0" />
          <component :is="ELEMENT_META[el.id].icon" :size="14" class="shrink-0" />
          <span class="flex-1 truncate">{{ t(ELEMENT_META[el.id].labelKey) }}</span>
          <button
            class="p-0.5 rounded hover:bg-base-content/10 transition-colors"
            :title="el.visible ? t('audioView.hideElement') : t('audioView.showElement')"
            @click.stop="updateElement(el.id, { visible: !el.visible })"
          >
            <EyeOff v-if="el.visible" :size="12" class="text-base-content/50" />
            <Eye v-else :size="12" class="text-base-content/30" />
          </button>
        </div>
      </div>

      <!-- Selected element controls -->
      <div v-if="selected" class="flex flex-col gap-3 pt-2 border-t border-base-300">
        <div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wider">
          {{ t(ELEMENT_META[selected.id].labelKey) }}
        </div>

        <!-- X -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">X</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">{{ selected.x }}%</span>
          </div>
          <input
            type="range"
            min="0"
            :max="100 - selected.width"
            :value="selected.x"
            class="w-full"
            @input="updateElement(selected.id, { x: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>

        <!-- Y -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">Y</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">{{ selected.y }}%</span>
          </div>
          <input
            type="range"
            min="0"
            :max="100 - selected.height"
            :value="selected.y"
            class="w-full"
            @input="updateElement(selected.id, { y: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>

        <!-- Width -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">{{ t('audioView.width') }}</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">{{ selected.width }}%</span>
          </div>
          <input
            type="range"
            min="1"
            :max="100 - selected.x"
            :value="selected.width"
            class="w-full"
            @input="updateElement(selected.id, { width: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>

        <!-- Height -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">{{ t('audioView.height') }}</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">{{ selected.height }}%</span>
          </div>
          <input
            type="range"
            min="1"
            :max="100 - selected.y"
            :value="selected.height"
            class="w-full"
            @input="updateElement(selected.id, { height: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>

        <!-- Opacity -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">{{ t('audioView.opacity') }}</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">{{ selected.opacity ?? 100 }}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            :value="selected.opacity ?? 100"
            class="w-full"
            @input="updateElement(selected.id, { opacity: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>

        <!-- Layer -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">{{ t('audioView.layer') }}</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">{{ selected.layer }}</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            :value="selected.layer"
            class="w-full"
            @input="updateElement(selected.id, { layer: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
      </div>
    </div>
  </div>
</template>
