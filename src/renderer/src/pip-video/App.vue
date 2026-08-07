<script setup lang="ts">
import { ref } from 'vue';
import { usePipVideoSubtitle } from './usePipVideoSubtitle';
import { usePipVideoIpc } from './usePipVideoIpc';

const videoRef = ref<HTMLVideoElement | null>(null);
const progressRef = ref<HTMLDivElement | null>(null);

const sub = usePipVideoSubtitle(videoRef);
const pip = usePipVideoIpc(sub, { videoRef, progressRef });

const {
  api,
  currentTime,
  duration,
  progress,
  showOverlay,
  settingsOpen,
  brightness,
  contrast,
  videoFilter,
  t,
  onVideoMeta,
  onTimeUpdate,
  onVideoEnded,
  onProgressClick,
  sendMaximize
} = pip;

const { subsVisible, toggleSubtitles } = sub;
</script>

<template>
  <div
    class="relative w-full h-full flex flex-col bg-black select-none"
    @mouseenter="showOverlay = true"
    @mouseleave="
      showOverlay = false;
      settingsOpen = false;
    "
  >
    <video
      ref="videoRef"
      class="flex-1 w-full object-contain bg-black"
      :style="videoFilter !== 'none' ? { filter: videoFilter } : {}"
      preload="auto"
      @loadedmetadata="onVideoMeta"
      @timeupdate="onTimeUpdate"
      @ended="onVideoEnded"
    />

    <!-- close + maximize + settings buttons -->
    <div
      class="absolute top-1.5 right-1.5 flex gap-1 z-10 transition-opacity duration-150"
      :style="{ opacity: showOverlay ? 1 : 0 }"
    >
      <button
        class="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 text-[11px] top-btn"
        :title="t('settings')"
        @click="settingsOpen = !settingsOpen"
      >
        &#x2699;
      </button>
      <button
        class="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 text-[10px] top-btn"
        :title="t('maximize')"
        @click="sendMaximize"
      >
        &#x26F6;
      </button>
      <button
        class="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 text-[11px] close-btn"
        :title="t('close')"
        @click="api?.send('pip:hidden')"
      >
        &#x2715;
      </button>
    </div>

    <!-- settings overlay -->
    <div
      v-if="settingsOpen"
      class="absolute top-9 right-1.5 z-20 rounded-lg p-3 min-w-44"
      :style="{
        background: 'var(--color-bg-overlay, #1e1e2e)',
        border: '1px solid var(--color-border-default, #2a2a40)'
      }"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px]" :style="{ color: 'var(--color-fg-base, #e8e8f0)' }">{{
          t('subtitles')
        }}</span>
        <button
          class="w-8 h-4.5 rounded-full transition-colors relative"
          :class="subsVisible ? 'bg-accent-base' : ''"
          :style="!subsVisible ? { background: 'var(--color-bg-hover, #2e2e42)' } : {}"
          @click="toggleSubtitles"
        >
          <div
            class="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all"
            :class="subsVisible ? 'left-4' : 'left-0.5'"
          />
        </button>
      </div>
      <div class="mb-1.5">
        <span class="text-[10px]" :style="{ color: 'var(--color-fg-faint, #6a6a84)' }"
          >{{ t('brightness') }} {{ brightness }}%</span
        >
        <input
          type="range"
          min="10"
          max="200"
          step="5"
          :value="brightness"
          class="w-full h-0.75"
          :style="{ background: 'var(--color-bg-hover, #2e2e42)' }"
          @input="brightness = parseInt(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div>
        <span class="text-[10px]" :style="{ color: 'var(--color-fg-faint, #6a6a84)' }"
          >{{ t('contrast') }} {{ contrast }}%</span
        >
        <input
          type="range"
          min="10"
          max="200"
          step="5"
          :value="contrast"
          class="w-full h-0.75"
          :style="{ background: 'var(--color-bg-hover, #2e2e42)' }"
          @input="contrast = parseInt(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div
      class="absolute bottom-2 left-2 text-[10px] font-mono pointer-events-none"
      :style="{ color: 'var(--color-fg-faint, rgba(255,255,255,0.5))' }"
    >
      {{ currentTime }}
    </div>

    <div
      class="absolute bottom-2 right-2 text-[10px] font-mono pointer-events-none"
      :style="{ color: 'var(--color-fg-faint, rgba(255,255,255,0.5))' }"
    >
      {{ duration }}
    </div>

    <div
      ref="progressRef"
      class="h-1 shrink-0 cursor-pointer"
      :style="{ background: 'var(--color-bg-hover, rgba(255,255,255,0.15))' }"
      @click="onProgressClick"
    >
      <div
        class="h-full rounded-r"
        :style="{ width: progress + '%', background: 'var(--color-accent-base, #7c6aef)' }"
      ></div>
    </div>
  </div>
</template>
