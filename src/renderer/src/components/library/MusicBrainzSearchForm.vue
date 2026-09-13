<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search } from '@lucide/vue';
import { buildMusicbrainzQuery } from '@renderer/utils/musicbrainz';

defineProps<{ loading: boolean }>();
const emit = defineEmits<{ search: [] }>();
const artist = defineModel<string>('artist', { required: true });
const title = defineModel<string>('title', { required: true });
const album = defineModel<string>('album', { required: true });
const year = defineModel<string>('year', { required: true });

const { t } = useI18n();

const canSearch = computed(
  () =>
    !!buildMusicbrainzQuery({
      artist: artist.value,
      title: title.value,
      album: album.value,
      year: year.value
    }).trim()
);
</script>

<template>
  <div class="p-4 border-b border-base-300 shrink-0 space-y-2">
    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-base-content/60">Wykonawca / Artysta</span>
        <input
          v-model="artist"
          placeholder="np. Skillet"
          class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
          @keydown.enter="emit('search')"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-base-content/60">Tytuł</span>
        <input
          v-model="title"
          placeholder="np. Monster"
          class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
          @keydown.enter="emit('search')"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-base-content/60">Album / Wydanie</span>
        <input
          v-model="album"
          placeholder="np. Awake"
          class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
          @keydown.enter="emit('search')"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[11px] text-base-content/60">Rok</span>
        <input
          v-model="year"
          placeholder="np. 2009"
          class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
          @keydown.enter="emit('search')"
        />
      </label>
    </div>
    <div class="flex gap-2">
      <div class="flex-1 text-[11px] text-base-content/40 self-center truncate">
        Puste pola pomijane • np. Artysta + Album
      </div>
      <button
        class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        :disabled="loading || !canSearch"
        @click="emit('search')"
      >
        <Search :size="14" /> {{ t('musicbrainz.search') }}
      </button>
    </div>
  </div>
</template>
