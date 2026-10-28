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
    /** Krótki badge na okładce, np. licznik odtworzeń „14×”. */
    badge?: string;
    /** Druga warstwa za okładką — wizualnie odróżnia kolekcje od utworów. */
    stacked?: boolean;
  }>(),
  {
    round: false,
    coverSize: 132,
    fallback: 'music',
    subtitle: '',
    coverPath: '',
    badge: '',
    stacked: false
  }
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
    <div class="relative" :class="stacked && !round ? 'mb-2.5' : ''">
      <!-- Stos kart: tylko kolekcje (playlisty/albumy), nigdy okrągły avatar.
           Warstwy wystają spod okładki w margines `mb-2.5`, więc nie zasłaniają tytułu. -->
      <template v-if="stacked && !round">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-3 top-2.5 h-full rounded-box border border-base-300 bg-base-200/80"
        />
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-1.5 top-1 h-full rounded-box border border-base-300 bg-base-100"
        />
      </template>

      <div
        class="relative aspect-square overflow-hidden border border-base-300 bg-base-100 fx-depth"
        :class="
          round
            ? 'rounded-full ring-1 ring-base-content/10 transition-shadow group-hover:ring-primary/50'
            : 'rounded-box'
        "
      >
        <MediaCover
          :path="coverPath"
          :size="coverSize"
          :fallback="fallback"
          class="h-full w-full transition-transform duration-300 ease-out group-hover:scale-105"
        />

        <!-- Miękki gradient zamiast szarej zasłony na całej okładce. -->
        <div
          class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base-300/80 via-base-300/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />

        <span
          v-if="badge"
          class="absolute left-1.5 top-1.5 rounded-full bg-base-300/85 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-base-content backdrop-blur-sm"
        >
          {{ badge }}
        </span>

        <button
          v-if="openLabel"
          class="absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-base-300/80 text-base-content opacity-0 backdrop-blur-sm transition-opacity hover:bg-base-300 group-hover:opacity-100 group-focus-within:opacity-100"
          :title="openLabel"
          :aria-label="openLabel"
          @click.stop="emit('open')"
        >
          <ArrowRight :size="14" />
        </button>
      </div>

      <!-- Kwadratowe okładki: Play wyjeżdża z prawego dolnego rogu. -->
      <button
        v-if="!round"
        class="absolute bottom-2 right-2 z-10 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-primary text-primary-content opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
        :aria-label="$t('common.play')"
        @click.stop="emit('play')"
      >
        <Play :size="16" class="ml-0.5" />
      </button>
      <!-- Okrągłe awatary: Play pojawia się na środku, bo róg koła jest poza grafiką. -->
      <button
        v-else
        class="absolute inset-0 z-10 grid place-items-center rounded-full bg-base-300/45 text-base-content opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        :aria-label="$t('common.play')"
        @click.stop="emit('play')"
      >
        <span
          class="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-content shadow-lg"
        >
          <Play :size="16" class="ml-0.5" />
        </span>
      </button>
    </div>

    <div class="mt-2 truncate text-sm font-medium" :title="title">{{ title }}</div>
    <div v-if="subtitle" class="truncate text-xs text-base-content/50">{{ subtitle }}</div>
  </div>
</template>
