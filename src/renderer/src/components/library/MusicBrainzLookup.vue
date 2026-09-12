<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Disc3, Music2, Album, Hash, Calendar, Check, Loader2, X } from '@lucide/vue';
import type { MusicbrainzRelease } from '@shared/types/ipc';
import { useUIStore } from '@renderer/stores/ui';

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
const query = computed(() => buildQuery());
function buildQuery(): string {
  const parts: string[] = [];
  const a = queryArtist.value.trim();
  const t = queryTitle.value.trim();
  const al = queryAlbum.value.trim();
  const y = queryYear.value.trim();
  if (a) parts.push(`artist:"${a.replace(/"/g, '\\"')}"`);
  if (al) parts.push(`release:"${al.replace(/"/g, '\\"')}"`);
  if (t) parts.push(`"${t.replace(/"/g, '\\"')}"`);
  if (y) parts.push(`date:${y}`);
  if (parts.length === 0) return '';
  return parts.join(' AND ');
}
// parsuj initialQuery jeśli przyszedł jako prosty string "Skillet Awake" → rozdziel na pola
function parseInitial(q: string) {
  if (!q) return;
  // jeśli zawiera " AND " lub field: — zostaw jako album
  if (q.includes(':') || q.includes(' AND ')) {
    queryAlbum.value = q;
    return;
  }
  // spróbuj rozbić "Artist - Title" lub "Artist Title"
  const byDash = q.split(' - ');
  if (byDash.length >= 2) {
    queryArtist.value = byDash[0].trim();
    queryTitle.value = byDash.slice(1).join(' - ').trim();
  } else {
    queryAlbum.value = q.trim();
  }
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
      (
        window.api as unknown as {
          musicbrainzGetCoverData: (
            id: string
          ) => Promise<{ success: boolean; data?: number[]; mime?: string }>;
        }
      )
        ?.musicbrainzGetCoverData(rel.id)
        .then((cr) => {
          if (cr?.success && cr.data) {
            try {
              const bytes = new Uint8Array(cr.data);
              let binary = '';
              const chunk = 8192;
              for (let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
              }
              const b64 = btoa(binary);
              coverThumbs.value = {
                ...coverThumbs.value,
                [rel.id]: `data:${cr.mime || 'image/jpeg'};base64,${b64}`
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
    const coverR = await (
      window.api as unknown as {
        musicbrainzGetCoverData: (id: string) => Promise<{
          success: boolean;
          data?: number[];
          mime?: string;
          error?: string;
          rateLimited?: boolean;
        }>;
      }
    )?.musicbrainzGetCoverData(release.id);
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

function displayTrackNumber(track: { number?: string; position?: string }, index: number): number {
  return Number(track.number) || Number(track.position) || index + 1;
}

const previewRows = computed(() => {
  const rel = lookupResult.value;
  const tr = props.track;
  if (!rel) return [];
  const old = {
    title: tr?.metadata?.title || tr?.name || '',
    artist: tr?.metadata?.artist || '',
    album: tr?.metadata?.album || '',
    year: tr?.metadata?.year?.toString() || '',
    genre: tr?.metadata?.genre || '',
    track: tr?.metadata?.track?.no?.toString() || '',
    cover: tr ? '—' : ''
  };
  const now: Record<string, string> = {
    title: rel.media?.[0]?.tracks?.[0]?.title || '',
    artist: rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name || '',
    album: rel.title || '',
    year: rel.date ? rel.date.slice(0, 4) : '',
    genre: (rel as unknown as { genres?: { name: string }[] }).genres?.[0]?.name || '',
    track: '1',
    cover: rel._coverData ? 'okładka' : '—'
  };
  const labels: Record<string, string> = {
    title: 'Tytuł',
    artist: 'Artysta',
    album: 'Album',
    year: 'Rok',
    genre: 'Gatunek',
    track: 'Nr',
    cover: 'Okładka'
  };
  return (Object.keys(labels) as Array<keyof typeof labels>).map((k) => ({
    key: k,
    label: labels[k],
    old: (old as unknown as Record<string, string>)[k] || '—',
    now: (now as unknown as Record<string, string>)[k] || '—',
    checked: (includeFields.value as unknown as Record<string, boolean>)[k]
  }));
});

// 8.9.3 — batch
const batchProgress = ref(0);
const batchResults = ref<
  Array<{ path: string; name: string; status: 'pending' | 'ok' | 'error'; msg?: string }>
>([]);
const batchRunning = ref(false);
const batchCancelled = ref(false);

function startBatch() {
  const rel = lookupResult.value;
  const list = props.batchTracks;
  if (!rel || !list || list.length === 0) return;
  batchRunning.value = true;
  batchCancelled.value = false;
  batchProgress.value = 0;
  batchResults.value = list.map((t) => ({
    path: t.path,
    name: t.name,
    status: 'pending' as const
  }));
  let idx = 0;
  const next = async () => {
    if (batchCancelled.value || idx >= list.length) {
      batchRunning.value = false;
      return;
    }
    const tr = list[idx];
    const mbTrack = rel.media?.[0]?.tracks?.[idx] || rel.media?.[0]?.tracks?.[0];
    try {
      const payload: Record<string, unknown> = {};
      if (includeFields.value.album) payload.album = rel.title;
      if (includeFields.value.artist)
        payload.artist = rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name;
      if (includeFields.value.year && rel.date) payload.year = rel.date.slice(0, 4);
      if (includeFields.value.title && mbTrack?.title) payload.title = mbTrack.title;
      if (includeFields.value.track) payload.track = String(idx + 1);
      // write tags
      const tagRes = await window.api?.invoke(
        'media:writeTags',
        tr.path,
        payload as Record<string, string>
      );
      if ((tagRes as { success?: boolean })?.success === false)
        throw new Error((tagRes as { error?: string })?.error || 'writeTags failed');
      if (includeFields.value.cover && rel._coverData) {
        await window.api?.invoke('media:writeCover', tr.path, rel._coverData);
      }
      batchResults.value[idx] = { ...batchResults.value[idx], status: 'ok' };
    } catch (e) {
      batchResults.value[idx] = {
        ...batchResults.value[idx],
        status: 'error',
        msg: String(e).slice(0, 80)
      };
    }
    batchProgress.value = idx + 1;
    idx++;
    setTimeout(next, 1100); // 1 req/s throttle
  };
  next();
}
function cancelBatch() {
  batchCancelled.value = true;
  batchRunning.value = false;
}

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

        <div class="p-4 border-b border-base-300 shrink-0 space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-[11px] text-base-content/60">Wykonawca / Artysta</span>
              <input
                v-model="queryArtist"
                placeholder="np. Skillet"
                class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
                @keydown.enter="search"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[11px] text-base-content/60">Tytuł</span>
              <input
                v-model="queryTitle"
                placeholder="np. Monster"
                class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
                @keydown.enter="search"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[11px] text-base-content/60">Album / Wydanie</span>
              <input
                v-model="queryAlbum"
                placeholder="np. Awake"
                class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
                @keydown.enter="search"
              />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-[11px] text-base-content/60">Rok</span>
              <input
                v-model="queryYear"
                placeholder="np. 2009"
                class="px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
                @keydown.enter="search"
              />
            </label>
          </div>
          <div class="flex gap-2">
            <div class="flex-1 text-[11px] text-base-content/40 self-center truncate">
              Puste pola pomijane • np. Artysta + Album
            </div>
            <button
              class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              :disabled="loading || !query.trim()"
              @click="search"
            >
              <Search :size="14" /> {{ $t('musicbrainz.search') }}
            </button>
          </div>
        </div>

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
              <button
                class="w-full flex items-start gap-3 p-3 hover:bg-base-content/10 transition-colors text-left"
                :class="{ 'bg-primary/10': selectedId === rel.id }"
                @click="selectRelease(rel)"
              >
                <div
                  class="w-10 h-10 rounded-field bg-base-100 flex items-center justify-center shrink-0 overflow-hidden"
                >
                  <img
                    v-if="coverThumbs[rel.id]"
                    :src="coverThumbs[rel.id]"
                    class="w-full h-full object-cover"
                  />
                  <Music2 v-else :size="18" class="text-base-content/40" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">{{ rel.title }}</div>
                  <div class="text-xs text-base-content/70 truncate">
                    {{
                      rel['artist-credit']?.[0]?.name ||
                      rel['artist-credit']?.[0]?.artist?.name ||
                      '?'
                    }}
                  </div>
                  <div class="flex gap-3 mt-1 text-[11px] text-base-content/50">
                    <span class="flex items-center gap-1"
                      ><Calendar :size="10" />{{ rel.date || '?' }}</span
                    >
                    <span class="flex items-center gap-1"
                      ><Hash :size="10" />{{ rel['track-count'] || '?' }}</span
                    >
                    <span class="flex items-center gap-1"
                      ><Album :size="10" />{{ rel.country || '?' }}</span
                    >
                  </div>
                </div>
                <Check
                  v-if="selectedId === rel.id && !lookingUp"
                  :size="16"
                  class="text-primary shrink-0 mt-1"
                />
                <Loader2
                  v-else-if="lookingUp === rel.id"
                  :size="14"
                  class="animate-spin text-base-content/70 shrink-0 mt-1"
                />
              </button>

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

                <div
                  v-if="lookupResult.media?.[0]?.tracks"
                  class="space-y-1 max-h-32 overflow-y-auto"
                >
                  <div
                    v-for="(mediumTrack, ti) in lookupResult.media[0].tracks.slice(0, 30)"
                    :key="mediumTrack.id"
                    class="flex items-center gap-2 text-xs text-base-content/70"
                  >
                    <span class="w-5 text-right shrink-0 text-base-content/50">{{
                      displayTrackNumber(mediumTrack, ti as number)
                    }}</span>
                    <span class="truncate">{{ mediumTrack.title }}</span>
                  </div>
                  <div
                    v-if="lookupResult.media[0].tracks.length > 30"
                    class="text-xs text-base-content/50 text-center pt-1"
                  >
                    + {{ lookupResult.media[0].tracks.length - 30 }} {{ $t('musicbrainz.more') }}
                  </div>
                </div>

                <div
                  v-if="props.track"
                  class="border border-base-300 rounded-field overflow-hidden"
                >
                  <div class="bg-base-300/50 px-2 py-1 text-[11px] font-medium">Podgląd zmian</div>
                  <div
                    v-for="row in previewRows"
                    :key="row.key"
                    class="flex items-center gap-2 px-2 py-1.5 text-xs border-t border-base-300/30"
                  >
                    <input
                      type="checkbox"
                      :checked="includeFields[row.key as keyof typeof includeFields]"
                      class="checkbox checkbox-xs"
                      @change="
                        (includeFields as unknown as Record<string, boolean>)[row.key] = (
                          $event.target as HTMLInputElement
                        ).checked
                      "
                    />
                    <span class="w-14 shrink-0">{{ row.label }}</span>
                    <span class="flex-1 truncate text-base-content/50 line-through">{{
                      row.old
                    }}</span>
                    <span class="text-primary">→</span>
                    <span class="flex-1 truncate font-medium">{{ row.now }}</span>
                    <span
                      v-if="applyResult"
                      class="text-[11px] shrink-0"
                      :class="
                        applyResult[row.key] === true
                          ? 'text-success'
                          : applyResult[row.key] === false
                            ? 'text-error'
                            : 'text-base-content/40'
                      "
                      >{{
                        applyResult[row.key] === true
                          ? '✓'
                          : applyResult[row.key] === false
                            ? '✗'
                            : String(applyResult[row.key] || '')
                      }}</span
                    >
                  </div>
                </div>

                <div
                  v-if="props.batchTracks && props.batchTracks.length"
                  class="border border-base-300 rounded-field p-2 space-y-2"
                >
                  <div class="text-xs font-medium">
                    Batch: {{ props.batchTracks.length }} utworów — {{ batchProgress }}/{{
                      props.batchTracks.length
                    }}
                  </div>
                  <div class="w-full bg-base-300 rounded-full h-2 overflow-hidden">
                    <div
                      class="bg-primary h-2 transition-all"
                      :style="{
                        width:
                          (props.batchTracks.length
                            ? (batchProgress / props.batchTracks.length) * 100
                            : 0) + '%'
                      }"
                    ></div>
                  </div>
                  <div class="max-h-32 overflow-y-auto space-y-1">
                    <div
                      v-for="r in batchResults"
                      :key="r.path"
                      class="flex items-center gap-2 text-xs"
                    >
                      <span
                        :class="
                          r.status === 'ok'
                            ? 'text-success'
                            : r.status === 'error'
                              ? 'text-error'
                              : 'text-base-content/40'
                        "
                        >{{ r.status === 'ok' ? '✓' : r.status === 'error' ? '✗' : '…' }}</span
                      >
                      <span class="truncate flex-1">{{ r.name }}</span>
                      <span class="text-base-content/50 truncate text-[11px]">{{
                        r.msg || ''
                      }}</span>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button
                      v-if="!batchRunning"
                      class="fx-noise flex-1 px-3 py-2 fx-depth rounded-field text-sm font-medium bg-primary text-primary-content hover:bg-primary/90 transition-colors"
                      @click="startBatch"
                    >
                      Zastosuj dla wszystkich ({{ props.batchTracks.length }})
                    </button>
                    <button
                      v-else
                      class="fx-noise flex-1 px-3 py-2 fx-depth rounded-field text-sm font-medium bg-error text-error-content hover:bg-error/90 transition-colors"
                      @click="cancelBatch"
                    >
                      Anuluj ({{ batchProgress }}/{{ props.batchTracks.length }})
                    </button>
                  </div>
                </div>

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
