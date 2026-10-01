import { ref, computed, watch, onUnmounted } from 'vue';
import type { useLibraryStore } from '@renderer/stores/library';
import {
  buildSearchIndex,
  filterSearchIndex,
  searchableTerms
} from '@renderer/utils/librarySearch';

export function useLibraryFilters(library: ReturnType<typeof useLibraryStore>) {
  const query = ref('');
  const debouncedQuery = ref('');
  let queryTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    query,
    (q) => {
      if (queryTimer) clearTimeout(queryTimer);
      queryTimer = setTimeout(() => {
        debouncedQuery.value = q;
      }, 200);
    },
    { immediate: true }
  );

  // Normalizuj metadane przeszukiwalne tylko przy zmianie kolekcji biblioteki,
  // zamiast przebudowywać ciągi lowercase przy każdym wciśnięciu klawisza.
  const audioIndex = computed(() =>
    buildSearchIndex(library.audioTracks, (track) => searchableTerms(track))
  );
  const videoIndex = computed(() =>
    buildSearchIndex(library.videoTracks, (track) => searchableTerms(track))
  );
  const imageIndex = computed(() =>
    buildSearchIndex(library.imageTracks, (track) => searchableTerms(track))
  );
  const allPlayableIndex = computed(() =>
    buildSearchIndex(
      library.tracks.filter((track) => track.type !== 'image'),
      (track) => searchableTerms(track)
    )
  );
  const normalizedQuery = computed(() => debouncedQuery.value.trim());

  const filteredTracks = computed(() => {
    return normalizedQuery.value
      ? filterSearchIndex(audioIndex.value, normalizedQuery.value)
      : library.audioTracks;
  });

  const filteredVideo = computed(() => {
    return normalizedQuery.value
      ? filterSearchIndex(videoIndex.value, normalizedQuery.value)
      : library.videoTracks;
  });

  const filteredImages = computed(() => {
    return normalizedQuery.value
      ? filterSearchIndex(imageIndex.value, normalizedQuery.value)
      : library.imageTracks;
  });

  const filteredArtists = computed(() => {
    const q = normalizedQuery.value.toLowerCase();
    if (!q) return library.artists;
    return library.artists.filter(([name]) => !q || name.toLowerCase().includes(q));
  });

  const filteredAlbums = computed(() => {
    const q = normalizedQuery.value.toLowerCase();
    if (!q) return library.albums;
    return library.albums.filter(([name]) => !q || name.toLowerCase().includes(q));
  });

  const filteredAll = computed(() => {
    if (!normalizedQuery.value) return [];
    return filterSearchIndex(allPlayableIndex.value, normalizedQuery.value);
  });

  // Okładki są ładowane leniwie przez IntersectionObserver w MediaCover — tylko wiersze
  // faktycznie renderowane (widoczne + overscan) wyzwalają loadCover. Bez
  // wczesnego preloadu tutaj, inaczej do N żądań IPC o okładki odpaliłoby się dla wierszy,
  // do których użytkownik nigdy nie przewinie.

  onUnmounted(() => {
    if (queryTimer) clearTimeout(queryTimer);
  });

  return {
    query,
    debouncedQuery,
    filteredTracks,
    filteredAll,
    filteredVideo,
    filteredImages,
    filteredArtists,
    filteredAlbums
  };
}
