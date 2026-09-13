<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Disc3, Check, Loader2, X } from '@lucide/vue';
import type { MusicbrainzRelease } from '@shared/types/ipc';
import {
  buildMusicbrainzQuery,
  buildPreviewRows,
  splitInitialQuery
} from '@renderer/utils/musicbrainz';
import { coverBytesToDataUrl, getMusicbrainzCover } from '@renderer/utils/musicbrainzCover';
import MusicBrainzBatchPanel from './MusicBrainzBatchPanel.vue';
import MusicBrainzSearchForm from './MusicBrainzSearchForm.vue';
import MusicBrainzReleaseCard from './MusicBrainzReleaseCard.vue';
import MusicBrainzTrackList from './MusicBrainzTrackList.vue';
import MusicBrainzPreviewTable from './MusicBrainzPreviewTable.vue';
import { useUIStore } from '@renderer/stores/ui';
import { useMusicBrainzBatch } from '@renderer/composables/useMusicBrainzBatch';

const { t } = useI18n();
const ui = useUIStore();

type LookupResult = MusicbrainzRelease & {
  _coverData?: number[];
  _coverMime?: string;
};

const emit = defineEmits<{
  apply: [
    data: {
      title?: string;
      artist?: string;
      album?: string;
      year?: number;
      genre?: string;
      track?: { no: number };
      coverData?: number[];
      coverMime?: string;
    }
  ];
  close: [];
}>();

const props = withDefaults(
  defineProps<{
    initialQuery?: string;
    track?: import('@renderer/types/media').MediaFile | null;
    batchTracks?: import('@renderer/types/media').MediaFile[];
  }>(),
  { initialQuery: '', track: null, batchTracks: undefined }
);
const queryArtist = ref('');
const queryTitle = ref('');
const queryAlbum = ref('');
const queryYear = ref('');
// zachowaj stare query dla kompatybilności, budowane z pól
const query = computed(() =>
  buildMusicbrainzQuery({
    artist: queryArtist.value,
    title: queryTitle.value,
    album: queryAlbum.value,
    year: queryYear.value
  })
);
// parsuj initialQuery jeśli przyszedł jako prosty string "Skillet Awake" → rozdziel na pola
function parseInitial(q: string) {
  const p = splitInitialQuery(q);
  if (p.artist !== undefined) queryArtist.value = p.artist;
  if (p.title !== undefined) queryTitle.value = p.title;
  if (p.album !== undefined) queryAlbum.value = p.album;
}
const releases = ref<MusicbrainzRelease[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const lookingUp = ref<string | null>(null);
const error = ref('');
const lookupResult = ref<LookupResult | null>(null);
const status = ref('');
const coverThumbs = ref<Record<string, string>>({});
// 8.9.2 — preview checkboxes + wynik per pole
const includeFields = ref({
  title: true,
  artist: true,
  album: true,
  year: true,
  genre: false,
  track: true,
  cover: true
});
const applyResult = ref<Record<string, boolean | string> | null>(null);
const overlayClicks = ref(0);
let overlayTimer: ReturnType<typeof setTimeout> | null = null;
function onOverlayClick() {
  overlayClicks.value++;
  if (queryArtist.value || queryTitle.value || queryAlbum.value || releases.value.length > 0) {
    ui.notify('info', t('common.clickAgainToClose'));
    if (overlayClicks.value >= 2) emit('close');
  } else {
    if (overlayClicks.value >= 2) emit('close');
    else ui.notify('info', t('common.clickAgainToClose'));
  }
  if (overlayTimer) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => (overlayClicks.value = 0), 2000);
}

// 8.9 — stepper status
function setStatus(s: string) {
  status.value = s;
}

