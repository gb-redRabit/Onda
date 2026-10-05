<script setup lang="ts">
import { computed, ref } from 'vue';
import { X, ListMusic, Play } from '@lucide/vue';

const props = defineProps<{
  count: number;
  playlists: Array<{ id: string; name: string }>;
}>();

// Etykiety akcji roboczych nie mają nazw liczby mnogiej (np. „Dodaj do kolejki"),
// więc przy pojedynczym utworze mówimy wprost o utworze.
const isSingle = computed(() => props.count === 1);

const emit = defineEmits<{
  play: [];
  queue: [];
  'add-to-playlist': [id: string];
  clear: [];
}>();

const showBulkPlaylist = ref(false);
</script>

<template>
  <div
    data-testid="library-selection-bar"
    class="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs shrink-0"
  >
    <span class="font-medium text-primary">{{ count }} {{ $t('common.selected') }}</span>
    <div class="flex items-center gap-1 ml-auto">
      <button
        class="px-2.5 py-1 rounded-field bg-primary text-primary-content hover:bg-primary/90 flex items-center gap-1 fx-depth fx-noise"
        @click="emit('play')"
      >
        <Play :size="12" /> {{ $t('common.play') }}
      </button>
      <button
        class="px-2.5 py-1 rounded-field bg-base-100 border border-base-300 hover:bg-base-200"
        @click="emit('queue')"
      >
        <ListMusic :size="12" class="inline mr-1" />
        {{ isSingle ? $t('common.addTrackToQueue') : $t('common.addToQueue') }}
      </button>
      <div class="relative">
        <button
          class="px-2.5 py-1 rounded-field bg-base-100 border border-base-300 hover:bg-base-200"
          @click="showBulkPlaylist = !showBulkPlaylist"
        >
          {{ isSingle ? $t('common.addTrackToPlaylist') : $t('common.addToPlaylist') }}
        </button>
        <div
          v-if="showBulkPlaylist"
          class="absolute right-0 top-full mt-1 w-48 bg-base-100 border border-base-300 rounded-box shadow-xl py-1 z-20 max-h-48 overflow-auto"
        >
          <button
            v-for="p in playlists"
            :key="p.id"
            class="w-full text-left px-3 py-1.5 text-xs hover:bg-base-content/10 truncate"
            @click="emit('add-to-playlist', p.id)"
          >
            {{ p.name }}
          </button>
          <div
            v-if="playlists.length === 0"
            class="px-3 py-1.5 text-xs text-base-content/50 italic"
          >
            {{ $t('common.noPlaylists') }}
          </div>
        </div>
      </div>
      <button
        data-testid="library-selection-clear"
        class="p-1 rounded-field hover:bg-base-300 text-base-content/60"
        :aria-label="$t('common.clear')"
        @click="emit('clear')"
      >
        <X :size="12" />
      </button>
    </div>
  </div>
</template>
