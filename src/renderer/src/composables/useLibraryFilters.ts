import { ref, computed, watch, onUnmounted } from 'vue';
import type { useLibraryStore } from '@renderer/stores/library';

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

  const filteredTracks = computed(() => {
    const q = debouncedQuery.value.toLowerCase();
    return library.audioTracks.filter(
      (tr) =>
        !q ||
        tr.name.toLowerCase().includes(q) ||
        tr.metadata?.title?.toLowerCase().includes(q) ||
        tr.metadata?.artist?.toLowerCase().includes(q) ||
        tr.metadata?.album?.toLowerCase().includes(q)
    );
  });

  const filteredVideo = computed(() => {
    const q = debouncedQuery.value.toLowerCase();
    return library.videoTracks.filter(
      (tr) =>
        !q ||
        tr.name.toLowerCase().includes(q) ||
        tr.metadata?.title?.toLowerCase().includes(q)
    );
  });

  const filteredImages = computed(() => {
    const q = debouncedQuery.value.toLowerCase();
    return library.imageTracks.filter((tr) => !q || tr.name.toLowerCase().includes(q));
  });

  const filteredArtists = computed(() => {
    const q = debouncedQuery.value.toLowerCase();
    return library.artists.filter(([name]) => !q || name.toLowerCase().includes(q));
  });

  const filteredAlbums = computed(() => {
    const q = debouncedQuery.value.toLowerCase();
    return library.albums.filter(([name]) => !q || name.toLowerCase().includes(q));
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
    filteredVideo,
    filteredImages,
    filteredArtists,
    filteredAlbums
  };
}