async function search() {
  const q = query.value.trim();
  if (!q) return;
  loading.value = true;
  error.value = '';
  releases.value = [];
  selectedId.value = null;
  lookupResult.value = null;
  setStatus('Wyszukiwanie…');
  let r = await window.api?.musicbrainzSearchRelease(q);
  // retry bez cudzysłowów jeśli timeout (zbyt złożone cudzysłowy)
  if (!r?.success && String(r?.error).includes('Timeout') && q.includes('"')) {
    setStatus('Timeout — ponawiam prościej…');
    const simple = q.replace(/"/g, '');
    r = await window.api?.musicbrainzSearchRelease(simple);
  }
  if (r?.success && r.releases?.length) {
    releases.value = r.releases;
    setStatus(`Znaleziono ${r.releases.length}`);
    // pobierz mini okładki dla wyników (lazy, z throttlingiem main 1 req/s)
    for (const rel of r.releases.slice(0, 6)) {
      getMusicbrainzCover(rel.id).then((cr) => {
        if (cr?.success && cr.data) {
          try {
            coverThumbs.value = {
              ...coverThumbs.value,
              [rel.id]: coverBytesToDataUrl(cr.data, cr.mime)
            };
          } catch {}
        }
      });
    }
  } else {
    error.value = r?.error || t('musicbrainz.noResults');
    setStatus('');
  }
  loading.value = false;
}

async function selectRelease(release: MusicbrainzRelease) {
  selectedId.value = release.id;
  lookingUp.value = release.id;
  error.value = '';
  lookupResult.value = null;
  setStatus('Pobieranie szczegółów…');
  const r = await window.api?.musicbrainzLookupRelease(release.id);
  if (r?.success && r.release) {
    const result: LookupResult = { ...r.release };
    setStatus('Pobieranie okładki…');
    const coverR = await getMusicbrainzCover(release.id);
    if (coverR?.success && coverR.data) {
      result._coverData = coverR.data;
      result._coverMime = coverR.mime;
    } else if ((coverR as unknown as { rateLimited?: boolean })?.rateLimited) {
      setStatus('Serwer obciążony, ponawiam…');
    }
    lookupResult.value = result;
    setStatus('');
  } else {
    error.value = r?.error || t('musicbrainz.fetchError');
    setStatus('');
  }
  lookingUp.value = null;
}

function applyTags() {
  const rel = lookupResult.value;
  if (!rel) return;
  const f = includeFields.value;
  const emitData: {
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genre?: string;
    track?: { no: number };
    coverData?: number[];
    coverMime?: string;
  } = {};
  if (f.album) emitData.album = rel.title;
  if (f.year) emitData.year = rel.date ? parseInt(rel.date.slice(0, 4)) : undefined;
  if (f.artist)
    emitData.artist = rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name;
  if (f.title && rel.media?.[0]?.tracks?.[0]?.title) emitData.title = rel.media[0].tracks[0].title;
  if (f.genre && (rel as unknown as { genres?: { name: string }[] })?.genres?.[0]?.name)
    emitData.genre = (rel as unknown as { genres: { name: string }[] }).genres[0].name;
  if (f.track) emitData.track = { no: 1 };
  if (f.cover && rel._coverData) {
    emitData.coverData = rel._coverData;
    emitData.coverMime = rel._coverMime;
  }
  // 8.9.2 — wynik per pole
  const res: Record<string, boolean | string> = {};
  for (const k of Object.keys(f) as Array<keyof typeof f>) {
    if (!f[k]) res[k] = 'pominięte';
    else if (k === 'cover' && !rel._coverData) res[k] = 'brak okładki';
    else if ((emitData as unknown as Record<string, unknown>)[k] !== undefined) res[k] = true;
    else res[k] = false;
  }
  applyResult.value = res;
  emit('apply', emitData);
  setTimeout(() => {
    applyResult.value = null;
  }, 3000);
}

const previewRows = computed(() =>
  buildPreviewRows(lookupResult.value, props.track, includeFields.value)
);

// 8.9.3 — batch
const { batchProgress, batchResults, batchRunning, startBatch, cancelBatch } = useMusicBrainzBatch(
  () => lookupResult.value,
  () => includeFields.value,
  () => props.batchTracks
);

watch(
  () => props.initialQuery,
  (v) => {
    if (v) {
      parseInitial(v);
      // prefill z tracka jeśli dostępny
      if (props.track) {
        queryArtist.value = props.track.metadata?.artist || queryArtist.value;
        queryAlbum.value = props.track.metadata?.album || queryAlbum.value;
        queryTitle.value = props.track.metadata?.title || queryTitle.value;
        if (props.track.metadata?.year) queryYear.value = String(props.track.metadata.year);
      }
      search();
    }
  }
);
onMounted(() => {
  if (props.track) {
    queryArtist.value = props.track.metadata?.artist || '';
    queryAlbum.value = props.track.metadata?.album || '';
    queryTitle.value = props.track.metadata?.title || '';
    if (props.track.metadata?.year) queryYear.value = String(props.track.metadata.year);
    // jeśli mamy dane z tracka, nie nadpisuj pustym initialQuery
    if (queryArtist.value || queryAlbum.value || queryTitle.value) {
      // zbuduj query z pól i wyszukaj
      if (query.value) search();
      return;
    }
  }
  if (props.initialQuery) {
    parseInitial(props.initialQuery);
    search();
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-60 flex items-center justify-center bg-neutral/40"
      @click.self="onOverlayClick"
    >
      <div
        class="w-full max-w-xl mx-4 rounded-box bg-neutral border border-base-300 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col backdrop-blur-xl"
      >
        <div class="flex items-center justify-between px-5 py-4 border-b border-base-300 shrink-0">
          <h2 class="text-base font-bold flex items-center gap-2">
            <Disc3 :size="18" /> {{ $t('musicbrainz.title') }}
          </h2>
          <button
            class="fx-noise p-1.5 fx-depth rounded-field hover:bg-base-content/10 transition-colors text-base-content/50"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <MusicBrainzSearchForm
          v-model:artist="queryArtist"
          v-model:title="queryTitle"
          v-model:album="queryAlbum"
          v-model:year="queryYear"
          :loading="loading"
          @search="search"
        />

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div
            v-if="status"
            class="text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-field text-center"
          >
            {{ status }}
          </div>
          <div
            v-if="loading"
            class="flex items-center justify-center py-8 text-base-content/70 gap-2"
          >
            <Loader2 :size="18" class="animate-spin" /> {{ $t('musicbrainz.searching') }}
          </div>

          <div v-else-if="error" class="text-sm text-error bg-error/10 px-3 py-2 rounded-field">
            {{ error }}
          </div>

          <div v-else-if="!releases.length" class="text-sm text-base-content/70 text-center py-8">
            {{ $t('musicbrainz.emptyHint') }}
          </div>

          <template v-for="rel in releases" :key="rel.id">
            <div class="rounded-box border border-base-300 overflow-hidden">
              <MusicBrainzReleaseCard
                :rel="rel"
                :selected="selectedId === rel.id"
                :looking-up="lookingUp === rel.id"
                :thumb="coverThumbs[rel.id]"
                @select="selectRelease(rel)"
              />

              <div
                v-if="lookupResult && selectedId === rel.id"
                class="border-t border-base-300 p-3 space-y-3"
              >
                <div class="text-xs text-base-content/70">
                  <span class="font-medium text-base-content">{{
                    $t('musicbrainz.selected')
                  }}</span>
                  {{ lookupResult.title }}
                  <span v-if="lookupResult.date">({{ lookupResult.date.slice(0, 4) }})</span>
                  — {{ lookupResult['artist-credit']?.[0]?.name || '?' }}
                </div>

                <MusicBrainzTrackList :tracks="lookupResult.media?.[0]?.tracks ?? []" />

                <MusicBrainzPreviewTable
                  v-if="props.track"
                  v-model:include-fields="includeFields"
                  :rows="previewRows"
                  :apply-result="applyResult"
                />

                <MusicBrainzBatchPanel
                  v-if="props.batchTracks && props.batchTracks.length"
                  :total="props.batchTracks.length"
                  :progress="batchProgress"
                  :results="batchResults"
                  :running="batchRunning"
                  @start="startBatch"
                  @cancel="cancelBatch"
                />

                <div v-else class="flex gap-2">
                  <button
                    class="fx-noise flex-1 px-3 py-2 fx-depth rounded-field text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
                    @click="applyTags"
                  >
                    <Check :size="14" class="inline mr-1" />{{ $t('musicbrainz.apply') }}
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
