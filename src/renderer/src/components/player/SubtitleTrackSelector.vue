<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Subtitles, Check, Upload, Minus, Plus, Search } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
import type { OpenSubtitlesResult } from '@shared/types/opensubtitles';
import {
  subtitleDelayMs,
  formatSubtitleDelay,
  adjustSubtitleDelay,
  resetSubtitleDelay,
  SUBTITLE_DELAY_STEP_MS
} from '@renderer/composables/subtitleDelay';
import { logger } from '@shared/logger';

const player = usePlayerStore();
const ui = useUIStore();
const { t } = useI18n();
const isOpen = ref(false);
const container = ref<HTMLElement | null>(null);

const formattedDelay = computed(() => formatSubtitleDelay(subtitleDelayMs.value));

function nudgeDelay(delta: number): void {
  adjustSubtitleDelay(delta);
}

// ── Wyszukiwanie online (OpenSubtitles) ──────────────────────────────────────
const mode = ref<'tracks' | 'search'>('tracks');
const searchQuery = ref('');
const searchLang = ref('pl');
const searching = ref(false);
const downloading = ref<number | null>(null);
const results = ref<OpenSubtitlesResult[]>([]);
const searchError = ref('');
const searched = ref(false);

const searchErrorText = computed(() => {
  switch (searchError.value) {
    case '':
      return '';
    case 'missing-api-key':
      return t('subtitles.onlineNoKey');
    case 'rate-limit':
      return t('subtitles.onlineRateLimit');
    case 'missing-query':
      return t('subtitles.onlineQueryRequired');
    default:
      return searchError.value;
  }
});

/** Tytuł z nazwy pliku wideo jako domyślne zapytanie. */
function defaultQuery(): string {
  const name = player.currentTrack?.name ?? '';
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .trim();
}

function openSearch(): void {
  mode.value = 'search';
  results.value = [];
  searchError.value = '';
  searched.value = false;
  if (!searchQuery.value) searchQuery.value = defaultQuery();
}

async function runSearch(): Promise<void> {
  if (!searchQuery.value.trim() || searching.value) return;
  searching.value = true;
  searchError.value = '';
  results.value = [];
  searched.value = false;
  try {
    const res = await window.api.openSubtitlesSearch({
      query: searchQuery.value.trim(),
      languages: searchLang.value || undefined
    });
    if (res.success) results.value = res.results;
    else searchError.value = res.error || 'unknown';
  } catch (e) {
    searchError.value = String(e);
  } finally {
    searching.value = false;
    searched.value = true;
  }
}

async function downloadResult(result: OpenSubtitlesResult): Promise<void> {
  downloading.value = result.fileId;
  try {
    const res = await window.api.openSubtitlesDownload({
      fileId: result.fileId,
      videoPath: player.currentTrack?.path,
      language: result.language || searchLang.value
    });
    if (res.success && res.path) {
      const added = await player.loadCustomSubtitles([res.path]);
      if (added > 0) {
        isOpen.value = false;
        mode.value = 'tracks';
        ui.notify('success', t('subtitles.onlineDownloaded'));
        return;
      }
    }
    ui.notify('error', t('subtitles.onlineError'), res.error);
  } catch (e) {
    ui.notify('error', t('subtitles.onlineError'), String(e));
  } finally {
    downloading.value = null;
  }
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (isOpen.value && container.value && !container.value.contains(target)) {
    isOpen.value = false;
  }
}

onMounted(() => document.addEventListener('click', onClickOutside));
onUnmounted(() => document.removeEventListener('click', onClickOutside));

function selectTrack(id: string | null) {
  player.setActiveSubtitle(id);
  isOpen.value = false;
}

async function uploadSubtitles() {
  const result = await window.api?.openSubtitleDialog();
  if (!result || result.canceled || !result.filePaths.length) return;
  const added = await player.loadCustomSubtitles(result.filePaths);
  if (added > 0) {
    isOpen.value = false;
  } else {
    logger.error('Subtitles', 'no subtitle files could be read');
  }
}
</script>

