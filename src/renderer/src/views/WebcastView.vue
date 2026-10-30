<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useVirtualList } from '@renderer/composables/useVirtualList';
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
import { readString, writeString } from '@renderer/utils/localStore';

type WebcastTab = 'radio' | 'saved';

const saved = useSavedStore();
const yt = useOnlineStore();
const radio = useRadioStore();

const savedWebcastTab = readString('onda.webcastTab');
const activeTab = ref<WebcastTab>(
  savedWebcastTab === 'radio' || savedWebcastTab === 'saved' ? savedWebcastTab : 'saved'
);

function selectTab(tab: WebcastTab) {
  activeTab.value = tab;
  writeString('onda.webcastTab', tab);
}

// Wzorzec WAI-ARIA tabs: strzałki/Home/End przenoszą focus i wybór.
const webcastTablistRef = ref<HTMLElement | null>(null);
const WEBCAST_TABS: WebcastTab[] = ['radio', 'saved'];
function onTabKeydown(e: KeyboardEvent, index: number): void {
  const n = WEBCAST_TABS.length;
  let next = index;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % n;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + n) % n;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = n - 1;
  else return;
  e.preventDefault();
  selectTab(WEBCAST_TABS[next]!);
  nextTick(() =>
    webcastTablistRef.value?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  );
}

const radioDialogOpen = ref(false);
const trackGridRef = ref<HTMLElement | null>(null);
const trackGrid = useVirtualGrid(trackGridRef, 220, 4);
const savedTrackRows = useVirtualList({
  count: () => Math.ceil(saved.tracks.length / trackGrid.cols.value),
  scrollEl: () => trackGridRef.value,
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
      <div
        ref="webcastTablistRef"
        class="ui-segmented"
        role="tablist"
        :aria-label="$t('saved.title')"
      >
        <button
          type="button"
          role="tab"
          data-testid="webcast-tab-radio"
          :aria-selected="activeTab === 'radio'"
          :tabindex="activeTab === 'radio' ? 0 : -1"
          @click="selectTab('radio')"
          @keydown="onTabKeydown($event, 0)"
        >
          {{ $t('saved.radioTitle') }}
        </button>
        <button
          type="button"
          role="tab"
          data-testid="webcast-tab-saved"
          :aria-selected="activeTab === 'saved'"
          :tabindex="activeTab === 'saved' ? 0 : -1"
          @click="selectTab('saved')"
          @keydown="onTabKeydown($event, 1)"
        >
          {{ $t('saved.tabSaved') }}
        </button>
      </div>
    </PageHeader>

    <div class="flex-1 overflow-y-auto px-6 py-6 space-y-8">
      <!-- Zakładka radia -->
      <WebcastRadioTab v-if="activeTab === 'radio'" @add="radioDialogOpen = true" />

      <!-- Zakładka zapisanych -->
      <template v-else>
        <!-- Zapisane utwory -->
        <section>
          <h2 class="flex items-center gap-2 text-sm font-semibold text-base-content/70 mb-3">
            <Play :size="14" class="text-primary-text" />
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
                  class="group rounded-box bg-base-100 border border-base-300/80 p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-base-content/20"
                >
                  <div class="relative overflow-hidden rounded-field bg-base-200 aspect-video">
                    <img
                      v-if="s.thumbnail"
                      :src="s.thumbnail"
                      :alt="s.title"
                      loading="lazy"
                      class="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <div
                      class="absolute inset-0 bg-linear-to-t from-black/65 via-black/15 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    >
                      <div class="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          type="button"
                          class="grid h-7 w-7 place-items-center rounded-field bg-black/55 text-white/90 backdrop-blur-sm hover:bg-black/75 transition-colors"
                          :title="$t('saved.addToQueue')"
                          :aria-label="$t('saved.addToQueue')"
                          @click="queueTrack(s)"
                        >
                          <Plus :size="14" />
                        </button>
                        <button
                          type="button"
                          class="grid h-7 w-7 place-items-center rounded-field bg-black/55 text-white/90 backdrop-blur-sm hover:bg-error hover:text-error-content transition-colors"
                          :title="$t('common.delete')"
                          :aria-label="$t('common.delete')"
                          @click="removeTrack(s.id)"
                        >
                          <Trash2 :size="13" />
                        </button>
                      </div>
                      <button
                        type="button"
                        class="absolute right-2 bottom-2 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-content shadow-md transition-transform hover:scale-105 active:scale-95"
                        :title="$t('youtube.playStream')"
                        :aria-label="$t('youtube.playStream')"
                        @click="playTrack(s)"
                      >
                        <Play :size="16" fill="currentColor" class="ml-0.5" />
                      </button>
                    </div>
                    <span
                      v-if="s.duration"
                      class="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-3xs font-mono px-1.5 py-0.5 rounded-field backdrop-blur-xs"
                    >
                      {{ s.duration }}
                    </span>
                  </div>
                  <div class="mt-2 px-0.5">
                    <h3 class="text-xs font-medium text-base-content line-clamp-2 leading-snug">
                      {{ s.title }}
                    </h3>
                    <p class="text-2xs text-base-content/55 mt-0.5 truncate">
                      {{ s.channelTitle }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Zapisane playlisty -->
        <WebcastSavedPlaylists />
      </template>

      <RadioAddDialog v-model="radioDialogOpen" />
    </div>
  </div>
</template>
