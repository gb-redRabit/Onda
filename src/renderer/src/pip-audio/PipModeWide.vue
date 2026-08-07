<script setup lang="ts">
import { EQ_PRESETS } from './usePipAudioState';

defineProps<{
  trackName: string;
  fmt: (s: number) => string;
  currentTime: number;
  duration: number;
  shuffle: boolean;
  repeat: 'none' | 'all' | 'one';
  isPlaying: boolean;
  eqPreset: string;
  volume: number;
  volPct: string;
  volLabel: string;
  send: (action: string) => void;
  selectEqPreset: (name: string) => void;
}>();

const emit = defineEmits<{ select: [name: string] }>();
</script>

<template>
  <div class="flex items-center h-full px-1.5 gap-1">
    <span class="text-[11px] font-medium truncate flex-1 min-w-0 text-fg-base">{{
      trackName
    }}</span>
    <div class="flex items-center gap-0.5 shrink-0">
      <button
        class="btn-pip w-4.5 h-4.5 text-[9px]"
        :class="{ 'text-accent-base!': shuffle }"
        @click="send('shuffle')"
      >
        &#x21C4;
      </button>
      <button class="btn-pip w-4.5 h-4.5" @click="send('prev')">&#x23EE;</button>
      <button class="btn-pip btn-play w-4.5 h-4.5" @click="send('playPause')">
        {{ isPlaying ? '\u23F8' : '\u25B6' }}
      </button>
      <button class="btn-pip w-4.5 h-4.5" @click="send('next')">&#x23ED;</button>
      <button
        class="btn-pip w-4.5 h-4.5 text-[9px]"
        :class="{ 'text-accent-base!': repeat !== 'none' }"
        @click="send('repeat')"
      >
        <span class="relative"
          >&#x21BB;<span
            v-if="repeat === 'one'"
            class="absolute inset-0 flex items-center justify-center text-[8px] font-bold"
            >1</span
          ></span
        >
      </button>
    </div>
    <div class="flex items-center gap-1.5 shrink-0 ml-1">
      <span class="text-[9px] text-fg-faint tabular-nums whitespace-nowrap">{{
        fmt(currentTime)
      }}</span>
      <span class="text-[9px] text-fg-faint opacity-40">/</span>
      <span class="text-[9px] text-fg-faint tabular-nums whitespace-nowrap">{{
        fmt(duration)
      }}</span>
    </div>
    <div class="flex items-center gap-1 shrink-0 ml-1">
      <span
        class="text-[8px] text-fg-muted cursor-pointer px-0.5 py-0.5 rounded hover:text-fg-base hover:bg-bg-hover"
        @click="send('mute')"
        >{{ volLabel }}</span
      >
      <input
        type="range"
        class="w-10 h-0.75"
        min="0"
        max="1"
        step="0.05"
        :value="volume"
        @input="emit('select', 'volume:' + ($event.target as HTMLInputElement).value)"
      />
      <span class="text-[9px] text-fg-faint min-w-5 text-right tabular-nums">{{ volPct }}</span>
    </div>
    <div class="flex items-center gap-0.5 shrink-0 ml-1">
      <button
        v-for="p in EQ_PRESETS.slice(0, 4)"
        :key="p.id"
        class="text-[8px] px-1 py-0.5 rounded transition-colors"
        :class="
          eqPreset === p.id
            ? 'bg-accent-base text-white'
            : 'text-fg-muted hover:text-fg-base hover:bg-bg-hover'
        "
        @click="selectEqPreset(p.id)"
      >
        {{ p.label }}
      </button>
    </div>
    <button
      class="btn-pip w-3.5 h-3.5 text-[8px] text-fg-faint ml-0.5"
      title="Cycle mode"
      @click="send('cycleMode')"
    >
      &#x229E;
    </button>
  </div>
</template>
