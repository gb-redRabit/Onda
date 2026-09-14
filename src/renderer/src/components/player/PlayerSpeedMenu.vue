<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Gauge, RotateCcw } from '@lucide/vue';

const props = defineProps<{ speed: number }>();
const emit = defineEmits<{ setSpeed: [speed: number] }>();

const speedSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const SPEED_MIN = 0.25;
const SPEED_MAX = 3;

const speedMenuOpen = ref(false);
const speedContainer = ref<HTMLElement | null>(null);

const speedLabel = computed(() => {
  const v = props.speed;
  return `${Number.isInteger(v) ? v : Math.round(v * 100) / 100}x`;
});

const isPresetSpeed = computed(() => speedSteps.includes(props.speed));

function onSpeedOutsideClick(e: MouseEvent) {
  const target = e.target as Node;
  if (speedMenuOpen.value && speedContainer.value && !speedContainer.value.contains(target)) {
    speedMenuOpen.value = false;
  }
}

function onSpeedKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') speedMenuOpen.value = false;
}

watch(speedMenuOpen, (open) => {
  if (open) document.addEventListener('keydown', onSpeedKeydown);
  else document.removeEventListener('keydown', onSpeedKeydown);
});

onMounted(() => document.addEventListener('mousedown', onSpeedOutsideClick));
onUnmounted(() => {
  document.removeEventListener('mousedown', onSpeedOutsideClick);
  document.removeEventListener('keydown', onSpeedKeydown);
});

function setSpeedValue(v: number) {
  const clamped = Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(v * 100) / 100));
  emit('setSpeed', clamped);
}

function onSpeedSlider(e: Event) {
  setSpeedValue(parseFloat((e.target as HTMLInputElement).value));
}

function onSpeedPreset(v: number) {
  emit('setSpeed', v);
  speedMenuOpen.value = false;
}
</script>

<template>
  <div ref="speedContainer" class="relative flex items-center">
    <button
      class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors cursor-pointer select-none"
      :class="
        speed !== 1
          ? 'text-primary bg-primary/10 hover:bg-primary/20'
          : 'text-neutral-content/40 hover:text-neutral-content/70 bg-neutral-content/6 hover:bg-neutral-content/10'
      "
      :aria-haspopup="true"
      :aria-expanded="speedMenuOpen"
      :aria-label="$t('player.speedTitle') + ': ' + speedLabel"
      :title="$t('player.speedTitle')"
      @click.stop="speedMenuOpen = !speedMenuOpen"
    >
      <Gauge :size="11" />
      {{ speedLabel }}
    </button>

    <Transition name="menu-fade">
      <div
        v-if="speedMenuOpen"
        class="absolute bottom-full right-0 mb-2 w-64 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/50 p-3 z-50"
      >
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-[10px] text-base-content/50 font-medium uppercase tracking-wider">
            {{ $t('player.speedTitle') }}
          </span>
          <span class="text-[11px] font-mono text-primary tabular-nums">{{ speedLabel }}</span>
        </div>

        <div class="grid grid-cols-3 gap-1.5 mb-3">
          <button
            v-for="step in speedSteps"
            :key="step"
            class="fx-noise px-2 py-1.5 fx-depth rounded-field text-[11px] font-mono transition-colors"
            :class="
              speed === step
                ? 'bg-primary text-primary-content font-semibold'
                : 'bg-base-200/(--glass-alpha) text-base-content/70 hover:bg-base-content/10 hover:text-base-content'
            "
            @click="onSpeedPreset(step)"
          >
            {{ step }}x
          </button>
        </div>

        <div class="flex items-center gap-2">
          <Gauge :size="12" class="text-base-content/50 shrink-0" />
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            :value="speed"
            class="flex-1 accent-primary cursor-pointer"
            :aria-label="$t('player.speedCustom')"
            @input="onSpeedSlider"
          />
        </div>
        <div
          class="flex items-center justify-between text-[9px] text-base-content/60 font-mono mt-1 px-0.5"
        >
          <span>0.25x</span>
          <span>3x</span>
        </div>

        <div class="flex items-center justify-between mt-2.5 pt-2.5 border-t border-base-300">
          <span class="text-[10px] text-base-content/60">{{ $t('player.speedHint') }}</span>
          <button
            class="fx-noise flex items-center gap-1 px-2 py-1 fx-depth rounded-field text-[10px] text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors"
            :class="{ 'pointer-events-none opacity-40': speed === 1 && isPresetSpeed }"
            :disabled="speed === 1 && isPresetSpeed"
            @click="onSpeedPreset(1)"
          >
            <RotateCcw :size="10" />
            {{ $t('player.speedReset') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
