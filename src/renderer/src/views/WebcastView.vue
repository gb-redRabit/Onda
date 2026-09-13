<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RadioTower, Play, Trash2, Plus } from '@lucide/vue';
import { useSavedStore } from '@renderer/stores/saved';
import { useOnlineStore } from '@renderer/stores/online';
import { useRadioStore } from '@renderer/stores/radio';
import WebcastRadioTab from '@renderer/components/webcast/WebcastRadioTab.vue';
import WebcastSavedPlaylists from '@renderer/components/webcast/WebcastSavedPlaylists.vue';
import { toResolvedItem as toItem } from '@renderer/utils/savedItem';
import RadioAddDialog from '@renderer/components/radio/RadioAddDialog.vue';

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

onMounted(() => {
  void saved.ensureLoaded();
  void radio.ensureLoaded();
});

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
  <div class="flex flex-col h-full">
    <header
      class="sticky top-0 z-10 bg-base-100/(--glass-alpha) backdrop-blur border border-b border-base-300 px-6 py-5"
    >
      <div class="flex items-center gap-3">
        <RadioTower :size="24" class="text-primary" />
        <h1 class="text-xl font-bold">{{ $t('saved.title') }}</h1>
        <div class="flex-1" />
      </div>
      <div class="flex gap-1 mt-4">
        <button
          type="button"
          class="fx-noise px-3 py-1.5 fx-depth rounded-field text-sm font-medium transition-colors"
          :class="
            activeTab === 'radio'
              ? 'bg-primary/15 text-primary'
              : 'text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          @click="selectTab('radio')"
        >
          {{ $t('saved.radioTitle') }}
        </button>
        <button
          type="button"
          class="fx-noise px-3 py-1.5 fx-depth rounded-field text-sm font-medium transition-colors"
          :class="
            activeTab === 'saved'
              ? 'bg-primary/15 text-primary'
              : 'text-base-content/70 hover:text-base-content hover:bg-base-content/10'
          "
          @click="selectTab('saved')"
        >
          {{ $t('saved.tabSaved') }}
        </button>
      </div>
    </header>

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

          <div
            v-if="trackCount === 0"
            class="rounded-box border border-dashed border-base-300 p-8 text-center text-sm text-base-content/50"
          >
            {{ $t('saved.emptyTracks') }}
          </div>

          <div v-else class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="s in saved.tracks"
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
                    @click="playTrack(s)"
                  >
                    <Play :size="20" fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    class="p-2 rounded-full bg-neutral-content/20 text-neutral-content hover:bg-neutral-content/35 transition-colors"
                    :title="$t('saved.addToQueue')"
                    @click="queueTrack(s)"
                  >
                    <Plus :size="20" />
                  </button>
                  <button
                    type="button"
                    class="p-2 rounded-full bg-error/60 text-error-content hover:bg-error transition-colors fx-depth"
                    :title="$t('common.delete')"
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
                <h3 class="text-sm font-semibold text-base-content line-clamp-2">{{ s.title }}</h3>
                <p class="text-xs text-base-content/70 mt-0.5 truncate">{{ s.channelTitle }}</p>
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
