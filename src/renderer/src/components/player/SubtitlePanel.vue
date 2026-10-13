<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Upload, Minus, Plus, Search, X, Languages } from '@lucide/vue';
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

const formattedDelay = computed(() => formatSubtitleDelay(subtitleDelayMs.value));

function nudgeDelay(delta: number): void {
  adjustSubtitleDelay(delta);
}

const embeddedTracks = computed(() =>
  player.subtitleTracks.filter((track) => track.source === 'embedded')
);
const externalTracks = computed(() =>
  player.subtitleTracks.filter((track) => track.source === 'external')
);
const customTracks = computed(() =>
  player.subtitleTracks.filter((track) => track.source === 'custom')
);

function selectTrack(id: string | null): void {
  player.setActiveSubtitle(id);
}

async function uploadSubtitles(): Promise<void> {
  const result = await window.api?.openSubtitleDialog();
  if (!result || result.canceled || !result.filePaths.length) return;
  const added = await player.loadCustomSubtitles(result.filePaths);
  if (added === 0) logger.error('Subtitles', 'no subtitle files could be read');
}

// ── Wyszukiwanie online (OpenSubtitles) ──────────────────────────────────────
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

function defaultQuery(): string {
  const name = player.currentTrack?.name ?? '';
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .trim();
}

