<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
import { usePluginsStore, ELEMENT_DECORATIONS } from '@renderer/stores/plugins';
import type { AudioLayoutElement, AudioLayoutElementId, AudioLayoutPreset } from '@renderer/types/settings';

const { t } = useI18n();
const settings = useSettingsStore();
const pluginsStore = usePluginsStore();

function pluginDecorationOptions(
  elementId: AudioLayoutElementId
): { value: string; label: string; plugin?: string }[] {
  const builtin = (ELEMENT_DECORATIONS[elementId] || []).map((value) => ({ value, label: t('audioView.decoration_' + elementId + '_' + value) }));
  const plugin = (pluginsStore.layoutVariants[elementId] || []).map((v) => ({
    value: v.value,
    label: v.label,
    plugin: v.plugin
  }));
  return [...builtin, ...plugin];
}

const PREVIEW_W = 480;
const PREVIEW_H = 320;

const selectedId = ref<AudioLayoutElementId>('cover');
const draggingId = ref<AudioLayoutElementId | null>(null);
const grabOffsetPct = ref({ x: 0, y: 0 });
const dragPreview = ref<{ x: number; y: number } | null>(null);
const guides = ref<{ x?: number; y?: number }>({});
type RightTab = 'elements' | 'variant' | 'layout';
const rightTab = ref<RightTab>('elements');

