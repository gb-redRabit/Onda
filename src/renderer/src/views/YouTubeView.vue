<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Search,
  Play,
  Download,
  ExternalLink,
  Tv2,
  Check,
  X,
  CheckSquare,
  ChevronLeft,
  ChevronRight
} from '@lucide/vue';
import { useYouTubeStore } from '@renderer/stores/youtube';
import { formatNumber } from '@renderer/utils/formatters';
import { detectYtKind } from '@shared/youtube';
import YouTubeChannelView from '@renderer/components/youtube/YouTubeChannelView.vue';
import type { YouTubeSearchResult, YouTubeVideo } from '@renderer/types/youtube';

const yt = useYouTubeStore();

const input = ref('');
const resolveError = ref('');
const addedFlash = ref(false);

const isResolvable = computed(() => detectYtKind(input.value) !== null);

const kindKey = computed(() => {
  switch (yt.resolved?.kind) {
    case 'playlist':
      return 'youtube.kindPlaylist';
    case 'channel':
      return 'youtube.kindChannel';
    default:
      return 'youtube.kindVideo';
  }
});

const kindBadgeClass = computed(() => {
  switch (yt.resolved?.kind) {
    case 'playlist':
      return 'bg-amber-base/15 text-amber-base';
    case 'channel':
      return 'bg-green-base/15 text-green-base';
    default:
      return 'bg-accent-ghost text-accent-base';
  }
});

const selectedCount = computed(() => yt.selectedResolved.size);

const pageTotal = computed(() => Math.ceil(yt.searchResults.length / 20));

async function submit() {
  if (!input.value.trim()) return;
  if (isResolvable.value) {
    await resolveLink();
  } else {
    await search();
  }
}

async function search() {
  if (!input.value.trim()) return;
  yt.setResolved(null);
  yt.closeChannel();
  yt.isSearching = true;
  yt.searchQuery = input.value;
  try {
    const result = (await window.api.invoke(
      'yt:search',
      input.value
    )) as YouTubeSearchResult | null;
    if (result) yt.setResults(result.items || [], result.nextPageToken, result.prevPageToken);
  } catch {
    /* YouTube search failed */
  }
  yt.isSearching = false;
}

async function resolveLink() {
  const url = input.value.trim();
  if (!url) return;
  yt.isResolving = true;
  resolveError.value = '';
  addedFlash.value = false;
  try {
    const res = await window.api.invoke('yt:resolve', url);
    if (res.success && res.result) {
      if (res.result.kind === 'channel') {
        yt.setResolved(null);
        await yt.openChannel(res.result.sourceUrl);
      } else {
        yt.setResults([]);
        yt.setResolved(res.result);
      }
    } else {
      resolveError.value = res.error || '';
    }
  } catch {
    resolveError.value = '';
  } finally {
    yt.isResolving = false;
  }
}

function clearResolved() {
  yt.setResolved(null);
  resolveError.value = '';
  input.value = '';
}

function toggleSelect(id: string) {
  const next = new Set(yt.selectedResolved);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  yt.selectedResolved = next;
}

function toggleSelectAll() {
  if (!yt.resolved) return;
  const all = yt.resolved.items.map((i) => i.id);
  const allSelected = all.length > 0 && all.every((id) => yt.selectedResolved.has(id));
  yt.selectedResolved = allSelected ? new Set() : new Set(all);
}

function addSelectedToQueue() {
  if (!yt.resolved) return;
  yt.queueFromResolved([...yt.selectedResolved]);
  flashAdded();
}

function queueChannelVideo(v: YouTubeVideo) {
  yt.queueVideo(v);
  flashAdded();
}

function flashAdded() {
  addedFlash.value = true;
  window.setTimeout(() => {
    addedFlash.value = false;
  }, 1500);
}

