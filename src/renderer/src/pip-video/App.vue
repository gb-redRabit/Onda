<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { usePipVideoSubtitle } from './usePipVideoSubtitle';
import { usePipVideoIpc } from './usePipVideoIpc';
import { usePipVideoPreview } from './usePipVideoPreview';

const props = withDefaults(defineProps<{ preview?: boolean }>(), { preview: false });

const videoRef = ref<HTMLVideoElement | null>(null);
const progressRef = ref<HTMLDivElement | null>(null);

const sub = usePipVideoSubtitle(videoRef);
const pip = usePipVideoIpc(sub, { videoRef, progressRef });
const {
  setHiddenVideoRef,
  previewVisible,
  previewDataUrl,
  previewLeft,
  previewTimeLabel,
  handleMouseMove,
  handleMouseLeave
} = usePipVideoPreview({ videoRef, progressRef });

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

onMounted(() => {
  if (props.preview) showOverlay.value = true;
});
</script>

<template>
  <div
    class="pip-root relative w-full h-full flex flex-col select-none overflow-hidden border border-base-300 bg-base-200"
    @mouseenter="showOverlay = true"
    @mouseleave="
      showOverlay = false;
      settingsOpen = false;
    "
  >
    <video
      v-if="!preview"
      ref="videoRef"
      class="flex-1 w-full object-contain bg-neutral"
      :style="videoFilter !== 'none' ? { filter: videoFilter } : {}"
      preload="auto"
      @loadedmetadata="onVideoMeta"
      @timeupdate="onTimeUpdate"
      @ended="onVideoEnded"
    />

    <div
      v-else
      data-testid="pip-video-preview"
      class="pip-preview-scene relative flex-1 w-full overflow-hidden"
      :aria-label="t('previewTitle')"
    >
      <div class="absolute inset-0 bg-linear-to-b from-sky-300 via-indigo-400 to-slate-900" />
      <div
        class="absolute -top-1/3 right-1/5 h-2/3 aspect-square rounded-full bg-amber-100/70 blur-xl"
      />
      <div
        class="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-br from-emerald-900 via-teal-800 to-slate-900"
        style="
          clip-path: polygon(
            0 58%,
            20% 25%,
            37% 56%,
            61% 10%,
            78% 46%,
            100% 20%,
            100% 100%,
            0 100%
          );
        "
      />
      <div class="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/75 to-transparent" />
      <div class="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-white drop-shadow">{{ t('previewTitle') }}</p>
          <p class="mt-0.5 text-[11px] text-white/70">{{ t('previewDescription') }}</p>
        </div>
        <span class="shrink-0 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-mono text-white">
          1080p
        </span>
      </div>
    </div>

    <video
      v-if="!preview"
      :ref="setHiddenVideoRef"
      class="absolute top-0 left-0 w-1 h-1 opacity-0 pointer-events-none"
      muted
      playsinline
      preload="auto"
    />

    <!-- przyciski zamknij + maksymalizuj + ustawienia -->
    <div
      class="absolute top-1.5 right-1.5 flex gap-1 z-10 transition-opacity duration-150"
      :style="{ opacity: showOverlay ? 1 : 0 }"
    >
      <button
        data-testid="pip-video-settings"
        class="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 text-[11px] top-btn"
        :title="t('settings')"
        @click="settingsOpen = !settingsOpen"
      >
        &#x2699;
      </button>
      <button
        v-if="!preview"
        data-testid="pip-video-maximize"
        class="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 text-[10px] top-btn"
        :title="t('maximize')"
        @click="sendMaximize"
      >
        &#x26F6;
      </button>
      <button
        v-if="preview"
        data-testid="pip-video-preview-close"
        class="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 text-[11px] close-btn"
        :title="t('close')"
        :aria-label="t('close')"
        @click="api?.send('pip:hidden')"
      >
        &#x2715;
      </button>
      <button
        v-else
        data-testid="pip-video-close"
        class="w-6 h-6 rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 text-[11px] close-btn"
        :title="t('close')"
        @click="api?.send('pip:hidden')"
      >
        &#x2715;
      </button>
    </div>

    <!-- nakładka ustawień -->
    <div
      v-if="settingsOpen"
      data-testid="pip-video-settings-panel"
      class="absolute top-9 right-1.5 z-20 rounded-field p-3 min-w-44"
      :style="{
        background: 'var(--color-neutral)',
        border: '1px solid var(--color-base-300)'
      }"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px]" :style="{ color: 'var(--color-base-content)' }">{{
          t('subtitles')
        }}</span>
        <button
          data-testid="pip-video-subs"
          class="w-8 h-4.5 rounded-full transition-colors relative"
          :class="subsVisible ? 'bg-primary' : ''"
          :style="
            !subsVisible
              ? { background: 'color-mix(in srgb, var(--color-base-content) 10%, transparent)' }
              : {}
          "
          @click="toggleSubtitles"
        >
          <div
            class="w-3 h-3 rounded-full bg-neutral-content absolute top-0.5 transition-all"
            :class="subsVisible ? 'left-4' : 'left-0.5'"
          />
        </button>
      </div>
      <div class="mb-1.5">
        <span
          class="text-[10px]"
          :style="{ color: 'color-mix(in srgb, var(--color-base-content) 50%, transparent)' }"
          >{{ t('brightness') }} {{ brightness }}%</span
        >
        <input
          type="range"
          min="10"
          max="200"
          step="5"
          :value="brightness"
          class="w-full h-0.75"
          :style="{ background: 'color-mix(in srgb, var(--color-base-content) 10%, transparent)' }"
          @input="brightness = parseInt(($event.target as HTMLInputElement).value)"
        />
      </div>
      <div>
        <span
          class="text-[10px]"
          :style="{ color: 'color-mix(in srgb, var(--color-base-content) 50%, transparent)' }"
          >{{ t('contrast') }} {{ contrast }}%</span
        >
        <input
          type="range"
          min="10"
          max="200"
          step="5"
          :value="contrast"
          class="w-full h-0.75"
          :style="{ background: 'color-mix(in srgb, var(--color-base-content) 10%, transparent)' }"
          @input="contrast = parseInt(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div
      class="absolute bottom-2 left-2 text-[10px] font-mono pointer-events-none"
      :style="{ color: 'color-mix(in srgb, var(--color-base-content) 50%, transparent)' }"
    >
      {{ preview ? '0:42' : currentTime }}
    </div>

    <div
      class="absolute bottom-2 right-2 text-[10px] font-mono pointer-events-none"
      :style="{ color: 'color-mix(in srgb, var(--color-base-content) 50%, transparent)' }"
    >
      {{ preview ? '12:08' : duration }}
    </div>

    <div
      ref="progressRef"
      class="relative h-1 shrink-0 cursor-pointer"
      :style="{ background: 'color-mix(in srgb, var(--color-base-content) 10%, transparent)' }"
      @click="onProgressClick"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
    >
      <div
        class="h-full rounded-r"
        :style="{ width: (preview ? 34 : progress) + '%', background: 'var(--color-primary)' }"
      ></div>

      <div
        v-if="previewVisible"
        class="absolute bottom-2 flex flex-col items-center -translate-x-1/2 pointer-events-none"
        :style="{ left: previewLeft + '%' }"
      >
        <div
          class="rounded-field overflow-hidden shadow-lg border border-white/10 bg-neutral"
          :style="{ width: '96px', height: '54px' }"
        >
          <img
            v-if="previewDataUrl"
            :src="previewDataUrl"
            class="w-full h-full object-cover"
            alt=""
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-[9px] text-neutral-content/50"
          >
            {{ previewTimeLabel() }}
          </div>
        </div>
        <span
          class="mt-1 text-[10px] text-neutral-content/80 tabular-nums bg-neutral/60 px-1 rounded-field"
        >
          {{ previewTimeLabel() }}
        </span>
      </div>
    </div>
  </div>
</template>
