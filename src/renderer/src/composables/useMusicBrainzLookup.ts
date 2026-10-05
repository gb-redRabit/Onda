import { ref, computed, onScopeDispose } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MusicbrainzRelease } from '@shared/types/ipc';
import { buildMusicbrainzQuery, splitInitialQuery } from '@renderer/utils/musicbrainz';
import { coverBytesToDataUrl, getMusicbrainzCover } from '@renderer/utils/musicbrainzCover';
import { logger } from '@shared/logger';

export type LookupResult = MusicbrainzRelease & {
  _coverData?: number[];
  _coverMime?: string;
};

export interface LookupApplyData {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  track?: { no: number };
  coverData?: number[];
  coverMime?: string;
}

// Stan wyszukiwania / lookupu wydania / payloadu zastosowania wyodrębniony z
// `components/library/MusicBrainzLookup.vue` (plan 2.8).
export function useMusicBrainzLookup(options: { onApply: (data: LookupApplyData) => void }) {
  const { t } = useI18n();

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

  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });
  // Tokeny: wolniejsza/późniejsza odpowiedź nie może nadpisać nowszego zapytania.
  let searchSeq = 0;
  let lookupSeq = 0;

  function setStatus(s: string) {
    status.value = s;
  }

  async function search() {
    const q = query.value.trim();
    if (!q) return;
    const seq = ++searchSeq;
    loading.value = true;
    error.value = '';
    releases.value = [];
    selectedId.value = null;
    lookupResult.value = null;
    setStatus(t('musicbrainz.searching'));
    try {
      let r = await window.api?.musicbrainzSearchRelease(q);
      if (seq !== searchSeq) return;
      // retry bez cudzysłowów jeśli timeout (zbyt złożone cudzysłowy)
      if (!r?.success && String(r?.error).includes('Timeout') && q.includes('"')) {
        setStatus(t('musicbrainz.retrySimpler'));
        const simple = q.replace(/"/g, '');
        r = await window.api?.musicbrainzSearchRelease(simple);
        if (seq !== searchSeq) return;
      }
      if (r?.success && r.releases?.length) {
        releases.value = r.releases;
        setStatus(t('musicbrainz.found', { n: r.releases.length }));
        // pobierz mini okładki dla wyników (lazy, z throttlingiem main 1 req/s)
        for (const rel of r.releases.slice(0, 6)) {
          getMusicbrainzCover(rel.id).then((cr) => {
            if (seq !== searchSeq || disposed) return;
            if (cr?.success && cr.data) {
              try {
                coverThumbs.value = {
                  ...coverThumbs.value,
                  [rel.id]: coverBytesToDataUrl(cr.data, cr.mime)
                };
              } catch (e) {
                logger.warn('musicbrainz', `cover thumbnail conversion failed for ${rel.id}`, e);
              }
            }
          });
        }
      } else {
        error.value = r?.error || t('musicbrainz.noResults');
        setStatus('');
      }
    } finally {
      if (seq === searchSeq) loading.value = false;
    }
  }

  async function selectRelease(release: MusicbrainzRelease) {
    const seq = ++lookupSeq;
    selectedId.value = release.id;
    lookingUp.value = release.id;
    error.value = '';
    lookupResult.value = null;
    setStatus(t('musicbrainz.loadingDetails'));
    try {
      const r = await window.api?.musicbrainzLookupRelease(release.id);
      if (seq !== lookupSeq) return;
      if (r?.success && r.release) {
        const result: LookupResult = { ...r.release };
        setStatus(t('musicbrainz.loadingCover'));
        const coverR = await getMusicbrainzCover(release.id);
        if (seq !== lookupSeq) return;
        if (coverR?.success && coverR.data) {
          result._coverData = coverR.data;
          result._coverMime = coverR.mime;
        } else if (coverR?.rateLimited) {
          setStatus(t('musicbrainz.serverBusy'));
        }
        lookupResult.value = result;
        setStatus('');
      } else {
        error.value = r?.error || t('musicbrainz.fetchError');
        setStatus('');
      }
    } finally {
      if (seq === lookupSeq) lookingUp.value = null;
    }
  }

  function applyTags() {
    const rel = lookupResult.value;
    if (!rel) return;
    const f = includeFields.value;
    const emitData: LookupApplyData & Record<string, unknown> = {};
    if (f.album) emitData.album = rel.title;
    if (f.year) emitData.year = rel.date ? parseInt(rel.date.slice(0, 4)) : undefined;
    if (f.artist)
      emitData.artist = rel['artist-credit']?.[0]?.name || rel['artist-credit']?.[0]?.artist?.name;
    if (f.title && rel.media?.[0]?.tracks?.[0]?.title)
      emitData.title = rel.media[0].tracks[0].title;
    if (f.genre && rel.genres?.[0]?.name) emitData.genre = rel.genres[0].name;
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
      else if (emitData[k] !== undefined) res[k] = true;
      else res[k] = false;
    }
    applyResult.value = res;
    options.onApply(emitData);
    setTimeout(() => {
      applyResult.value = null;
    }, 3000);
  }

  return {
    queryArtist,
    queryTitle,
    queryAlbum,
    queryYear,
    query,
    parseInitial,
    releases,
    loading,
    selectedId,
    lookingUp,
    error,
    lookupResult,
    status,
    coverThumbs,
    includeFields,
    applyResult,
    search,
    selectRelease,
    applyTags
  };
}
