<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ArrowUpDown, ChevronDown, Disc3, Search, X } from '@lucide/vue';
import type { ChipId, SortDir, SortKey } from '@renderer/utils/libraryView';
import Input from '@renderer/components/ui/Input.vue';

defineProps<{ tab: string; chips: Array<{ id: ChipId; label: string }> }>();
const emit = defineEmits<{ openMusicbrainz: [] }>();

const query = defineModel<string>('query', { required: true });
const sortKey = defineModel<SortKey>('sortKey', { required: true });
const sortDir = defineModel<SortDir>('sortDir', { required: true });
const chip = defineModel<ChipId>('chip', { required: true });

const { t } = useI18n();
</script>

<template>
  <!-- Wiersz wyszukiwania + kontrolek -->
  <div v-if="tab !== 'playlists'" class="flex items-center gap-2 mt-2.5">
    <div class="relative flex-1 group">
      <Search
        :size="14"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 group-focus-within:text-primary-text transition-colors pointer-events-none"
      />
      <Input
        v-model="query"
        class="pl-9 pr-8"
        :placeholder="tab === 'overview' ? t('library.searchPlaceholder') : t('library.search')"
      />
      <button
        v-if="query"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-base-content/10 text-base-content/50 hover:text-base-content transition-colors"
        :aria-label="t('common.close')"
        @click="query = ''"
      >
        <X :size="13" />
      </button>
    </div>

    <!-- Sortowanie + tryb widoku dla utworów -->
    <div v-if="tab === 'tracks'" class="hidden sm:flex items-center gap-1.5 shrink-0">
      <div class="relative">
        <select
          v-model="sortKey"
          class="appearance-none h-9 pl-2.5 pr-7 rounded-field bg-base-200/70 border border-base-300/80 text-xs font-medium focus:border-primary/50 focus:outline-hidden cursor-pointer"
        >
          <option value="added">{{ t('library.sortAdded') }}</option>
          <option value="title">{{ t('library.sortTitle') }}</option>
          <option value="artist">{{ t('library.sortArtist') }}</option>
          <option value="album">{{ t('library.sortAlbum') }}</option>
          <option value="duration">{{ t('library.sortDuration') }}</option>
          <option value="plays">{{ t('library.sortPlays') }}</option>
        </select>
        <ChevronDown
          :size="12"
          class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-base-content/55"
        />
      </div>
      <button
        class="grid h-9 w-9 place-items-center rounded-field bg-base-200/70 border border-base-300/80 hover:border-primary/40 text-base-content/65 hover:text-primary-text transition-colors"
        :title="sortDir === 'asc' ? '↑' : '↓'"
        :aria-label="sortDir === 'asc' ? '↑' : '↓'"
        @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
      >
        <ArrowUpDown
          :size="14"
          :class="sortDir === 'desc' ? 'rotate-180' : ''"
          class="transition-transform"
        />
      </button>
    </div>

    <button
      v-if="tab === 'tracks'"
      class="hidden md:inline-flex h-9 items-center gap-1.5 px-3 rounded-field bg-primary/10 text-primary-text text-xs font-medium hover:bg-primary/18 transition-colors shrink-0 border border-primary/25"
      :title="t('library.searchInMusicBrainz')"
      @click="emit('openMusicbrainz')"
    >
      <Disc3 :size="14" /> <span class="hidden xl:inline">MusicBrainz</span>
    </button>
  </div>

  <!-- Szybkie filtry (chips) -->
  <div
    v-if="tab === 'tracks'"
    class="flex items-center gap-1.5 mt-2 overflow-x-auto scrollbar-none pb-0.5"
    style="scrollbar-width: none"
  >
    <button
      v-for="c in chips"
      :key="c.id"
      class="h-7 px-3 rounded-full text-xs font-medium whitespace-nowrap border transition-colors duration-150"
      :class="
        chip === c.id
          ? 'bg-primary/18 text-primary-text border-primary/35'
          : 'bg-base-200/50 text-base-content/65 border-base-300/70 hover:border-base-content/20 hover:text-base-content'
      "
      @click="chip = c.id"
    >
      {{ c.label }}
    </button>
  </div>
</template>