const elements = computed({
  get: () => settings.appearance.audioLayout?.elements ?? [],
  set: (v: AudioLayoutElement[]) => {
    settings.updateAudioLayoutElements(v);
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
  settings.applyAudioLayoutPreset(preset);
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

// ─── Warianty (presety per typ) ───
const VARIANT_KEYS: Record<AudioLayoutElementId, { value: string; key: string }[]> = {
  visualization: [{ value: 'default', key: 'variant_visualization_default' }],
  cover: [
    { value: 'default', key: 'variant_cover_default' },
    { value: 'rounded', key: 'variant_cover_rounded' },
    { value: 'ring', key: 'variant_cover_ring' },
    { value: 'glass', key: 'variant_cover_glass' }
  ],
  trackInfo: [
    { value: 'classic', key: 'variant_trackInfo_classic' },
    { value: 'minimal', key: 'variant_trackInfo_minimal' },
    { value: 'large', key: 'variant_trackInfo_large' }
  ],
  progress: [
    { value: 'classic', key: 'variant_progress_classic' },
    { value: 'thin', key: 'variant_progress_thin' },
    { value: 'neon', key: 'variant_progress_neon' }
  ],
  controls: [
    { value: 'standard', key: 'variant_controls_standard' },
    { value: 'compact', key: 'variant_controls_compact' }
  ]
};

const VARIANT_DEFAULT: Record<AudioLayoutElementId, string> = {
  visualization: 'default',
  cover: 'default',
  trackInfo: 'classic',
  progress: 'classic',
  controls: 'standard'
};

const SUBTAB_KEYS: Record<RightTab, string> = {
  elements: 'tabElements',
  variant: 'tabVariant',
  layout: 'tabLayout'
};

const TABS: RightTab[] = ['elements', 'variant', 'layout'];

// ─── Ograniczenia per typ (sensowne rozmiary) ───
const CONSTRAINTS: Record<
  AudioLayoutElementId,
  { minW?: number; minH?: number; maxH?: number; aspect?: number }
> = {
  visualization: { minW: 10, minH: 10 },
  cover: { minW: 15, aspect: 16 / 9 },
  progress: { minW: 20, minH: 2, maxH: 20 },
  controls: { minW: 30, minH: 6, maxH: 25 },
  trackInfo: { minW: 25, minH: 6 }
};

// height% -> width% tak, aby na kontenerze PREVIEW_W×PREVIEW_H krawędzie były w proporcji 16:9.
// h = w * (PREVIEW_W/PREVIEW_H) * (9/16)
const COVER_H_FACTOR = (PREVIEW_W / PREVIEW_H) * (9 / 16);

function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function sanitizeElement(el: AudioLayoutElement): AudioLayoutElement {
  const c = CONSTRAINTS[el.id] ?? {};
  const minW = c.minW ?? 1;
  const minH = c.minH ?? 1;
  let width = clampNum(el.width, minW, 100);
  let height = clampNum(el.height, minH, c.maxH ?? 100);
  if (typeof c.aspect === 'number') {
    height = clampNum(Math.round(width * COVER_H_FACTOR * 100) / 100, minH, 100);
  }
  const x = clampNum(el.x, 0, 100 - width);
  const y = clampNum(el.y, 0, 100 - height);
  return { ...el, x, y, width, height };
}

function layoutStyle(el: AudioLayoutElement) {
  const isDragging = draggingId.value === el.id && dragPreview.value;
  const x = isDragging ? dragPreview.value!.x : el.x;
  const y = isDragging ? dragPreview.value!.y : el.y;
  const style: Record<string, string> = {
    left: x + '%',
    top: y + '%',
    width: el.width + '%',
    height: el.height + '%',
    opacity: String((el.opacity ?? 100) / 100)
  };
  const bgOpacity = el.bgOpacity ?? 40;
  if (el.bg && bgOpacity > 0) {
    style.backgroundColor = `color-mix(in srgb, var(--color-base-300) ${bgOpacity}%, transparent)`;
  }
  return style;
}

// Zaokrąglanie do siatki 5% (Shift = precyzyjnie)
function snapToGrid(v: number, e: { shiftKey: boolean }) {
  return e.shiftKey ? v : Math.round(v / 5) * 5;
}

// Snap do krawędzi/ośrodków innych elementów i kontenera + linie prowadzące.
const SNAP_THRESHOLD = 2; // %

function snapWithGuides(
  candX: number,
  candY: number,
  el: AudioLayoutElement,
  e: { shiftKey: boolean }
): { x: number; y: number; guideX?: number; guideY?: number } {
  if (e.shiftKey) return { x: candX, y: candY };
  const w = el.width;
  const h = el.height;
  const refsX: number[] = [0, 50, 100];
  const refsY: number[] = [0, 50, 100];
  for (const o of elements.value) {
    if (o.id === el.id || !o.visible) continue;
    refsX.push(o.x, o.x + o.width / 2, o.x + o.width);
    refsY.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  let snappedX: number | undefined;
  let snappedY: number | undefined;
  let guideX: number | undefined;
  let guideY: number | undefined;
  let bestX = Infinity;
  let bestY = Infinity;
  for (const ref of refsX) {
    for (const off of [0, -w / 2, -w]) {
      const candidate = ref + off;
      const d = Math.abs(candidate - candX);
      if (d <= SNAP_THRESHOLD && d < bestX && candidate >= 0 && candidate <= 100 - w) {
        bestX = d;
        snappedX = candidate;
        guideX = ref;
      }
    }
  }
  for (const ref of refsY) {
    for (const off of [0, -h / 2, -h]) {
      const candidate = ref + off;
      const d = Math.abs(candidate - candY);
      if (d <= SNAP_THRESHOLD && d < bestY && candidate >= 0 && candidate <= 100 - h) {
        bestY = d;
        snappedY = candidate;
        guideY = ref;
      }
    }
  }
  return { x: snappedX ?? candX, y: snappedY ?? candY, guideX, guideY };
}

function updateElement(id: AudioLayoutElementId, patch: Partial<AudioLayoutElement>) {
  elements.value = elements.value.map((e) =>
    e.id === id ? sanitizeElement({ ...e, ...patch }) : e
  );
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
  const clampedX = Math.max(0, Math.min(100 - el.width, mouseInPctX - grabOffsetPct.value.x));
  const clampedY = Math.max(0, Math.min(100 - el.height, mouseInPctY - grabOffsetPct.value.y));
  const gridX = snapToGrid(clampedX, e);
  const gridY = snapToGrid(clampedY, e);
  const snapped = snapWithGuides(gridX, gridY, el, e);
  dragPreview.value = { x: snapped.x, y: snapped.y };
  guides.value = { x: snapped.guideX, y: snapped.guideY };
}

function onDragEnd() {
  if (draggingId.value && dragPreview.value) {
    updateElement(draggingId.value, { x: dragPreview.value.x, y: dragPreview.value.y });
  }
  draggingId.value = null;
  dragPreview.value = null;
  guides.value = {};
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
}

function onKeydown(e: KeyboardEvent) {
  if (!selected.value) return;
  const el = selected.value;
  const step = e.shiftKey ? 5 : 1;
  const maxX = 100 - el.width;
  const maxY = 100 - el.height;
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      updateElement(el.id, { x: Math.max(0, Math.min(maxX, Math.round(el.x - step))) });
      break;
    case 'ArrowRight':
      e.preventDefault();
      updateElement(el.id, { x: Math.max(0, Math.min(maxX, Math.round(el.x + step))) });
      break;
    case 'ArrowUp':
      e.preventDefault();
      updateElement(el.id, { y: Math.max(0, Math.min(maxY, Math.round(el.y - step))) });
      break;
    case 'ArrowDown':
      e.preventDefault();
      updateElement(el.id, { y: Math.max(0, Math.min(maxY, Math.round(el.y + step))) });
      break;
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));

function resetLayout() {
  settings.resetAudioLayoutPreset();
}

const sortedElements = computed(() => {
  return [...elements.value].sort((a, b) => a.layer - b.layer);
});

const readout = computed(() => {
  const id = draggingId.value ?? selectedId.value;
  const el = elements.value.find((e) => e.id === id);
  if (!el) return '';
  const x = dragPreview.value?.x ?? el.x;
  const y = dragPreview.value?.y ?? el.y;
  return `${Math.round(x)}%, ${Math.round(y)}% · ${el.width}×${el.height} · L${el.layer}`;
});

const hasLockedAspect = computed(
  () => typeof CONSTRAINTS[selected.value?.id ?? 'visualization']?.aspect === 'number'
);
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
        <!-- Grid (1% + 5%) -->
        <svg class="absolute inset-0 w-full h-full pointer-events-none">
          <defs>
            <pattern id="grid-1p" :width="PREVIEW_W / 100" :height="PREVIEW_H / 100" patternUnits="userSpaceOnUse">
              <rect width="1" height="1" fill="white" fill-opacity="0.05" />
            </pattern>
            <pattern id="grid-5p" :width="PREVIEW_W / 20" :height="PREVIEW_H / 20" patternUnits="userSpaceOnUse">
              <path
                :d="`M ${PREVIEW_W / 20} 0 L 0 0 L 0 ${PREVIEW_H / 20}`"
                fill="none"
                stroke="white"
                stroke-opacity="0.12"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-1p)" />
          <rect width="100%" height="100%" fill="url(#grid-5p)" />
        </svg>

        <!-- Linee prowadzące (snap) -->
        <div
          v-if="guides.x != null"
          class="absolute inset-y-0 w-px bg-primary/90 pointer-events-none z-30"
          :style="{ left: guides.x + '%' }"
        />
        <div
          v-if="guides.y != null"
          class="absolute inset-x-0 h-px bg-primary/90 pointer-events-none z-30"
          :style="{ top: guides.y + '%' }"
        />

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
          :style="layoutStyle(el)"
          @mousedown="onDragStart(el.id, $event)"
          @click.stop="selectedId = el.id"
        >
          <component :is="ELEMENT_META[el.id].icon" :size="14" class="opacity-40" />
        </div>
      </div>

      <!-- Readout: pozycja/size aktywnego elementu -->
      <div
        class="mt-2 flex items-center justify-between px-1 text-[10px] font-mono text-base-content/50 tabular-nums"
      >
        <span class="flex items-center gap-1.5">
          <component :is="ELEMENT_META[selectedId].icon" :size="11" class="opacity-50" />
          {{ t(ELEMENT_META[selectedId].labelKey) }}
        </span>
        <span>{{ readout }}</span>
      </div>
    </div>

    <!-- ─── Right: Element Controls ─── -->
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

      <!-- Variant tab -->
      <div v-else-if="rightTab === 'variant' && selected" class="flex flex-col gap-2">
        <div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wider">
          {{ t(ELEMENT_META[selected.id].labelKey) }}
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="v in VARIANT_KEYS[selected.id]"
            :key="v.value"
            class="px-2.5 py-1.5 rounded-field text-[11px] font-medium border transition-colors"
            :class="
              (selected.variant ?? VARIANT_DEFAULT[selected.id]) === v.value
                ? 'bg-primary/15 text-primary border-primary/40'
                : 'bg-base-300/60 text-base-content/60 border-transparent hover:bg-base-content/10 hover:text-base-content'
            "
            @click="updateElement(selected.id, { variant: v.value })"
          >
            {{ t('audioView.' + v.key) }}
          </button>
        </div>
        <p v-if="selected.id === 'visualization'" class="text-[10px] text-base-content/40 leading-relaxed">
          {{ t('audioView.variantVizHint') }}
        </p>

        <!-- Dekoracje (nadawane przez wtyczki / wybór w hostingu) -->
        <div class="mt-3 pt-3 border-t border-base-300/60">
          <div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wider mb-2">
            {{ t('audioView.decorationLabel') }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="opt in pluginDecorationOptions(selected.id)"
              :key="opt.value"
              class="px-2.5 py-1.5 rounded-field text-[11px] font-medium border transition-colors"
              :class="
                (selected.decoration ?? 'none') === opt.value
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-base-300/60 text-base-content/60 border-transparent hover:bg-base-content/10 hover:text-base-content'
              "
              @click="updateElement(selected.id, { decoration: opt.value })"
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
      <div v-else-if="rightTab === 'layout' && selected" class="flex flex-col gap-3 pt-2 border-t border-base-300">
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
            :min="CONSTRAINTS[selected.id]?.minW ?? 1"
            :max="100 - selected.x"
            :value="selected.width"
            class="w-full"
            @input="updateElement(selected.id, { width: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>

        <!-- Height -->
        <div v-if="!hasLockedAspect">
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">{{ t('audioView.height') }}</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">{{ selected.height }}%</span>
          </div>
          <input
            type="range"
            :min="CONSTRAINTS[selected.id]?.minH ?? 1"
            :max="100 - selected.y"
            :value="selected.height"
            class="w-full"
            @input="updateElement(selected.id, { height: Number(($event.target as HTMLInputElement).value) })"
          />
        </div>
        <!-- Height poz. aspekt zablokowany (16:9) -->
        <div v-else>
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">{{ t('audioView.height') }}</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">
              {{ selected.height }}% · 16:9
            </span>
          </div>
          <p class="text-[10px] text-base-content/40">{{ t('audioView.coverAspectLocked') }}</p>
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

        <!-- Background -->
        <div class="flex items-center justify-between pt-1">
          <span class="text-[11px] text-base-content/50">{{ t('audioView.elementBg') }}</span>
          <button
            class="relative w-9 h-5 rounded-full border transition-colors"
            :class="
              selected.bg ? 'bg-primary border-primary/50' : 'bg-base-content/10 border-base-content/30'
            "
            :title="selected.bg ? t('audioView.showElement') : t('audioView.hideElement')"
            @click="updateElement(selected.id, { bg: !selected.bg })"
          >
            <span
              class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-all shadow"
              :class="selected.bg ? 'translate-x-4 bg-white' : 'bg-base-content/60'"
            />
          </button>
        </div>
        <div v-if="selected.bg">
          <div class="flex items-center justify-between mb-1">
            <label class="text-[11px] text-base-content/50">{{ t('audioView.elementBgOpacity') }}</label>
            <span class="text-[11px] font-mono text-primary tabular-nums">
              {{ selected.bgOpacity ?? 40 }}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            :value="selected.bgOpacity ?? 40"
            class="w-full"
            @input="
              updateElement(selected.id, {
                bgOpacity: Number(($event.target as HTMLInputElement).value)
              })
            "
          />
        </div>
      </div>
      </div>
    </div>
  </div>
</template>
