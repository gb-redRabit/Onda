<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ArrowUpDown, ChevronDown, Disc3, Search } from '@lucide/vue';
import type { ChipId, SortDir, SortKey } from '@renderer/utils/libraryView';

defineProps<{ tab: string; chips: Array<{ id: ChipId; label: string }>; count: number }>();
const emit = defineEmits<{ openMusicbrainz: [] }>();

const query = defineModel<string>('query', { required: true });
const sortKey = defineModel<SortKey>('sortKey', { required: true });
const sortDir = defineModel<SortDir>('sortDir', { required: true });
const chip = defineModel<ChipId>('chip', { required: true });

const { t } = useI18n();
</script>

<template>
  <!-- Search + controls row -->
  <div v-if="tab !== 'playlists'" class="flex gap-2 mt-3">
    <div class="relative flex-1 group">
      <Search
        :size="14"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 group-focus-within:text-primary transition-colors"
      />
      <input
        v-model="query"
        :placeholder="tab === 'overview' ? t('library.searchPlaceholder') : t('library.search')"
        class="w-full pl-9 pr-8 py-2.5 rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-base-content/40 transition-all"
      />
      <button
        v-if="query"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-selector hover:bg-base-300 text-base-content/40 hover:text-base-content transition-colors"
        @click="query = ''"
      >
        ×
      </button>
    </div>

    <!-- Sort + view mode for tracks -->
    <div v-if="tab === 'tracks'" class="hidden sm:flex items-center gap-1.5 shrink-0">
      <div class="relative">
        <select
          v-model="sortKey"
          class="appearance-none pl-2.5 pr-6 py-2.5 rounded-field bg-base-100 border border-base-300 text-xs font-medium focus:border-primary focus:outline-none cursor-pointer"
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
          class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-base-content/40"
        />
      </div>
      <button
        class="p-2.5 rounded-selector bg-base-100 border border-base-300 hover:border-primary/30 text-base-content/60 hover:text-primary transition-colors"
        :title="sortDir === 'asc' ? '↑' : '↓'"
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
      class="hidden md:flex items-center gap-1.5 px-3 py-2.5 rounded-field bg-primary/10 text-primary text-xs font-medium hover:bg-primary hover:text-primary-content transition-colors shrink-0 border border-primary/20 fx-depth"
      :title="t('library.searchInMusicBrainz')"
      @click="emit('openMusicbrainz')"
    >
      <Disc3 :size="14" /> <span class="hidden xl:inline">MusicBrainz</span>
    </button>
  </div>

  <!-- Quick filter chips — Spotify-like -->
  <div
    v-if="tab === 'tracks'"
    class="flex gap-1.5 mt-2.5 overflow-x-auto scrollbar-none pb-1"
    style="scrollbar-width: none"
  >
    <button
      v-for="c in chips"
      :key="c.id"
      class="px-3 py-1.5 rounded-selector text-xs font-medium whitespace-nowrap border transition-all duration-150"
      :class="
        chip === c.id
          ? 'bg-base-content text-base-100 border-base-content'
          : 'bg-base-100 text-base-content/70 border-base-300 hover:border-base-content/20 hover:text-base-content'
      "
      @click="chip = c.id"
    >
      {{ c.label }}
    </button>
    <span class="ml-auto text-[11px] text-base-content/40 self-center hidden sm:inline"
      >{{ count }} {{ t('library.tracksCount') }}</span
    >
  </div>
</template>
