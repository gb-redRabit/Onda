<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { ArrowLeft, Users, Download, LayoutGrid, Rows3 } from '@lucide/vue';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { formatNumber } from '@renderer/utils/formatters';
import type { YouTubeVideo } from '@renderer/types/youtube';
import YouTubeVideoCard from './YouTubeVideoCard.vue';

const yt = useYouTubeStore();

const featured = computed(() =>
  yt.channelVideos.slice(0, Math.min(6, Math.max(3, yt.channelVideos.length)))
);
const rest = computed(() => yt.channelVideos.slice(featured.value.length));

function queueVideo(v: YouTubeVideo) {
  yt.queueVideo(v);
}

const sentinelRef = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function maybeLoadMore() {
  if (!yt.channelHasMore || yt.channelLoading) return;
  const el = sentinelRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (rect.top <= window.innerHeight + 200) {
    void yt.loadMoreChannel();
  }
}

function setSentinel(el: Element | ComponentPublicInstance | null) {
  sentinelRef.value = el instanceof Element ? (el as HTMLElement) : null;
  if (!observer) return;
  observer.disconnect();
  if (el instanceof Element) observer.observe(el);
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) maybeLoadMore();
    },
    { root: null, rootMargin: '200px 0px' }
  );
});

onUnmounted(() => {
  observer?.disconnect();
  observer = null;
});

// After a page finishes loading the sentinel may still be in view (short list),
// so keep pulling pages until it scrolls out of the viewport.
watch(
  () => [yt.channelLoading, yt.channelHasMore],
  () => maybeLoadMore(),
  { flush: 'post' }
);
</script>

