<script setup lang="ts">
import { Play, ArrowRight } from '@lucide/vue';
import MediaCover from '@renderer/components/MediaCover.vue';

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    coverPath?: string;
    /** Okrągła grafika (wykonawcy). */
    round?: boolean;
    /** Rozmiar żądania okładki w px; także rozmiar ikony zapasowej. */
    coverSize?: number;
    fallback?: 'music' | 'play' | 'disc' | 'film';
    /** Pokazuje afordancję "otwórz w bibliotece" przy najechaniu. */
    openLabel?: string;
  }>(),
  { round: false, coverSize: 132, fallback: 'music', subtitle: '', coverPath: '' }
);

const emit = defineEmits<{
  (e: 'play'): void;
  (e: 'open'): void;
  (e: 'contextmenu', event: MouseEvent): void;
}>();
</script>

<template>
  <div
    v-activate
    class="group w-[132px] shrink-0 cursor-pointer text-left"
    @click="emit('play')"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div
      class="relative w-full aspect-square overflow-hidden bg-base-100 border border-base-300 fx-depth"
      :class="round ? 'rounded-full' : 'rounded-box'"
    >
      <MediaCover :path="coverPath" :size="coverSize" :fallback="fallback" class="w-full h-full" />
      <button
        v-if="openLabel"
        class="absolute top-1.5 right-1.5 z-10 p-1 rounded-field bg-base-content/60 text-base-100 opacity-0 group-hover:opacity-100 hover:bg-base-content transition-opacity"
        :title="openLabel"
        :aria-label="openLabel"
        @click.stop="emit('open')"
      >
        <ArrowRight :size="14" />
      </button>
      <button
        class="absolute inset-0 flex items-center justify-center bg-base-content/40 opacity-0 group-hover:opacity-100 transition-opacity"
        :aria-label="$t('common.play')"
        @click.stop="emit('play')"
      >
        <span
          class="w-11 h-11 rounded-full bg-primary text-primary-content flex items-center justify-center fx-depth"
        >
          <Play :size="18" class="ml-0.5" />
        </span>
      </button>
    </div>
    <div class="mt-2 text-sm font-medium truncate" :title="title">{{ title }}</div>
    <div v-if="subtitle" class="text-xs text-base-content/50 truncate">{{ subtitle }}</div>
  </div>
</template>
