<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { RadioTower, Play, Trash2, Plus } from '@lucide/vue';
import { useSavedStore } from '@renderer/stores/saved';
import { useOnlineStore } from '@renderer/stores/online';
import { useRadioStore } from '@renderer/stores/radio';
import WebcastRadioTab from '@renderer/components/webcast/WebcastRadioTab.vue';
import WebcastSavedPlaylists from '@renderer/components/webcast/WebcastSavedPlaylists.vue';
import { toResolvedItem as toItem } from '@renderer/utils/savedItem';
import RadioAddDialog from '@renderer/components/radio/RadioAddDialog.vue';
import { useVirtualGrid } from '@renderer/composables/useVirtualGrid';
import PageHeader from '@renderer/components/ui/PageHeader.vue';
import EmptyState from '@renderer/components/ui/EmptyState.vue';

type WebcastTab = 'radio' | 'saved';

const saved = useSavedStore();
const yt = useOnlineStore();
const radio = useRadioStore();

const activeTab = ref<WebcastTab>(
  (localStorage.getItem('onda.webcastTab') as WebcastTab) || 'saved'
);

function selectTab(tab: WebcastTab) {
  activeTab.value = tab;
  localStorage.setItem('onda.webcastTab', tab);
}

const radioDialogOpen = ref(false);
const trackGridRef = ref<HTMLElement | null>(null);
const trackGrid = useVirtualGrid(trackGridRef, 220, 4);
const savedTrackRows = useVirtualizer({
  get count() {
    return Math.ceil(saved.tracks.length / trackGrid.cols.value);
  },
  getScrollElement: () => trackGridRef.value,
  estimateSize: () => 220,
  overscan: 3
});
const visibleSavedRows = computed(() => {
  const columns = trackGrid.cols.value;
  return savedTrackRows.value.getVirtualItems().map((row) => ({
    top: row.start,
    tracks: saved.tracks.slice(row.index * columns, (row.index + 1) * columns)
  }));
});

onMounted(() => {
  void saved.ensureLoaded();
  void radio.ensureLoaded();
  if (activeTab.value === 'saved') trackGrid.observe();
});

watch(activeTab, async (tab) => {
  if (tab === 'saved') {
    await nextTick();
    trackGrid.observe();
  } else {
    trackGrid.destroy();
  }
});

onBeforeUnmount(() => trackGrid.destroy());

function playTrack(s: {
  id: string;
  title: string;
  duration?: string;
  thumbnail?: string;
  url?: string;
}) {
  void yt.playStream(toItem(s));
}

function queueTrack(s: {
  id: string;
  title: string;
  duration?: string;
  thumbnail?: string;
  url?: string;
}) {
  void yt.queueSavedTrack(s);
}

function removeTrack(id: string) {
  void saved.removeTrack(id);
}

const trackCount = computed(() => saved.tracks.length);
</script>

<template>
  <div data-testid="webcast-view" class="flex flex-col h-full">
    <PageHeader :title="$t('saved.title')" :icon="RadioTower" sticky>
      <div class="ui-segmented" role="tablist" :aria-label="$t('saved.title')">
        <button
          type="button"
          role="tab"
          data-testid="webcast-tab-radio"
          :aria-selected="activeTab === 'radio'"
          @click="selectTab('radio')"
        >
          {{ $t('saved.radioTitle') }}
        </button>
        <button
          type="button"
          role="tab"
          data-testid="webcast-tab-saved"
          :aria-selected="activeTab === 'saved'"
          @click="selectTab('saved')"
        >
          {{ $t('saved.tabSaved') }}
        </button>
      </div>
    </PageHeader>

    <div class="flex-1 overflow-y-auto px-6 py-6 space-y-8">
      <!-- Radio tab -->
      <WebcastRadioTab v-if="activeTab === 'radio'" @add="radioDialogOpen = true" />

      <!-- Saved tab -->
      <template v-else>
        <!-- Saved tracks -->
        <section>
          <h2 class="flex items-center gap-2 text-sm font-semibold text-base-content/70 mb-3">
            <Play :size="14" class="text-primary" />
            {{ $t('saved.tracksTitle') }}
            <span class="text-base-content/60 text-xs">({{ trackCount }})</span>
          </h2>

          <EmptyState
            v-if="trackCount === 0"
            :title="$t('saved.emptyTracks')"
            :icon="Play"
            compact
          />

          <div
            v-else
            ref="trackGridRef"
            class="max-h-[70vh] overflow-auto"
            :aria-label="$t('saved.tracksTitle')"
          >
            <div class="relative" :style="{ height: savedTrackRows.getTotalSize() + 'px' }">
              <div
                v-for="(row, rowIndex) in visibleSavedRows"
                :key="rowIndex"
                class="absolute top-0 left-0 grid w-full gap-3 pb-3"
                :style="{
                  transform: `translateY(${row.top}px)`,
                  gridTemplateColumns: `repeat(${trackGrid.cols.value}, minmax(0, 1fr))`
                }"
              >
                <div
                  v-for="s in row.tracks"
                  :key="s.id"
                  class="group rounded-box bg-base-100 border border-base-300 p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-base-300"
                >
                  <div class="relative overflow-hidden rounded-box bg-base-100 aspect-video">
                    <img
                      v-if="s.thumbnail"
                      :src="s.thumbnail"
                      :alt="s.title"
                      loading="lazy"
                      class="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                      class="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-neutral/30 transition-opacity"
                    >
                      <button
                        type="button"
                        class="p-2 rounded-full bg-neutral-content/20 text-neutral-content hover:bg-neutral-content/35 transition-colors"
                        :title="$t('youtube.playStream')"
                        :aria-label="$t('youtube.playStream')"
                        @click="playTrack(s)"
                      >
                        <Play :size="20" fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        class="p-2 rounded-full bg-neutral-content/20 text-neutral-content hover:bg-neutral-content/35 transition-colors"
                        :title="$t('saved.addToQueue')"
                        :aria-label="$t('saved.addToQueue')"
                        @click="queueTrack(s)"
                      >
                        <Plus :size="20" />
                      </button>
                      <button
                        type="button"
                        class="p-2 rounded-full bg-error/60 text-error-content hover:bg-error transition-colors fx-depth"
                        :title="$t('common.delete')"
                        :aria-label="$t('common.delete')"
                        @click="removeTrack(s.id)"
                      >
                        <Trash2 :size="18" />
                      </button>
                    </div>
                    <span
                      v-if="s.duration"
                      class="absolute bottom-1.5 right-1.5 bg-neutral/80 text-neutral-content text-[10px] px-1.5 py-0.5 rounded-field"
                    >
                      {{ s.duration }}
                    </span>
                  </div>
                  <div class="mt-2">
                    <h3 class="text-sm font-semibold text-base-content line-clamp-2">
                      {{ s.title }}
                    </h3>
                    <p class="text-xs text-base-content/70 mt-0.5 truncate">{{ s.channelTitle }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Saved playlists -->
        <WebcastSavedPlaylists />
      </template>

      <RadioAddDialog v-model="radioDialogOpen" />
    </div>
  </div>
</template>