function openChannelFromVideo(v: YouTubeVideo) {
  if (!v.channelId) return;
  yt.openChannel(`https://www.youtube.com/channel/${v.channelId}`);
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="p-4 border-b border-border-default">
      <div class="flex items-center gap-3 mb-3">
        <Tv2 :size="24" class="text-red-base" />
        <h1 class="text-xl font-bold">{{ $t('youtube.title') }}</h1>
      </div>

      <div class="flex gap-2 mb-2">
        <div class="relative flex-1">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            v-model="input"
            :placeholder="$t('youtube.pasteOrSearch')"
            class="w-full pl-9 pr-3 py-2.5 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none placeholder:text-fg-faint"
            @keydown.enter="submit"
          />
        </div>
        <button
          class="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          :class="
            isResolvable
              ? 'bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover'
              : 'bg-accent-base text-white hover:bg-accent-hover'
          "
          :disabled="yt.isResolving || yt.isSearching"
          @click="submit"
        >
          {{
            yt.isResolving
              ? $t('youtube.resolving')
              : $t(isResolvable ? 'youtube.resolve' : 'youtube.search')
          }}
        </button>
      </div>
      <p v-if="resolveError" class="text-xs text-red-400 mb-2">{{ resolveError }}</p>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <YouTubeChannelView v-if="yt.channelLoading || yt.channel" />

      <template v-else>
        <div v-if="yt.resolved" class="mb-8">
          <div class="flex items-center gap-3 mb-3">
            <span
              class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
              :class="kindBadgeClass"
            >
              {{ $t(kindKey) }}
            </span>
            <h2 class="text-sm font-medium truncate flex-1">{{ yt.resolved.title }}</h2>
            <div
              v-if="yt.resolvedLoading"
              class="flex items-center gap-2 shrink-0"
              :title="$t('youtube.resolving')"
            >
              <div
                class="w-3.5 h-3.5 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
              />
              <span v-if="yt.resolved.meta.totalItems != null" class="text-xs text-fg-faint">
                {{ yt.resolved.items.length }} / {{ yt.resolved.meta.totalItems }}
              </span>
              <span v-else class="text-xs text-fg-faint">
                {{ yt.resolved.items.length }}
              </span>
            </div>
            <span v-if="yt.resolved.meta.totalItems != null" class="text-xs text-fg-faint shrink-0">
              {{ $t('youtube.itemsCount', { count: yt.resolved.meta.totalItems }) }}
            </span>
            <button
              class="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors shrink-0"
              @click="clearResolved"
            >
              <X :size="12" />
              {{ $t('youtube.clear') }}
            </button>
          </div>

          <div v-if="yt.resolved.items.length === 0" class="text-sm text-fg-faint py-8 text-center">
            {{ $t('youtube.itemsCount', { count: 0 }) }}
          </div>

          <div v-else class="space-y-1">
            <div
              v-for="item in yt.resolved.items"
              :key="item.id"
              class="flex gap-3 p-2 rounded-xl hover:bg-bg-hover transition-colors group items-center"
            >
              <button
                v-if="yt.resolved.kind !== 'video'"
                class="shrink-0 flex items-center justify-center w-5 h-5 rounded border transition-colors"
                :class="
                  yt.selectedResolved.has(item.id)
                    ? 'bg-accent-base border-accent-base text-white'
                    : 'border-border-default hover:border-accent-base'
                "
                @click="toggleSelect(item.id)"
              >
                <Check v-if="yt.selectedResolved.has(item.id)" :size="12" />
              </button>
              <div
                class="w-32 aspect-video rounded-lg bg-bg-elevated overflow-hidden shrink-0 relative"
              >
                <img
                  v-if="item.thumbnail"
                  :src="item.thumbnail"
                  :alt="item.title"
                  class="w-full h-full object-cover"
                />
                <div
                  v-if="item.duration"
                  class="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded"
                >
                  {{ item.duration }}
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium line-clamp-1 mb-0.5">{{ item.title }}</h3>
                <button
                  v-if="item.channelId"
                  class="text-xs text-fg-faint hover:text-accent-base transition-colors"
                  @click="yt.openChannel(`https://www.youtube.com/channel/${item.channelId}`)"
                >
                  {{ item.channelTitle }}
                </button>
                <p v-else class="text-xs text-fg-faint">{{ item.channelTitle }}</p>
              </div>
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-base text-white text-xs font-medium hover:bg-accent-hover transition-colors shrink-0"
                @click="
                  toggleSelect(item.id);
                  addSelectedToQueue();
                "
              >
                <Download :size="12" />
                {{ $t('youtube.addToQueue') }}
              </button>
            </div>
          </div>

          <div
            v-if="yt.resolved.kind !== 'video' && yt.resolved.items.length"
            class="flex gap-2 mt-3"
          >
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-default text-xs text-fg-muted hover:bg-bg-hover transition-colors"
              @click="toggleSelectAll"
            >
              <CheckSquare :size="12" />
              {{ $t('youtube.addSelected', { count: selectedCount }) }}
            </button>
          </div>

          <div v-if="addedFlash" class="mt-3 flex items-center gap-1.5 text-xs text-green-base">
            <Check :size="12" />
            {{ $t('youtube.added') }}
          </div>
        </div>

        <div v-if="yt.isSearching" class="flex justify-center py-16">
          <div
            class="w-8 h-8 border-2 border-accent-base border-t-transparent rounded-full animate-spin"
          />
        </div>
        <div
          v-else-if="yt.searchResults.length === 0"
          class="flex flex-col items-center justify-center py-16 text-fg-faint"
        >
          <Tv2 :size="64" class="mb-4 opacity-20" />
          <p class="text-lg font-medium mb-1">{{ $t('youtube.searchHeading') }}</p>
          <p class="text-sm">{{ $t('youtube.discover') }}</p>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="v in yt.pagedResults"
            :key="v.id"
            class="flex gap-3 p-3 rounded-xl hover:bg-bg-hover transition-colors group cursor-pointer"
          >
            <div
              class="w-40 aspect-video rounded-lg bg-bg-elevated overflow-hidden shrink-0 relative"
            >
              <img
                v-if="v.thumbnail"
                :src="v.thumbnail"
                :alt="v.title"
                class="w-full h-full object-cover"
              />
              <div
                class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
              >
                <Play :size="32" class="text-white" fill="white" />
              </div>
              <div
                v-if="v.duration"
                class="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded"
              >
                {{ v.duration }}
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium line-clamp-2 mb-1">{{ v.title }}</h3>
              <div class="text-xs text-fg-faint">
                <button
                  v-if="v.channelId"
                  class="hover:text-accent-base transition-colors"
                  @click.stop="openChannelFromVideo(v)"
                >
                  {{ v.channelTitle }}
                </button>
                <span v-else>{{ v.channelTitle }}</span>
                <span v-if="v.viewCount">
                  · {{ formatNumber(v.viewCount) }} {{ $t('youtube.views') }}</span
                >
              </div>
              <p class="text-xs text-fg-faint mt-1 line-clamp-2">{{ v.description }}</p>
            </div>
            <div
              class="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <button
                class="p-2 rounded-lg bg-accent-base text-white hover:bg-accent-hover transition-colors"
                @click="queueChannelVideo(v)"
              >
                <Download :size="14" />
              </button>
              <button
                class="p-2 rounded-lg bg-bg-elevated border border-border-default text-fg-muted hover:bg-bg-hover transition-colors"
              >
                <ExternalLink :size="14" />
              </button>
            </div>
          </div>

          <div v-if="pageTotal > 1" class="flex items-center justify-center gap-3 pt-2">
            <button
              class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-40"
              :disabled="!yt.hasPrevPage"
              @click="yt.prevSearchPage"
            >
              <ChevronLeft :size="16" />
            </button>
            <span class="text-xs text-fg-faint">
              {{ $t('youtube.pageOf', { current: yt.searchPage + 1, total: pageTotal }) }}
            </span>
            <button
              class="p-1.5 rounded-lg border border-border-default text-fg-muted hover:bg-bg-hover transition-colors disabled:opacity-40"
              :disabled="!yt.hasNextPage"
              @click="yt.nextSearchPage"
            >
              <ChevronRight :size="16" />
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
