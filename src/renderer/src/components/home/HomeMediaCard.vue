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
    class="group w-36 sm:w-38 shrink-0 cursor-pointer rounded-box border border-base-300/75 bg-base-100 p-2.5 text-left transition-colors hover:border-base-content/20 hover:bg-base-content/3"
    @click="emit('play')"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="relative" :class="stacked && !round ? 'pt-1.5' : ''">
      <!-- Stos kart: tylko kolekcje (playlisty/albumy), nigdy okrągły avatar. -->
      <template v-if="stacked && !round">
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-3 top-0 bottom-2 rounded-field border border-base-300/60 bg-base-200/60"
        />
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-1.5 top-0.5 bottom-1 rounded-field border border-base-300/75 bg-base-200/90"
        />
      </template>

      <div
        class="relative aspect-square overflow-hidden bg-base-200"
        :class="
          round
            ? 'rounded-full ring-1 ring-base-content/10 transition-shadow group-hover:ring-primary/40'
            : 'rounded-field'
        "
      >
        <MediaCover
          :path="coverPath"
          :size="coverSize"
          :fallback="fallback"
          class="h-full w-full transition-transform duration-300 ease-out group-hover:scale-105"
        />

        <!-- Ciemny subtelny gradient na dole okładki (spójny z LibraryTrackCard). -->
        <div
          class="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />

        <span
          v-if="badge"
          class="absolute left-1.5 top-1.5 rounded-field bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-xs"
        >
          {{ badge }}
        </span>

        <button
          v-if="openLabel"
          type="button"
          class="absolute right-1.5 top-1.5 z-10 grid h-6.5 w-6.5 place-items-center rounded-field bg-black/55 text-white/90 opacity-0 backdrop-blur-xs transition-opacity hover:bg-black/75 group-hover:opacity-100 group-focus-within:opacity-100"
          :title="openLabel"
          :aria-label="openLabel"
          @click.stop="emit('open')"
        >
          <ArrowRight :size="13" />
        </button>

        <!-- Kwadratowe okładki: Play w prawym dolnym rogu. -->
        <button
          v-if="!round"
          type="button"
          class="absolute bottom-2 right-2 z-10 grid h-8.5 w-8.5 translate-y-1 place-items-center rounded-full bg-primary text-primary-content opacity-0 shadow-md transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
          :aria-label="$t('common.play')"
          @click.stop="emit('play')"
        >
          <Play :size="15" fill="currentColor" class="ml-0.5" />
        </button>
        <!-- Okrągłe awatary: Play na środku koła. -->
        <button
          v-else
          type="button"
          class="absolute inset-0 z-10 grid place-items-center rounded-full bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          :aria-label="$t('common.play')"
          @click.stop="emit('play')"
        >
          <span
            class="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-content shadow-md"
          >
            <Play :size="15" fill="currentColor" class="ml-0.5" />
          </span>
        </button>
      </div>
    </div>

    <div class="mt-2 px-0.5">
      <div class="truncate text-xs font-medium text-base-content" :title="title">
        {{ title }}
      </div>
      <div v-if="subtitle" class="mt-0.5 truncate text-[11px] text-base-content/50">
        {{ subtitle }}
      </div>
    </div>
  </div>
</template>