<template>
  <div class="space-y-4 w-full">
    <div v-if="yt.channelLoading && !yt.channel" class="flex justify-center py-16">
      <div
        class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
      />
    </div>
    <template v-else-if="yt.channel">
      <div class="flex items-center gap-4">
        <button
          class="p-2 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors shrink-0"
          @click="yt.closeChannel"
        >
          <ArrowLeft :size="16" />
        </button>
        <div
          v-if="yt.channel.thumbnail"
          class="w-14 h-14 rounded-full overflow-hidden shrink-0 bg-bg-elevated"
        >
          <img
            :src="yt.channel.thumbnail"
            :alt="yt.channel.title"
            class="w-full h-full object-cover"
          />
        </div>
        <div
          v-else
          class="w-14 h-14 rounded-full bg-bg-elevated border border-border-default flex items-center justify-center shrink-0 text-fg-faint"
        >
          <Users :size="22" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-bold truncate">{{ yt.channel.title }}</h2>
          <p v-if="yt.channel.subscriberCount != null" class="text-xs text-fg-faint">
            {{ formatNumber(yt.channel.subscriberCount) }} {{ $t('youtube.subscribers') }}
          </p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button
            class="p-2 rounded-lg transition-colors"
            :class="
              yt.channelViewMode === 'grid'
                ? 'bg-accent-base text-white'
                : 'border border-border-default text-fg-muted hover:bg-bg-hover'
            "
            :title="$t('youtube.viewTiles')"
            @click="yt.setChannelViewMode('grid')"
          >
            <LayoutGrid :size="14" />
          </button>
          <button
            class="p-2 rounded-lg transition-colors"
            :class="
              yt.channelViewMode === 'list'
                ? 'bg-accent-base text-white'
                : 'border border-border-default text-fg-muted hover:bg-bg-hover'
            "
            :title="$t('youtube.viewList')"
            @click="yt.setChannelViewMode('list')"
          >
            <Rows3 :size="14" />
          </button>
        </div>
      </div>

      <p v-if="yt.channelError" class="text-xs text-red-400">{{ yt.channelError }}</p>

      <div v-if="featured.length">
        <h3 class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-3">
          {{ $t('youtube.latest') }}
        </h3>
        <div class="grid gap-4 w-full grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          <YouTubeVideoCard v-for="v in featured" :key="v.id" :video="v" @queue="queueVideo" />
        </div>
      </div>

      <div class="flex gap-4 border-b border-border-default">
        <button
          class="py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            yt.channelTab === 'videos'
              ? 'border-accent-base text-fg-base'
              : 'border-transparent text-fg-faint hover:text-fg-muted'
          "
          @click="yt.switchChannelTab('videos')"
        >
          {{ $t('youtube.videosTab') }}
        </button>
        <button
          v-if="yt.channelHasShorts"
          class="py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
          :class="
            yt.channelTab === 'shorts'
              ? 'border-accent-base text-fg-base'
              : 'border-transparent text-fg-faint hover:text-fg-muted'
          "
          @click="yt.switchChannelTab('shorts')"
        >
          {{ $t('youtube.shortsTab') }}
        </button>
      </div>

      <div
        v-if="yt.channelLoading && yt.channelTab === 'videos' && !yt.channelVideos.length"
        class="flex justify-center py-8"
      >
        <div
          class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
        />
      </div>

      <template v-if="yt.channelTab === 'videos'">
        <div v-if="rest.length">
          <h3 class="text-xs text-fg-faint font-medium uppercase tracking-wider mb-3">
            {{ $t('youtube.allVideos') }}
          </h3>
          <div
            v-if="yt.channelViewMode === 'grid'"
            class="grid gap-4 w-full grid-cols-[repeat(auto-fill,minmax(170px,1fr))]"
          >
            <YouTubeVideoCard v-for="v in rest" :key="v.id" :video="v" @queue="queueVideo" />
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="v in rest"
              :key="v.id"
              class="flex gap-3 p-2 rounded-xl hover:bg-bg-hover transition-colors group items-center"
            >
              <div
                class="w-32 aspect-video rounded-lg bg-bg-elevated overflow-hidden shrink-0 relative"
              >
                <img
                  v-if="v.thumbnail"
                  :src="v.thumbnail"
                  :alt="v.title"
                  class="w-full h-full object-cover"
                />
                <div
                  v-if="v.duration"
                  class="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded"
                >
                  {{ v.duration }}
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium line-clamp-1 mb-0.5">{{ v.title }}</h3>
                <p class="text-xs text-fg-faint truncate">
                  <template v-if="v.viewCount">
                    {{ formatNumber(v.viewCount) }} {{ $t('youtube.views') }} ·
                  </template>
                  <template v-if="v.publishedAt">{{ v.publishedAt }}</template>
                </p>
              </div>
              <button
                class="p-2 rounded-lg bg-accent-base text-white hover:bg-accent-hover transition-colors shrink-0"
                @click="queueVideo(v)"
              >
                <Download :size="14" />
              </button>
            </div>
          </div>
        </div>

        <p v-if="!featured.length && !rest.length" class="text-sm text-fg-faint py-8 text-center">
          {{ $t('youtube.noVideos') }}
        </p>
      </template>

      <template v-else>
        <div v-if="yt.channelLoading && !yt.channelShorts.length" class="flex justify-center py-8">
          <div
            class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
          />
        </div>
        <div
          v-else-if="yt.channelShorts.length"
          class="grid gap-4 w-full grid-cols-[repeat(auto-fill,minmax(140px,1fr))]"
        >
          <YouTubeVideoCard
            v-for="v in yt.channelShorts"
            :key="v.id"
            :video="v"
            short
            @queue="queueVideo"
          />
        </div>
        <p v-else class="text-sm text-fg-faint py-8 text-center">
          {{ $t('youtube.noVideos') }}
        </p>
      </template>

      <div v-if="yt.channelHasMore" :ref="setSentinel" class="flex justify-center py-4">
        <div
          v-if="yt.channelLoading"
          class="w-6 h-6 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
        />
      </div>
    </template>
  </div>
</template>
