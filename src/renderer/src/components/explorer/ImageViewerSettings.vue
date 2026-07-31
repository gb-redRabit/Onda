<script setup lang="ts">
import { Clock, GripHorizontal, Repeat, Shuffle, Maximize2 } from '@lucide/vue';

const SLIDESHOW_INTERVALS = [1000, 2000, 3000, 5000, 10000] as const;
const TRANSITION_TYPES = [
  'fade',
  'slide',
  'zoom',
  'swirl',
  'slideUp',
  'slideDown',
  'zoomOut',
  'random'
] as const;
const TRANSITION_DURATIONS = [200, 400, 500, 600, 800, 1000] as const;

defineProps<{
  interval: number;
  transitionType: string;
  transitionDuration: number;
  loop: boolean;
  shuffle: boolean;
  kenBurns: boolean;
  autoHide: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:interval', ms: number): void;
  (e: 'update:transitionType', type: string): void;
  (e: 'update:transitionDuration', ms: number): void;
  (e: 'update:loop', val: boolean): void;
  (e: 'update:shuffle', val: boolean): void;
  (e: 'update:kenBurns', val: boolean): void;
  (e: 'update:autoHide', val: boolean): void;
}>();
</script>

<template>
  <div
    class="absolute right-full mr-2 top-0 bg-bg-elevated border border-border-default rounded-lg shadow-xl p-3 min-w-55 z-20"
    @click.stop
  >
    <div class="text-xs font-semibold text-fg-base mb-2 tracking-wide uppercase">Slideshow</div>

    <div class="text-[11px] text-fg-muted mb-1 flex items-center gap-1">
      <Clock :size="11" class="pointer-events-none" /> Interval
    </div>
    <div class="flex flex-wrap gap-1 mb-2">
      <button
        v-for="ms in SLIDESHOW_INTERVALS"
        :key="ms"
        class="px-2 py-1 text-xs rounded-md transition-colors"
        :class="
          interval === ms
            ? 'bg-accent-base text-white'
            : 'bg-bg-hover text-fg-muted hover:text-fg-base'
        "
        @click="emit('update:interval', ms)"
      >
        {{ ms / 1000 + 's' }}
      </button>
    </div>

    <div class="text-[11px] text-fg-muted mb-1 flex items-center gap-1">
      <GripHorizontal :size="11" class="pointer-events-none" /> Transition
    </div>
    <div class="flex flex-wrap gap-1 mb-2">
      <button
        v-for="type in TRANSITION_TYPES"
        :key="type"
        class="px-2 py-1 text-xs rounded-md capitalize transition-colors"
        :class="
          transitionType === type
            ? 'bg-accent-base text-white'
            : 'bg-bg-hover text-fg-muted hover:text-fg-base'
        "
        @click="emit('update:transitionType', type)"
      >
        {{ type }}
      </button>
    </div>

    <div class="text-[11px] text-fg-muted mb-1 flex items-center gap-1">
      <Clock :size="11" class="pointer-events-none" /> Duration
    </div>
    <div class="flex flex-wrap gap-1 mb-2">
      <button
        v-for="d in TRANSITION_DURATIONS"
        :key="d"
        class="px-2 py-1 text-xs rounded-md transition-colors"
        :class="
          transitionDuration === d
            ? 'bg-accent-base text-white'
            : 'bg-bg-hover text-fg-muted hover:text-fg-base'
        "
        @click="emit('update:transitionDuration', d)"
      >
        {{ d }}ms
      </button>
    </div>

    <div class="flex items-center justify-between mb-1">
      <div class="text-[11px] text-fg-muted flex items-center gap-1">
        <Repeat :size="11" class="pointer-events-none" /> Loop
      </div>
      <button
        class="w-7 h-4 rounded-full transition-colors relative"
        :class="loop ? 'bg-accent-base' : 'bg-bg-hover'"
        @click="emit('update:loop', !loop)"
      >
        <div
          class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          :class="loop ? 'translate-x-3.5' : 'translate-x-0.5'"
        />
      </button>
    </div>

    <div class="flex items-center justify-between mb-1">
      <div class="text-[11px] text-fg-muted flex items-center gap-1">
        <Shuffle :size="11" class="pointer-events-none" /> Shuffle
      </div>
      <button
        class="w-7 h-4 rounded-full transition-colors relative"
        :class="shuffle ? 'bg-accent-base' : 'bg-bg-hover'"
        @click="emit('update:shuffle', !shuffle)"
      >
        <div
          class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          :class="shuffle ? 'translate-x-3.5' : 'translate-x-0.5'"
        />
      </button>
    </div>

    <div class="flex items-center justify-between mb-1">
      <div class="text-[11px] text-fg-muted flex items-center gap-1">
        <Maximize2 :size="11" class="pointer-events-none" /> Ken Burns
      </div>
      <button
        class="w-7 h-4 rounded-full transition-colors relative"
        :class="kenBurns ? 'bg-accent-base' : 'bg-bg-hover'"
        @click="emit('update:kenBurns', !kenBurns)"
      >
        <div
          class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          :class="kenBurns ? 'translate-x-3.5' : 'translate-x-0.5'"
        />
      </button>
    </div>

    <div class="border-t border-border-default/20 my-2" />

    <div class="flex items-center justify-between">
      <div class="text-[11px] text-fg-muted flex items-center gap-1">
        <Maximize2 :size="11" class="pointer-events-none" /> Auto-hide
      </div>
      <button
        class="w-7 h-4 rounded-full transition-colors relative"
        :class="autoHide ? 'bg-accent-base' : 'bg-bg-hover'"
        @click="emit('update:autoHide', !autoHide)"
      >
        <div
          class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
          :class="autoHide ? 'translate-x-3.5' : 'translate-x-0.5'"
        />
      </button>
    </div>

    <div class="text-[10px] text-fg-muted/60 mt-1.5 leading-relaxed">
      <span class="text-fg-muted/80 font-semibold">H</span> toggle UI &middot;
      <span class="text-fg-muted/80 font-semibold">Space</span> stop
    </div>
  </div>
</template>
