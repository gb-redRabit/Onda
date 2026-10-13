<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Upload, Minus, Plus, Search, X } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '@renderer/stores/player';
import { useUIStore } from '@renderer/stores/ui';
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
/** Ujednolicony wiersz wyników: OpenSubtitles (tytuł), NapiProjekt (hash), AnimeSub (tytuł). */
interface PanelResult {
  source: 'os' | 'napi' | 'an';
  fileId?: number;
  animeId?: string;
  animeSh?: string;
  language: string;
  release: string;
  downloads: number;
}

const downloading = ref<string | null>(null);
const results = ref<PanelResult[]>([]);
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

function resultKey(result: PanelResult): string {
  if (result.source === 'napi') return 'napi';
  if (result.source === 'an') return `an-${result.animeId}`;
  return `os-${result.fileId}`;
}

/** Krótka plakietka dostawcy: OS / NP / AN. */
function sourceBadge(source: PanelResult['source']): string {
  if (source === 'napi') return 'NP';
  if (source === 'an') return 'AN';
  return 'OS';
}

function sourceTitle(source: PanelResult['source']): string {
  if (source === 'napi') return 'NapiProjekt';
  if (source === 'an') return 'AnimeSub.info';
  return 'OpenSubtitles';
}

function appendResults(items: PanelResult[]): void {
  results.value = [...results.value, ...items];
}

/** Licznik „pokoleń" wyszukiwania — wyniki starego zapytania nie dopisują się do nowego. */
let searchSeq = 0;

/**
 * Odpytuje wszystkich dostawców równolegle i dopisuje wyniki, gdy tylko wrócą — lista rośnie
 * na żywo (najszybszy serwis nie czeka na najwolniejszy).
 */
async function runSearch(): Promise<void> {
  if (!searchQuery.value.trim()) searchQuery.value = defaultQuery();
  const query = searchQuery.value.trim();
  if (!query) return;
  const videoPath = player.currentTrack?.path;
  const seq = ++searchSeq;
  searching.value = true;
  searchError.value = '';
  results.value = [];
  searched.value = false;

  let osError = '';
  const pending: Array<Promise<void>> = [];

  pending.push(
    (videoPath
      ? window.api.napiProjektCheck({ videoPath }).catch(() => null)
      : Promise.resolve(null)
    ).then((napi) => {
      if (seq !== searchSeq || !napi?.found) return;
      appendResults([
        { source: 'napi', language: 'pl', release: t('subtitles.napiDownload'), downloads: 0 }
      ]);
    })
  );

  pending.push(
    window.api
      .animeSubSearch({ query })
      .catch(() => null)
      .then((anime) => {
        if (seq !== searchSeq || !anime?.success) return;
        appendResults(
          anime.results.map((r) => ({
            source: 'an' as const,
            animeId: r.id,
            animeSh: r.sh,
            language: r.language || 'pl',
            release: r.title,
            downloads: 0
          }))
        );
      })
  );

  pending.push(
    window.api
      .openSubtitlesSearch({ query, languages: searchLang.value || undefined })
      .catch(() => null)
      .then((os) => {
        if (seq !== searchSeq || !os) return;
        if (!os.success) {
          osError = os.error || 'unknown';
          return;
        }
        appendResults(
          os.results.map((r) => ({
            source: 'os' as const,
            fileId: r.fileId,
            language: r.language,
            release: r.release,
            downloads: r.downloads
          }))
        );
      })
  );

  await Promise.allSettled(pending);
  if (seq !== searchSeq) return;
  if (!results.value.length && osError) searchError.value = osError;
  searching.value = false;
  searched.value = true;
}

async function downloadResult(result: PanelResult): Promise<void> {
  downloading.value = resultKey(result);
  const videoPath = player.currentTrack?.path ?? '';
  try {
    const res =
      result.source === 'napi'
        ? await window.api.napiProjektDownload({ videoPath })
        : result.source === 'an'
          ? await window.api.animeSubDownload({
              id: result.animeId ?? '',
              sh: result.animeSh ?? '',
              videoPath
            })
          : await window.api.openSubtitlesDownload({
              fileId: result.fileId ?? 0,
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
    if (res.error === 'not-found') ui.notify('info', t('subtitles.napiNotFound'));
    else if (res.error === 'no-session') ui.notify('error', t('subtitles.animeNoSession'));
    else if (result.source === 'an') {
      ui.notify('error', t('subtitles.animeDownloadError'), res.error);
    } else ui.notify('error', t('subtitles.onlineError'), res.error);
  } catch (e) {
    ui.notify('error', t('subtitles.onlineError'), String(e));
  } finally {
    downloading.value = null;
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
        data-testid="subtitle-panel-close"
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
            data-testid="subtitle-delay-down"
            :aria-label="$t('subtitles.delayEarlier')"
            :title="$t('subtitles.delayEarlier')"
            @click="nudgeDelay(-SUBTITLE_DELAY_STEP_MS)"
          >
            <Minus :size="14" />
          </button>
          <button
            class="min-w-20 px-2 py-1.5 rounded-field border border-base-300 font-mono text-xs text-center text-base-content/80 hover:bg-base-content/10 transition-colors"
            data-testid="subtitle-delay-value"
            :aria-label="$t('subtitles.delayReset')"
            :title="$t('subtitles.delayReset')"
            @click="resetSubtitleDelay()"
          >
            {{ formattedDelay }}
          </button>
          <button
            class="p-1.5 rounded-field border border-base-300 text-base-content/70 hover:bg-base-content/10 transition-colors"
            data-testid="subtitle-delay-up"
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
            data-testid="subtitle-online-search"
            :disabled="!searchQuery.trim()"
            @click="runSearch"
          >
            <Search :size="14" />
            {{ $t('subtitles.onlineSearch') }}
          </button>
        </div>
        <p v-if="searchErrorText" class="mt-2 text-[11px] text-error">{{ searchErrorText }}</p>
        <div v-if="results.length" class="mt-2 flex max-h-64 flex-col overflow-y-auto">
          <button
            v-for="result in results"
            :key="resultKey(result)"
            class="flex items-center gap-2 rounded-field px-2 py-1.5 text-left text-xs hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
            :disabled="downloading !== null"
            @click="downloadResult(result)"
          >
            <span
              class="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
              :class="
                result.source === 'os'
                  ? 'bg-base-content/10 text-base-content/60'
                  : 'bg-primary/15 text-primary'
              "
              :title="sourceTitle(result.source)"
            >
              {{ sourceBadge(result.source) }}
            </span>
            <span class="min-w-0 flex-1 truncate">{{ result.release }}</span>
            <span class="shrink-0 text-[10px] text-base-content/50">
              {{ result.language.toUpperCase()
              }}<template v-if="result.source === 'os'"> · {{ result.downloads }}</template>
            </span>
          </button>
        </div>
        <p v-if="!results.length && searching" class="mt-2 text-[11px] text-base-content/50">
          {{ $t('subtitles.onlineSearching') }}
        </p>
        <p v-else-if="!results.length && searched" class="mt-2 text-[11px] text-base-content/50">
          {{ $t('subtitles.onlineNoResults') }}
        </p>
      </div>
    </div>
  </div>
</template>
