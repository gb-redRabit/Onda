<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { formatDuration } from '@renderer/utils/formatters';

const props = defineProps<{ variant?: string }>();

const audio = useAudioPlayer();
const player = usePlayerStore();

const rootEl = ref<HTMLElement | null>(null);
const tooShort = ref(false);
let ro: ResizeObserver | null = null;

onMounted(() => {
  if (!rootEl.value) return;
  ro = new ResizeObserver((entries) => {
    tooShort.value = entries[0].contentRect.height < 18;
  });
  ro.observe(rootEl.value);
});

onBeforeUnmount(() => {
  ro?.disconnect();
});

const isLive = computed(
  () =>
    player.currentTrack?.type === 'stream' &&
    !!player.currentTrack?.id.startsWith('radio:') &&
    !player.currentTrack?.duration
);

const progressPct = computed(() =>
  audio.duration.value > 0 ? (audio.currentTime.value / audio.duration.value) * 100 : 0
);

const bufferedPct = computed(() => audio.buffered.value * 100);

const isThin = computed(() => props.variant === 'thin');
const isNeon = computed(() => props.variant === 'neon');

const trackBase = 'flex-1 relative';
const trackClass = computed(() => {
  if (isNeon.value) return `${trackBase} h-1.5 bg-base-content/15 rounded-full`;
  if (isThin.value) return `${trackBase} h-0.5 bg-base-content/15 rounded-full`;
  return `${trackBase} h-1 bg-base-content/20 rounded-full cursor-pointer hover:h-1.5 transition-[height] group`;
});

const fillClass = computed(() => {
  if (isNeon.value)
    return 'absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-accent shadow-[0_0_10px] shadow-primary/50';
  return 'absolute inset-y-0 left-0 bg-primary rounded-full';
});

const bufferedClass = computed(() =>
  isNeon.value
    ? 'absolute inset-y-0 left-0 bg-base-content/10 rounded-full'
    : 'absolute inset-y-0 left-0 bg-primary/50 rounded-full'
);

const timeClass = computed(() => (isThin.value ? 'text-[10px]' : 'text-xs'));

function onDragSeek(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  function update(ev: MouseEvent) {
    const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    audio.seek(pct * audio.duration.value);
  }
  update(e);
  function onMove(ev: MouseEvent) {
    update(ev);
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

const SEEK_STEP_SECONDS = 5;

/**
 * Keyboard equivalent of the drag-to-seek.
 *
 * The bar was a click-and-drag div with no role, no tabindex and no key
 * handling, so playback position could not be moved without a pointer at all.
 */
function onTrackKey(e: KeyboardEvent) {
  const total = audio.duration.value;
  if (!(total > 0)) return;
  let next: number | null = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
    next = audio.currentTime.value + SEEK_STEP_SECONDS;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
    next = audio.currentTime.value - SEEK_STEP_SECONDS;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = total;
  else if (e.key === 'PageUp') next = audio.currentTime.value + 30;
  else if (e.key === 'PageDown') next = audio.currentTime.value - 30;
  if (next === null) return;
  e.preventDefault();
  audio.seek(Math.max(0, Math.min(total, next)));
}
</script>

<template>
  <div v-if="isLive" class="w-full flex items-center gap-3">
    <span class="text-xs font-bold tracking-widest text-error">{{ $t('player.live') }}</span>
    <div class="flex-1 h-px bg-base-content/20 rounded-full" />
  </div>
  <div v-else ref="rootEl" class="w-full flex items-center gap-3">
    <span
      v-if="!tooShort"
      :class="['text-base-content/70 font-mono tabular-nums w-10 text-right shrink-0', timeClass]"
    >
      {{ formatDuration(audio.currentTime.value) }}
    </span>
    <div
      :class="trackClass"
      role="slider"
      tabindex="0"
      :aria-label="$t('player.seekSlider')"
      :aria-valuemin="0"
      :aria-valuemax="Math.round(audio.duration.value)"
      :aria-valuenow="Math.round(audio.currentTime.value)"
      :aria-valuetext="`${formatDuration(audio.currentTime.value)} / ${formatDuration(audio.duration.value)}`"
      @mousedown="onDragSeek"
      @keydown="onTrackKey"
    >
      <div :class="bufferedClass" :style="{ width: bufferedPct + '%' }" />
      <div
        v-if="isNeon"
        class="absolute inset-y-0 left-0 rounded-full bg-primary/40 blur-sm"
        :style="{ width: progressPct + '%' }"
      />
      <div :class="fillClass" :style="{ width: progressPct + '%' }">
        <div
          v-if="!isThin"
          class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>
    </div>
    <span
      v-if="!tooShort"
      :class="['text-base-content/50 font-mono tabular-nums w-10 shrink-0', timeClass]"
    >
      {{ formatDuration(audio.duration.value) }}
    </span>
  </div>
</template>
