<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RotateCcw } from '@lucide/vue';
import { ELEMENT_META } from '@renderer/utils/audioLayoutEditorMeta';
import { useSettingsStore } from '@renderer/stores/settings';
import {
  PREVIEW_H,
  PREVIEW_W,
  sanitizeElement,
  snapToGrid,
  snapWithGuides
} from '@renderer/utils/audioLayout';
import { layoutEditorStyle } from '@renderer/utils/audioLayoutElementStyle';
import { mousePctInRect, clampDragTarget } from '@renderer/utils/audioLayoutDrag';
import AudioLayoutRightPanel from './AudioLayoutRightPanel.vue';
import type {
  AudioLayoutElement,
  AudioLayoutElementId,
  AudioLayoutPreset
} from '@renderer/types/settings';

const { t } = useI18n();
const settings = useSettingsStore();

const selectedId = ref<AudioLayoutElementId>('cover');
const draggingId = ref<AudioLayoutElementId | null>(null);
const grabOffsetPct = ref({ x: 0, y: 0 });
const dragPreview = ref<{ x: number; y: number } | null>(null);
const guides = ref<{ x?: number; y?: number }>({});

const elements = computed({
  get: () => settings.appearance.audioLayout?.elements ?? [],
  set: (v: AudioLayoutElement[]) => {
    settings.updateAudioLayoutElements(v);
  }
});

const selected = computed(() => elements.value.find((e) => e.id === selectedId.value));
const currentPreset = computed(() => settings.appearance.audioLayout?.preset ?? 'full');

function applyPreset(preset: AudioLayoutPreset) {
  settings.applyAudioLayoutPreset(preset);
}

function selectElement(id: AudioLayoutElementId) {
  selectedId.value = id;
}

function layoutStyle(el: AudioLayoutElement) {
  const isDragging = draggingId.value === el.id && !!dragPreview.value;
  return layoutEditorStyle(el, isDragging, dragPreview.value);
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
  const m = mousePctInRect(e, rect);
  grabOffsetPct.value = { x: m.x - el.x, y: m.y - el.y };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e: MouseEvent) {
  if (!draggingId.value) return;
  const container = document.getElementById('audio-layout-preview');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const el = elements.value.find((el) => el.id === draggingId.value);
  if (!el) return;
  const { x: clampedX, y: clampedY } = clampDragTarget(
    mousePctInRect(e, rect),
    el,
    grabOffsetPct.value
  );
  const gridX = snapToGrid(clampedX, e);
  const gridY = snapToGrid(clampedY, e);
  const snapped = snapWithGuides(gridX, gridY, el, e, elements.value);
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
            <pattern
              id="grid-1p"
              :width="PREVIEW_W / 100"
              :height="PREVIEW_H / 100"
              patternUnits="userSpaceOnUse"
            >
              <rect width="1" height="1" fill="white" fill-opacity="0.05" />
            </pattern>
            <pattern
              id="grid-5p"
              :width="PREVIEW_W / 20"
              :height="PREVIEW_H / 20"
              patternUnits="userSpaceOnUse"
            >
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
    <AudioLayoutRightPanel
      :elements="elements"
      :selected="selected"
      :selected-id="selectedId"
      :current-preset="currentPreset"
      @select="selectElement"
      @update="updateElement"
      @apply-preset="applyPreset"
    />
  </div>
</template>