async function runSearch(): Promise<void> {
  if (!searchQuery.value.trim() && !searching.value) searchQuery.value = defaultQuery();
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

// ── NapiProjekt (polskie napisy dopasowane po zawartości pliku) ──────────────
const napiLoading = ref(false);

async function downloadNapi(): Promise<void> {
  const videoPath = player.currentTrack?.path;
  if (!videoPath || napiLoading.value) return;
  napiLoading.value = true;
  try {
    const res = await window.api.napiProjektDownload({ videoPath });
    if (res.success && res.path) {
      const added = await player.loadCustomSubtitles([res.path]);
      if (added > 0) {
        ui.notify('success', t('subtitles.napiDownloaded'));
        return;
      }
    }
    if (res.error === 'not-found') ui.notify('info', t('subtitles.napiNotFound'));
    else ui.notify('error', t('subtitles.napiError'), res.error);
  } catch (e) {
    ui.notify('error', t('subtitles.napiError'), String(e));
  } finally {
    napiLoading.value = false;
  }
}
</script>

<template>
  <div
    data-testid="subtitle-panel"
    class="h-full flex flex-col bg-base-100/(--glass-alpha) border-l border-base-300"
  >
    <div class="flex items-center justify-between px-4 py-3 border-b border-base-300">
      <h3 class="text-sm font-semibold">{{ $t('subtitles.title') }}</h3>
      <button
        class="fx-noise p-1.5 fx-depth rounded-field text-base-content/50 hover:bg-base-content/10 hover:text-base-content transition-colors"
        :aria-label="$t('common.close')"
        :title="$t('common.close')"
        @click="player.toggleSubtitlePanel"
      >
        <X :size="14" />
      </button>
    </div>

    <div class="flex-1 overflow-auto">
      <div class="py-1.5">
        <button
          v-if="player.subtitleTracks.length > 0"
          class="w-full px-4 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
          :class="{ 'text-primary': !player.activeSubtitleId }"
          @click="selectTrack(null)"
        >
          <Check v-if="!player.activeSubtitleId" :size="14" class="shrink-0" />
          <span v-else class="w-3.5 shrink-0" />
          {{ $t('subtitles.disable') }}
        </button>

        <template v-if="embeddedTracks.length">
          <div class="px-4 pt-3 pb-1 text-[10px] text-base-content/60 uppercase tracking-wider">
            {{ $t('subtitles.embedded') }}
          </div>
          <button
            v-for="track in embeddedTracks"
            :key="track.id"
            class="w-full px-4 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            :class="{ 'text-primary': player.activeSubtitleId === track.id }"
            @click="selectTrack(track.id)"
          >
            <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
            <span v-else class="w-3.5 shrink-0" />
            <span class="truncate">{{ track.label }}</span>
          </button>
        </template>

        <template v-if="externalTracks.length">
          <div class="px-4 pt-3 pb-1 text-[10px] text-base-content/60 uppercase tracking-wider">
            {{ $t('subtitles.fromFolder') }}
          </div>
          <button
            v-for="track in externalTracks"
            :key="track.id"
            class="w-full px-4 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            :class="{ 'text-primary': player.activeSubtitleId === track.id }"
            @click="selectTrack(track.id)"
          >
            <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
            <span v-else class="w-3.5 shrink-0" />
            <span class="truncate">{{ track.label }}</span>
          </button>
        </template>

        <template v-if="customTracks.length">
          <div class="px-4 pt-3 pb-1 text-[10px] text-base-content/60 uppercase tracking-wider">
            {{ $t('subtitles.custom') }}
          </div>
          <button
            v-for="track in customTracks"
            :key="track.id"
            class="w-full px-4 py-2 text-left text-sm hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
            :class="{ 'text-primary': player.activeSubtitleId === track.id }"
            @click="selectTrack(track.id)"
          >
            <Check v-if="player.activeSubtitleId === track.id" :size="14" class="shrink-0" />
            <span v-else class="w-3.5 shrink-0" />
            <span class="truncate">{{ track.label }}</span>
          </button>
        </template>

        <button
          class="mt-1 w-full px-4 py-2 text-left text-sm text-primary hover:bg-primary/10 transition-colors flex items-center gap-2"
          @click="uploadSubtitles"
        >
          <Upload :size="14" class="shrink-0" />
          {{ $t('subtitles.upload') }}
        </button>
      </div>

      <div class="border-t border-base-300 px-4 py-3">
        <div class="text-[10px] text-base-content/50 font-medium uppercase tracking-wider mb-2">
          {{ $t('subtitles.delay') }}
        </div>
        <div class="flex items-center gap-2">
          <button
            class="p-1.5 rounded-field border border-base-300 text-base-content/70 hover:bg-base-content/10 transition-colors"
            :aria-label="$t('subtitles.delayEarlier')"
            :title="$t('subtitles.delayEarlier')"
            @click="nudgeDelay(-SUBTITLE_DELAY_STEP_MS)"
          >
            <Minus :size="14" />
          </button>
          <button
            class="min-w-20 px-2 py-1.5 rounded-field border border-base-300 font-mono text-xs text-center text-base-content/80 hover:bg-base-content/10 transition-colors"
            :aria-label="$t('subtitles.delayReset')"
            :title="$t('subtitles.delayReset')"
            @click="resetSubtitleDelay()"
          >
            {{ formattedDelay }}
          </button>
          <button
            class="p-1.5 rounded-field border border-base-300 text-base-content/70 hover:bg-base-content/10 transition-colors"
            :aria-label="$t('subtitles.delayLater')"
            :title="$t('subtitles.delayLater')"
            @click="nudgeDelay(SUBTITLE_DELAY_STEP_MS)"
          >
            <Plus :size="14" />
          </button>
        </div>
      </div>

      <div class="border-t border-base-300 px-4 py-3">
        <div class="text-[10px] text-base-content/50 font-medium uppercase tracking-wider mb-2">
          {{ $t('subtitles.onlineTitle') }}
        </div>
        <input
          v-model="searchQuery"
          :placeholder="$t('subtitles.onlineQuery')"
          class="w-full px-3 py-2 rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm focus:border-primary focus:outline-none"
          @keydown.enter="runSearch"
        />
        <div class="flex gap-2 mt-2">
          <select
            v-model="searchLang"
            :aria-label="$t('subtitles.onlineLanguage')"
            class="w-20 px-2 py-1.5 rounded-field bg-base-200/(--glass-alpha) border border-base-300 text-sm"
          >
            <option value="pl">PL</option>
            <option value="en">EN</option>
          </select>
          <button
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-field bg-primary text-primary-content text-sm fx-depth fx-noise disabled:opacity-50"
            :disabled="searching"
            @click="runSearch"
          >
            <Search :size="14" />
            {{ $t('subtitles.onlineSearch') }}
          </button>
        </div>
        <p v-if="searchErrorText" class="mt-2 text-[11px] text-error">{{ searchErrorText }}</p>
        <p v-else-if="searching" class="mt-2 text-[11px] text-base-content/50">
          {{ $t('subtitles.onlineSearching') }}
        </p>
        <p
          v-else-if="searched && results.length === 0"
          class="mt-2 text-[11px] text-base-content/50"
        >
          {{ $t('subtitles.onlineNoResults') }}
        </p>
        <div v-else-if="results.length" class="mt-2 flex max-h-64 flex-col overflow-y-auto">
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
          class="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-field border border-base-300 text-sm hover:bg-base-content/10 transition-colors disabled:opacity-50"
          :disabled="napiLoading"
          @click="downloadNapi"
        >
          <Languages :size="14" />
          {{ $t('subtitles.napiDownload') }}
        </button>
      </div>
    </div>
  </div>
</template>