<template>
  <div ref="container" class="relative inline-flex items-center">
    <button
      class="text-neutral-content/50 hover:text-neutral-content transition-colors"
      :class="{ 'text-primary!': player.activeSubtitleId }"
      :aria-label="$t('player.subtitles')"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <Subtitles :size="16" />
    </button>

    <Transition name="menu-fade">
      <div
        v-if="isOpen"
        class="absolute bottom-full right-0 mb-2 bg-base-100 border border-base-300 rounded-box shadow-2xl shadow-black/50 py-1.5 z-50"
        :class="mode === 'search' ? 'w-72' : 'w-60'"
      >
        <template v-if="mode === 'tracks'">
          <div
            class="px-3 py-1.5 text-[10px] text-base-content/50 font-medium uppercase tracking-wider"
          >
            {{ $t('subtitles.title') }}
          </div>

          <button
            v-if="player.subtitleTracks.length > 0"
            class="w-full px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            :class="{ 'text-primary': !player.activeSubtitleId }"
            @click="selectTrack(null)"
          >
            <Check v-if="!player.activeSubtitleId" :size="14" class="shrink-0" />
            <span v-else class="w-3.5 shrink-0" />
            {{ $t('subtitles.disable') }}
          </button>

          <div
            v-if="player.subtitleTracks.some((t) => t.source === 'embedded')"
            class="border-t border-base-300 my-1 mx-2"
          />
          <div
            v-if="player.subtitleTracks.some((t) => t.source === 'embedded')"
            class="px-3 py-1 text-[10px] text-base-content/60"
          >
            {{ $t('subtitles.embedded') }}
          </div>
          <button
            v-for="track in player.subtitleTracks.filter((t) => t.source === 'embedded')"
            :key="track.id"
            class="w-full px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            :class="{ 'text-primary': player.activeSubtitleId === track.id }"
            @click="selectTrack(track.id)"
          >
            <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
            <span v-else class="w-3.5 shrink-0" />
            <span class="truncate">{{ track.label }}</span>
          </button>

          <div
            v-if="player.subtitleTracks.some((t) => t.source === 'external')"
            class="border-t border-base-300 my-1 mx-2"
          />
          <div
            v-if="player.subtitleTracks.some((t) => t.source === 'external')"
            class="px-3 py-1 text-[10px] text-base-content/60"
          >
            {{ $t('subtitles.fromFolder') }}
          </div>
          <button
            v-for="track in player.subtitleTracks.filter((t) => t.source === 'external')"
            :key="track.id"
            class="w-full px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            :class="{ 'text-primary': player.activeSubtitleId === track.id }"
            @click="selectTrack(track.id)"
          >
            <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
            <span v-else class="w-3.5 shrink-0" />
            <span class="truncate">{{ track.label }}</span>
          </button>

          <div
            v-if="player.subtitleTracks.some((t) => t.source === 'custom')"
            class="border-t border-base-300 my-1 mx-2"
          />
          <div
            v-if="player.subtitleTracks.some((t) => t.source === 'custom')"
            class="px-3 py-1 text-[10px] text-base-content/60"
          >
            {{ $t('subtitles.custom') }}
          </div>
          <button
            v-for="track in player.subtitleTracks.filter((t) => t.source === 'custom')"
            :key="track.id"
            class="w-full px-3 py-1.5 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            :class="{ 'text-primary': player.activeSubtitleId === track.id }"
            @click="selectTrack(track.id)"
          >
            <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
            <span v-else class="w-3.5 shrink-0" />
            <span class="truncate">{{ track.label }}</span>
          </button>

          <div class="border-t border-base-300 my-1 mx-2" />
          <div class="flex items-center justify-between gap-2 px-3 py-1.5">
            <span class="text-[10px] text-base-content/50 font-medium uppercase tracking-wider">
              {{ $t('subtitles.delay') }}
            </span>
            <div class="flex items-center gap-1">
              <button
                class="p-1 rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
                :aria-label="$t('subtitles.delayEarlier')"
                :title="$t('subtitles.delayEarlier')"
                @click="nudgeDelay(-SUBTITLE_DELAY_STEP_MS)"
              >
                <Minus :size="14" />
              </button>
              <button
                class="min-w-14 px-1 py-0.5 rounded-field font-mono text-xs text-center text-base-content/80 hover:bg-base-content/10 transition-colors"
                :aria-label="$t('subtitles.delayReset')"
                :title="$t('subtitles.delayReset')"
                @click="resetSubtitleDelay()"
              >
                {{ formattedDelay }}
              </button>
              <button
                class="p-1 rounded-field text-base-content/70 hover:bg-base-content/10 transition-colors"
                :aria-label="$t('subtitles.delayLater')"
                :title="$t('subtitles.delayLater')"
                @click="nudgeDelay(SUBTITLE_DELAY_STEP_MS)"
              >
                <Plus :size="14" />
              </button>
            </div>
          </div>

          <div class="border-t border-base-300 my-1 mx-2" />
          <button
            class="w-full px-3 py-1.5 text-left text-sm text-primary hover:bg-primary/10 transition-colors flex items-center gap-2"
            @click="uploadSubtitles"
          >
            <Upload :size="14" class="shrink-0" />
            {{ $t('subtitles.upload') }}
          </button>
          <button
            class="w-full px-3 py-1.5 text-left text-sm text-primary hover:bg-primary/10 transition-colors flex items-center gap-2"
            @click="openSearch"
          >
            <Search :size="14" class="shrink-0" />
            {{ $t('subtitles.onlineSearch') }}
          </button>
        </template>

        <div v-else class="flex flex-col gap-2 p-2">
          <input
            v-model="searchQuery"
            :placeholder="$t('subtitles.onlineQuery')"
            class="w-full px-2 py-1.5 rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none"
            @keydown.enter="runSearch"
          />
          <div class="flex gap-2">
            <select
              v-model="searchLang"
              :aria-label="$t('subtitles.onlineLanguage')"
              class="w-20 px-2 py-1.5 rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm"
            >
              <option value="pl">PL</option>
              <option value="en">EN</option>
            </select>
            <button
              class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-field bg-primary text-primary-content text-sm fx-depth fx-noise disabled:opacity-50"
              :disabled="searching || !searchQuery.trim()"
              @click="runSearch"
            >
              <Search :size="14" />
              {{ $t('subtitles.onlineSearch') }}
            </button>
          </div>
          <p v-if="searchErrorText" class="px-1 text-[11px] text-error">{{ searchErrorText }}</p>
          <p v-else-if="searching" class="px-1 text-[11px] text-base-content/50">
            {{ $t('subtitles.onlineSearching') }}
          </p>
          <p
            v-else-if="searched && results.length === 0"
            class="px-1 text-[11px] text-base-content/50"
          >
            {{ $t('subtitles.onlineNoResults') }}
          </p>
          <div v-else class="flex max-h-56 flex-col overflow-y-auto">
            <button
              v-for="result in results"
              :key="result.fileId"
              class="flex items-center justify-between gap-2 rounded-field px-2 py-1.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
              :disabled="downloading !== null"
              @click="downloadResult(result)"
            >
              <span class="truncate">{{ result.release }}</span>
              <span class="shrink-0 text-[10px] text-base-content/50">
                {{ result.language.toUpperCase() }} · {{ result.downloads }}
              </span>
            </button>
          </div>
          <button
            class="px-2 py-1.5 rounded-field border border-base-300 text-sm hover:bg-base-content/10 transition-colors"
            @click="mode = 'tracks'"
          >
            {{ $t('common.back') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
