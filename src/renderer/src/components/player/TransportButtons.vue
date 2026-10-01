<script setup lang="ts">
import { computed } from 'vue';
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart } from '@lucide/vue';
import { useI18n } from 'vue-i18n';

// Współdzielony transport odtwarzania (shuffle / prev / play-pause / next / repeat oraz
// opcjonalny ulubiony). Prezentacyjny: stan wchodzi, akcje wychodzą. Dwie wbudowane
// skórki (`bar` = pasek odtwarzacza audio, `video` = kontrolki wideo) plus
// opcjonalne nadpisanie `styles`, żeby niestandardowy system gęstości (kontrolki
// widoku audio) mógł użyć tej samej logiki bez duplikowania jej.

interface TransportStyles {
  toggle?: string;
  step?: string;
  play?: string;
  playIcon?: string;
  glow?: string;
  active?: string;
  toggleSize?: number;
  skipSize?: number;
  playSize?: number;
}

const props = withDefaults(
  defineProps<{
    variant: 'bar' | 'video';
    isPlaying: boolean;
    shuffle: boolean;
    repeat: 'none' | 'all' | 'one';
    favorite?: boolean;
    showFavorite?: boolean;
    containerClass?: string;
    styles?: TransportStyles;
  }>(),
  {
    favorite: false,
    showFavorite: false,
    containerClass: '',
    styles: undefined
  }
);

const emit = defineEmits<{
  playPause: [];
  prev: [];
  next: [];
  toggleShuffle: [];
  cycleRepeat: [];
  toggleFavorite: [];
}>();

const { t } = useI18n();

const isBar = computed(() => props.variant === 'bar');
const toggleClass = computed(
  () =>
    props.styles?.toggle ??
    (isBar.value
      ? 'fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:text-base-content hover:bg-base-content/10 transition-colors'
      : 'text-neutral-content/40 hover:text-neutral-content/80 transition-colors')
);
const stepClass = computed(
  () =>
    props.styles?.step ??
    (isBar.value
      ? 'fx-noise p-1.5 fx-depth rounded-field text-base-content/70 hover:text-base-content hover:bg-base-content/10 transition-colors'
      : 'text-neutral-content/60 hover:text-neutral-content transition-colors')
);
const playBtnClass = computed(
  () =>
    props.styles?.play ??
    (isBar.value
      ? 'w-10 h-10 rounded-full bg-base-content flex items-center justify-center hover:scale-105 active:scale-95 transition-[transform,opacity] shadow-lg'
      : 'relative w-12 h-12 rounded-full bg-neutral-content/15 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5')
);
const playIconClass = computed(
  () => props.styles?.playIcon ?? (isBar.value ? 'text-base-200' : 'text-neutral-content')
);
const activeClass = computed(() => props.styles?.active ?? 'text-primary!');
const glowClass = computed(
  () => props.styles?.glow ?? (isBar.value ? '' : 'bg-neutral-content/10 blur-lg')
);
const showGlow = computed(() => props.isPlaying && (!isBar.value || !!props.styles?.glow));
const sz = computed(() => ({
  toggle: props.styles?.toggleSize ?? (isBar.value ? 15 : 16),
  skip: props.styles?.skipSize ?? (isBar.value ? 17 : 18),
  play: props.styles?.playSize ?? (isBar.value ? 18 : 22)
}));
const repeatLabel = computed(() =>
  props.repeat === 'one'
    ? t('player.repeatOne')
    : props.repeat === 'all'
      ? t('player.repeatAll')
      : t('player.repeatNone')
);
</script>

<template>
  <div :class="containerClass || 'flex items-center gap-3'">
    <button
      :class="[toggleClass, shuffle ? activeClass : '']"
      :aria-label="t('common.shuffle')"
      :aria-pressed="shuffle"
      @click="emit('toggleShuffle')"
    >
      <Shuffle :size="sz.toggle" />
    </button>
    <button
      v-if="showFavorite"
      :class="[toggleClass, favorite ? 'text-error!' : '']"
      :aria-label="favorite ? t('common.removeFav') : t('common.addFav')"
      @click="emit('toggleFavorite')"
    >
      <Heart :size="sz.toggle" :fill="favorite ? 'currentColor' : 'none'" />
    </button>
    <button :class="stepClass" :aria-label="t('common.previous')" @click="emit('prev')">
      <SkipBack :size="sz.skip" fill="currentColor" />
    </button>
    <div class="relative">
      <div v-if="showGlow" :class="['absolute inset-0 rounded-full', glowClass]" />
      <button
        :class="playBtnClass"
        :aria-label="isPlaying ? t('common.pause') : t('common.play')"
        @click="emit('playPause')"
      >
        <Pause v-if="isPlaying" :size="sz.play" :class="playIconClass" fill="currentColor" />
        <Play v-else :size="sz.play" :class="[playIconClass, 'ml-0.5']" fill="currentColor" />
      </button>
    </div>
    <button :class="stepClass" :aria-label="t('common.next')" @click="emit('next')">
      <SkipForward :size="sz.skip" fill="currentColor" />
    </button>
    <button
      :class="[toggleClass, repeat !== 'none' ? activeClass : '']"
      :title="t('common.repeat')"
      :aria-label="repeatLabel"
      @click="emit('cycleRepeat')"
    >
      <component :is="repeat === 'one' ? Repeat1 : Repeat" :size="sz.toggle" />
    </button>
  </div>
</template>
