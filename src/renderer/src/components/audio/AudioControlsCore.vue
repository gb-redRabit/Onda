<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ListMusic, Pause, Play, SlidersHorizontal, Volume2, VolumeX } from '@lucide/vue';
import { useAudioPlayer } from '@renderer/composables/useAudioPlayer';
import { usePlayerStore } from '@renderer/stores/player';
import { DENSITY, ICON, ICON_SM, PLAY_BOX, PLAY_SIZE } from '@renderer/utils/audioControls';
import TransportButtons from '@renderer/components/player/TransportButtons.vue';

// The transport for every layout that has one. This replaces four components
// that were the same eight buttons with the same handlers and the same
// accessible names, differing only in a few Tailwind classes — so a behaviour or
// an accessibility fix had to be applied four times, and missing one was
// invisible until the window was resized into that variant.
//
// The one variant with genuinely different logic is micro (a single play
// button); it stays its own component.

const props = defineProps<{
  /** Which density row from DENSITY to render with. */
  variant: 'wide' | 'tall' | 'compact' | 'minimal';
  /** Hides the volume and extras rows regardless of available space. */
  compact: boolean;
  /** Box is wide enough for the full transport row. */
  widthSufficient: boolean;
  /** Box is tall enough to give the volume row its own line. */
  volumeFit: boolean;
}>();

const player = usePlayerStore();
const audio = useAudioPlayer();
const { t } = useI18n();

const d = computed(() => DENSITY[props.variant]);
const icon = computed(() => ICON[props.variant]);
const iconSm = computed(() => ICON_SM[props.variant]);
const playSize = computed(() => PLAY_SIZE[props.variant]);
const playBox = computed(() => PLAY_BOX[props.variant]);

// The transport buttons reuse the shared component with this density's classes.
const transportStyles = computed(() => ({
  toggle: `${d.value.button} rounded-full transition-colors`,
  step: `${d.value.button} rounded-full`,
  play: `${playBox.value} ${PLAY_ICON_CLASS}`,
  playIcon: 'text-primary',
  glow: d.value.glow,
  active: 'text-primary',
  toggleSize: iconSm.value,
  skipSize: icon.value,
  playSize: playSize.value
}));

const showTransport = computed(() => !d.value.gateTransportOnWidth || props.widthSufficient);
const showVolume = computed(() => {
  if (d.value.volume === 'never') return false;
  if (d.value.volume === 'whenNarrow') {
    return !props.compact && !props.widthSufficient && props.volumeFit;
  }
  return !props.compact;
});
const showExtras = computed(() => d.value.extras && !props.compact);

const PLAY_ICON_CLASS =
  'relative rounded-full bg-primary/15 backdrop-blur-xl border border-primary/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg';
const TOGGLE_OFF = 'text-base-content/50 hover:text-base-content hover:bg-base-content/10';

function togglePlay() {
  if (audio.isPlaying.value) {
    audio.pause();
  } else {
    void audio.play();
  }
}

function onVolume(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  audio.setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
}

// The volume bar is a click-only div without this: no role, no tabindex, no
// keyboard handler, so volume could only be changed with a mouse.
const VOLUME_STEP = 0.05;
function onVolumeKey(e: KeyboardEvent) {
  const current = player.isMuted ? 0 : player.volume;
  let next: number | null = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = current + VOLUME_STEP;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = current - VOLUME_STEP;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = 1;
  else if (e.key === 'PageUp') next = current + VOLUME_STEP * 2;
  else if (e.key === 'PageDown') next = current - VOLUME_STEP * 2;
  if (next === null) return;
  e.preventDefault();
  audio.setVolume(Math.max(0, Math.min(1, next)));
}
</script>

<template>
  <div :class="d.container">
    <TransportButtons
      v-if="showTransport"
      variant="bar"
      :container-class="d.transport"
      :styles="transportStyles"
      :is-playing="audio.isPlaying.value"
      :shuffle="player.shuffle"
      :repeat="player.repeat"
      @play-pause="togglePlay"
      @prev="player.prevTrack"
      @next="player.nextTrack"
      @toggle-shuffle="player.toggleShuffle"
      @cycle-repeat="player.cycleRepeat"
    />
    <button
      v-else
      :class="[playBox, PLAY_ICON_CLASS, 'shrink-0']"
      :aria-label="audio.isPlaying.value ? t('common.pause') : t('common.play')"
      @click="togglePlay"
    >
      <Pause
        v-if="audio.isPlaying.value"
        :size="playSize"
        class="text-primary"
        fill="currentColor"
      />
      <Play v-else :size="playSize" class="text-primary ml-0.5" fill="currentColor" />
    </button>

    <div v-if="showVolume" :class="d.volumeRow">
      <button
        class="text-base-content/50 hover:text-base-content transition-colors shrink-0"
        :aria-label="player.isMuted ? t('player.unmute') : t('common.mute')"
        @click="player.toggleMute"
      >
        <VolumeX v-if="player.isMuted" :size="iconSm" />
        <Volume2 v-else :size="iconSm" />
      </button>
      <div
        :class="[
          'flex-1 min-w-0 rounded-full cursor-pointer transition-[height]',
          d.volumeTrack,
          d.volumeTrack === 'h-0.5'
            ? 'bg-base-content/20 hover:h-1'
            : 'bg-base-content/20 hover:h-1.5'
        ]"
        role="slider"
        tabindex="0"
        :aria-label="t('player.volumeSlider')"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="player.isMuted ? 0 : Math.round(player.volume * 100)"
        :aria-valuetext="player.isMuted ? t('player.muted') : undefined"
        @click="onVolume"
        @keydown="onVolumeKey"
      >
        <div
          class="h-full bg-primary/60 rounded-full"
          :style="{ width: (player.isMuted ? 0 : player.volume * 100) + '%' }"
        />
      </div>
    </div>

    <div v-if="showExtras" :class="d.extrasRow">
      <button
        :class="[
          d.extrasButton,
          player.equalizerVisible ? 'bg-primary/10 text-primary' : TOGGLE_OFF
        ]"
        :aria-label="t('common.equalizer')"
        :aria-pressed="player.equalizerVisible"
        data-eq-toggle
        @click="player.toggleEqualizer"
      >
        <SlidersHorizontal :size="iconSm" />
      </button>
      <button
        :class="[d.extrasButton, player.queueVisible ? 'bg-primary/10 text-primary' : TOGGLE_OFF]"
        :aria-label="t('common.queue')"
        :aria-pressed="player.queueVisible"
        @click="player.toggleQueue"
      >
        <ListMusic :size="iconSm" />
      </button>
    </div>
  </div>
</template>
