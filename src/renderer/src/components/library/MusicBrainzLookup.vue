<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Disc3, Music2, Album, Hash, Calendar, Check, Loader2, X } from '@lucide/vue';

const { t } = useI18n();

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

const query = ref('');
const releases = ref<any[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const lookingUp = ref<string | null>(null);
const error = ref('');
const lookupResult = ref<any>(null);

async function search() {
  if (!query.value.trim()) return;
  loading.value = true;
  error.value = '';
  releases.value = [];
  selectedId.value = null;
  lookupResult.value = null;
  const r = await window.api?.musicbrainzSearchRelease(query.value.trim());
  if (r?.success && r.releases?.length) {
    releases.value = r.releases;
  } else {
    error.value = r?.error || t('musicbrainz.noResults');
  }
  loading.value = false;
}

async function selectRelease(release: any) {
  selectedId.value = release.id;
  lookingUp.value = release.id;
  error.value = '';
  lookupResult.value = null;
  const r = await window.api?.musicbrainzLookupRelease(release.id);
  if (r?.success && r.release) {
    lookupResult.value = r.release;
    const coverR = await window.api?.musicbrainzGetCoverData(release.id);
    if (coverR?.success && coverR.data) {
      lookupResult.value._coverData = coverR.data;
      lookupResult.value._coverMime = coverR.mime;
    }
  } else {
    error.value = r?.error || t('musicbrainz.fetchError');
  }
  lookingUp.value = null;
}

function applyTags() {
  if (!lookupResult.value) return;
  const rel = lookupResult.value;

  const emitData: any = {
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

function displayTrackNumber(track: any, index: number): number {
  return Number(track.number) || Number(track.position) || index + 1;
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/40"
      @click.self="emit('close')"
    >
      <div
        class="w-full max-w-xl mx-4 rounded-2xl bg-bg-base border border-border-default shadow-xl overflow-hidden max-h-[80vh] flex flex-col"
      >
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-border-default shrink-0"
        >
          <h2 class="text-base font-bold flex items-center gap-2">
            <Disc3 :size="18" /> {{ $t('musicbrainz.title') }}
          </h2>
          <button
            class="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-fg-faint"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="p-4 border-b border-border-default shrink-0">
          <div class="flex gap-2">
            <input
              v-model="query"
              :placeholder="$t('musicbrainz.searchPlaceholder')"
              class="flex-1 px-3 py-2 rounded-xl bg-bg-elevated border border-border-default text-sm focus:border-accent-base focus:outline-none"
              @keydown.enter="search"
            />
            <button
              class="px-4 py-2 rounded-xl bg-accent-base text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5"
              :disabled="loading || !query.trim()"
              @click="search"
            >
              <Search :size="14" /> {{ $t('musicbrainz.search') }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <div v-if="loading" class="flex items-center justify-center py-8 text-fg-muted gap-2">
            <Loader2 :size="18" class="animate-spin" /> {{ $t('musicbrainz.searching') }}
          </div>

          <div v-else-if="error" class="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
            {{ error }}
          </div>

          <div v-else-if="!releases.length" class="text-sm text-fg-muted text-center py-8">
            {{ $t('musicbrainz.emptyHint') }}
          </div>

          <template v-for="rel in releases" :key="rel.id">
            <div class="rounded-xl border border-border-default overflow-hidden">
              <button
                class="w-full flex items-start gap-3 p-3 hover:bg-bg-hover transition-colors text-left"
                :class="{ 'bg-accent-ghost': selectedId === rel.id }"
                @click="selectRelease(rel)"
              >
                <div
                  class="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center shrink-0 overflow-hidden"
                >
                  <Music2 :size="18" class="text-fg-faint/40" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">{{ rel.title }}</div>
                  <div class="text-xs text-fg-muted truncate">
                    {{
                      rel['artist-credit']?.[0]?.name ||
                      rel['artist-credit']?.[0]?.artist?.name ||
                      '?'
                    }}
                  </div>
                  <div class="flex gap-3 mt-1 text-[11px] text-fg-faint">
                    <span class="flex items-center gap-1"
                      ><Calendar :size="10" />{{ rel.date || '?' }}</span
                    >
                    <span class="flex items-center gap-1"
                      ><Hash :size="10" />{{ rel.trackCount || rel['track-count'] || '?' }}</span
                    >
                    <span class="flex items-center gap-1"
                      ><Album :size="10" />{{ rel.country || '?' }}</span
                    >
                  </div>
                </div>
                <Check
                  v-if="selectedId === rel.id && !lookingUp"
                  :size="16"
                  class="text-accent-base shrink-0 mt-1"
                />
                <Loader2
                  v-else-if="lookingUp === rel.id"
                  :size="14"
                  class="animate-spin text-fg-muted shrink-0 mt-1"
                />
              </button>

              <div
                v-if="lookupResult && selectedId === rel.id"
                class="border-t border-border-default p-3 space-y-3"
              >
                <div class="text-xs text-fg-muted">
                  <span class="font-medium text-fg-base">{{ $t('musicbrainz.selected') }}</span>
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
                    class="flex items-center gap-2 text-xs text-fg-muted"
                  >
                    <span class="w-5 text-right shrink-0 text-fg-faint">{{
                      displayTrackNumber(track, ti as number)
                    }}</span>
                    <span class="truncate">{{ track.title }}</span>
                  </div>
                  <div
                    v-if="lookupResult.media[0].tracks.length > 30"
                    class="text-xs text-fg-faint text-center pt-1"
                  >
                    + {{ lookupResult.media[0].tracks.length - 30 }} {{ $t('musicbrainz.more') }}
                  </div>
                </div>

                <div class="flex gap-2">
                  <button
                    class="flex-1 px-3 py-2 rounded-xl text-sm font-medium bg-accent-base text-white hover:bg-accent-hover transition-colors"
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
