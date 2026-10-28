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
    class="relative isolate flex flex-col justify-center overflow-hidden rounded-box border border-base-300 bg-base-100 p-6 fx-depth fx-noise"
  >
    <div
      aria-hidden="true"
      class="pointer-events-none absolute -right-12 -top-20 -z-10 h-56 w-56 rounded-full bg-primary/20 blur-3xl"
    />

    <div class="flex items-start gap-4">
      <div
        class="grid h-11 w-11 shrink-0 place-items-center rounded-box bg-primary/15 text-primary-text"
      >
        <Sparkles :size="20" />
      </div>
      <div class="min-w-0">
        <h2 class="text-lg font-semibold">{{ $t('home.welcomeHeroTitle') }}</h2>
        <p class="mt-1 max-w-md text-sm text-base-content/55">
          {{ $t('home.welcomeHeroText') }}
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            class="flex items-center gap-2 px-3 py-1.5 rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            :disabled="!canShuffle"
            @click="emit('shuffle')"
          >
            <Shuffle :size="15" />
            {{ $t('home.shuffleLibrary') }}
          </button>
          <button
            class="flex items-center gap-2 px-3 py-1.5 rounded-field border border-base-300 bg-base-200/70 text-sm font-medium text-base-content/80 hover:bg-base-content/10 hover:text-base-content transition-colors"
            @click="emit('openFiles')"
          >
            <FolderOpen :size="15" />
            {{ $t('home.openFile') }}
          </button>
          <button
            class="flex items-center gap-2 px-3 py-1.5 rounded-field border border-base-300 bg-base-200/70 text-sm font-medium text-base-content/80 hover:bg-base-content/10 hover:text-base-content transition-colors"
            @click="emit('openFolder')"
          >
            <FolderUp :size="15" />
            {{ $t('home.openFolder') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
