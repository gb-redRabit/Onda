<script setup lang="ts">
import { FolderOpen, FolderUp, Shuffle, Sparkles } from '@lucide/vue';

// Hero, gdy nie ma czego wznawiać (pierwsze uruchomienie / pusta historia).
// Trzyma ten sam rozmiar co karta „kontynuuj”, żeby górny Bento nie skakał.
defineProps<{ canShuffle: boolean }>();

const emit = defineEmits<{
  (e: 'shuffle'): void;
  (e: 'openFiles'): void;
  (e: 'openFolder'): void;
}>();
</script>

<template>
  <section
    data-testid="home-welcome"
    class="flex flex-col justify-center rounded-box border border-base-300/80 bg-base-100 p-4 sm:p-5"
  >
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3.5 min-w-0">
        <div
          class="grid h-10 w-10 shrink-0 place-items-center rounded-field bg-primary/10 text-primary-text"
        >
          <Sparkles :size="18" />
        </div>
        <div class="min-w-0">
          <h2 class="text-base font-semibold tracking-tight text-base-content">
            {{ $t('home.welcomeHeroTitle') }}
          </h2>
          <p class="mt-0.5 max-w-lg text-xs leading-relaxed text-base-content/55">
            {{ $t('home.welcomeHeroText') }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          class="fx-noise flex h-8 items-center gap-1.5 px-3 rounded-field bg-primary text-primary-content text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          :disabled="!canShuffle"
          @click="emit('shuffle')"
        >
          <Shuffle :size="14" />
          {{ $t('home.shuffleLibrary') }}
        </button>
        <button
          type="button"
          class="fx-noise flex h-8 items-center gap-1.5 px-3 rounded-field border border-base-300/80 bg-base-200/50 text-xs font-medium text-base-content/80 hover:bg-base-content/8 hover:text-base-content transition-colors"
          @click="emit('openFiles')"
        >
          <FolderOpen :size="14" class="text-primary-text" />
          {{ $t('home.openFile') }}
        </button>
        <button
          type="button"
          class="fx-noise flex h-8 items-center gap-1.5 px-3 rounded-field border border-base-300/80 bg-base-200/50 text-xs font-medium text-base-content/80 hover:bg-base-content/8 hover:text-base-content transition-colors"
          @click="emit('openFolder')"
        >
          <FolderUp :size="14" class="text-primary-text" />
          {{ $t('home.openFolder') }}
        </button>
      </div>
    </div>
  </section>
</template>
