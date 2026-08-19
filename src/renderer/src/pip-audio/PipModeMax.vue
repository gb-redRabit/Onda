<script setup lang="ts">
import { EQ_PRESETS } from './usePipAudioState';

defineProps<{
  isVideoCover: boolean;
  videoCoverSrc: string;
  coverData: string | null;
  trackName: string;
  artist: string;
  nextTrackName: string;
  nextTrackArtist: string;
  fmt: (s: number) => string;
  currentTime: number;
  duration: number;
  progressPct: number;
  shuffle: boolean;
  repeat: 'none' | 'all' | 'one';
  isPlaying: boolean;
  eqPreset: string;
  volume: number;
  volPct: string;
  volLabel: string;
  send: (action: string) => void;
  selectEqPreset: (name: string) => void;
  setCanvas: (el: unknown) => void;
}>();

const emit = defineEmits<{ select: [name: string]; seek: [e: MouseEvent] }>();
</script>

<template>
  <canvas
    :ref="setCanvas"
    class="absolute inset-0 z-0 w-full h-full pointer-events-none opacity-40"
  ></canvas>

  <div class="relative z-10 flex items-stretch h-full pr-12">
    <div class="flex items-center gap-2 pl-2.5 min-w-0 shrink-0">
      <video
        v-if="isVideoCover"
        :src="videoCoverSrc"
        class="w-17 h-17 rounded-lg object-cover block shrink-0"
        autoplay
        muted
        loop
        playsinline
      />
      <img
        v-else-if="coverData"
        :src="coverData"
        class="w-17 h-17 rounded-lg object-cover block shrink-0"
        alt=""
      />
      <div v-else class="w-17 h-17 rounded-lg bg-bg-hover shrink-0"></div>
      <div class="flex flex-col min-w-0 gap-0.5">
        <div class="text-[14px] font-semibold truncate text-fg-base max-w-44">
          {{ trackName }}
        </div>
        <div class="text-[11px] text-fg-faint truncate max-w-44">{{ artist }}</div>
        <div v-if="nextTrackName" class="text-[10px] text-fg-faint truncate max-w-44">
          &#x21B3; {{ nextTrackName }}{{ nextTrackArtist ? ' \u2014 ' + nextTrackArtist : '' }}
        </div>
      </div>
    </div>

    <div
      class="absolute inset-x-0 top-0 bottom-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none"
    >
      <div class="flex items-center gap-1.5 pointer-events-auto">
        <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{
          fmt(currentTime)
        }}</span>
        <span class="text-[10px] text-fg-faint opacity-40">/</span>
        <span class="text-[10px] text-fg-faint tabular-nums whitespace-nowrap">{{
          fmt(duration)
        }}</span>
      </div>
      <div class="flex items-center gap-1 pointer-events-auto">
        <button
          class="btn-pip w-5.5 h-5.5"
          :class="{ 'text-accent-base!': shuffle }"
          @click="send('shuffle')"
        >
          &#x21C4;
        </button>
        <button class="btn-pip w-5.5 h-5.5" @click="send('prev')">&#x23EE;</button>
        <button class="btn-pip btn-play w-5.5 h-5.5" @click="send('playPause')">
          {{ isPlaying ? '\u23F8' : '\u25B6' }}
        </button>
        <button class="btn-pip w-5.5 h-5.5" @click="send('next')">&#x23ED;</button>
        <button
          class="btn-pip w-5.5 h-5.5"
          :class="{ 'text-accent-base!': repeat !== 'none' }"
          @click="send('repeat')"
        >
          &#x21BB;<span v-if="repeat === 'one'" class="text-[8px] -ml-px">1</span>
        </button>
      </div>
    </div>

    <div class="flex flex-col items-end justify-center gap-1 pr-3 ml-auto shrink-0">
      <div class="flex items-center gap-1.5">
        <span
          class="text-[9px] text-fg-muted cursor-pointer px-0.5 py-0.5 rounded hover:text-fg-base hover:bg-bg-hover"
          @click="send('mute')"
          >{{ volLabel }}</span
        >
        <input
          type="range"
          class="w-13.5 h-0.75"
          min="0"
          max="1"
          step="0.05"
          :value="volume"
          @input="emit('select', 'volume:' + ($event.target as HTMLInputElement).value)"
        />
        <span class="text-[10px] text-fg-faint min-w-5 text-right tabular-nums">{{ volPct }}</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-for="p in EQ_PRESETS"
          :key="p.id"
          class="text-[9px] px-1.5 py-0.5 rounded transition-colors"
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
    </div>
  </div>

  <div class="absolute top-0.5 right-1 z-20">
    <button
      class="btn-pip w-4 h-4 text-[9px] text-fg-faint"
      title="Cycle mode"
      @click="send('cycleMode')"
    >
      &#x229E;
    </button>
  </div>
</template>
