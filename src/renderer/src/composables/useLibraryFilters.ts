import { ref, computed, watch, onUnmounted } from 'vue';
import type { useLibraryStore } from '@renderer/stores/library';
import { buildSearchIndex, filterSearchIndex } from '@renderer/utils/librarySearch';

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

  // Normalize searchable metadata only when the library collection changes,
  // rather than rebuilding lowercase strings on every keystroke.
  const audioIndex = computed(() =>
    buildSearchIndex(library.audioTracks, (track) => searchableTerms(track))
  );
  const videoIndex = computed(() =>
    buildSearchIndex(library.videoTracks, (track) => searchableTerms(track))
  );
  const imageIndex = computed(() => buildSearchIndex(library.imageTracks, (track) => [track.name]));
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

  // Covers are loaded lazily by MediaCover's IntersectionObserver — only rows
  // that are actually rendered (visible + overscan) trigger loadCover. No
  // eager preload here, otherwise up to N IPC cover requests fire for rows the
  // user never scrolls to.

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

function searchableTerms(track: {
  name: string;
  path: string;
  metadata?: { title?: string; artist?: string; album?: string };
}): Array<string | undefined> {
  return [
    track.name,
    track.path,
    track.metadata?.title,
    track.metadata?.artist,
    track.metadata?.album
  ];
}
