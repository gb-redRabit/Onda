<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Disc3, Music2, Album, Hash, Calendar, Check, Loader2, X } from '@lucide/vue';
import type { MusicbrainzRelease } from '@shared/types/ipc';

const { t } = useI18n();

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

const props = withDefaults(defineProps<{ initialQuery?: string }>(), { initialQuery: '' });
const query = ref(props.initialQuery);
const releases = ref<MusicbrainzRelease[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const lookingUp = ref<string | null>(null);
const error = ref('');
const lookupResult = ref<LookupResult | null>(null);
const status = ref('');
const coverThumbs = ref<Record<string, string>>({});

// 8.9 — stepper status
function setStatus(s: string) {
  status.value = s;
}

async function search() {
  if (!query.value.trim()) return;
  loading.value = true;
  error.value = '';
  releases.value = [];
  selectedId.value = null;
  lookupResult.value = null;
  setStatus('Wyszukiwanie…');
  const r = await window.api?.musicbrainzSearchRelease(query.value.trim());
  if (r?.success && r.releases?.length) {
    releases.value = r.releases;
    setStatus(`Znaleziono ${r.releases.length}`);
    // pobierz mini okładki dla wyników (lazy, z throttlingiem main 1 req/s)
    for (const rel of r.releases.slice(0, 6)) {
      (window.api as unknown as { musicbrainzGetCoverData: (id: string) => Promise<{ success: boolean; data?: number[]; mime?: string }> })?.musicbrainzGetCoverData(rel.id).then((cr) => {
        if (cr?.success && cr.data) {
          try {
            const bytes = new Uint8Array(cr.data);
            let binary = '';
            const chunk = 8192;
            for (let i = 0; i < bytes.length; i += chunk) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
            }
            const b64 = btoa(binary);
            coverThumbs.value = { ...coverThumbs.value, [rel.id]: `data:${cr.mime || 'image/jpeg'};base64,${b64}` };
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
    const coverR = await (window.api as unknown as { musicbrainzGetCoverData: (id: string) => Promise<{ success: boolean; data?: number[]; mime?: string; error?: string; rateLimited?: boolean }> })?.musicbrainzGetCoverData(release.id);
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

  const emitData: {
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genre?: string;
    track?: { no: number };
    coverData?: number[];
    coverMime?: string;
  } = {
    album: rel.title,
    year: rel.date ? parseInt(rel.date.slice(0, 4)) : undefined,
    artist: rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name
  };
  if (rel._coverData) {
    emitData.coverData = rel._coverData;
    emitData.coverMime = rel._coverMime;
  }
  emit('apply', emitData);
}

function displayTrackNumber(track: { number?: string; position?: string }, index: number): number {
  return Number(track.number) || Number(track.position) || index + 1;
}

watch(
  () => props.initialQuery,
  (v) => {
    if (v) {
      query.value = v;
      search();
    }
  }
);
onMounted(() => {
  if (props.initialQuery) search();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-60 flex items-center justify-center bg-neutral/40"
      @click.self="emit('close')"
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

        <div class="p-4 border-b border-base-300 shrink-0">
          <div class="flex gap-2">
            <input
              v-model="query"
              :placeholder="$t('musicbrainz.searchPlaceholder')"
              class="flex-1 px-3 py-2 fx-depth rounded-field bg-base-100 border border-base-300 text-sm focus:border-primary focus:outline-none"
              @keydown.enter="search"
            />
            <button
              class="fx-noise px-4 py-2 fx-depth rounded-field bg-primary text-primary-content text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
              :disabled="loading || !query.trim()"
              @click="search"
            >
              <Search :size="14" /> {{ $t('musicbrainz.search') }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-if="status" class="text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-field text-center">{{ status }}</div>
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
                  <img v-if="coverThumbs[rel.id]" :src="coverThumbs[rel.id]" class="w-full h-full object-cover" />
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
                    v-for="(track, ti) in lookupResult.media[0].tracks.slice(0, 30)"
                    :key="track.id"
                    class="flex items-center gap-2 text-xs text-base-content/70"
                  >
                    <span class="w-5 text-right shrink-0 text-base-content/50">{{
                      displayTrackNumber(track, ti as number)
                    }}</span>
                    <span class="truncate">{{ track.title }}</span>
                  </div>
                  <div
                    v-if="lookupResult.media[0].tracks.length > 30"
                    class="text-xs text-base-content/50 text-center pt-1"
                  >
                    + {{ lookupResult.media[0].tracks.length - 30 }} {{ $t('musicbrainz.more') }}
                  </div>
                </div>

                <div class="flex gap-2">
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
