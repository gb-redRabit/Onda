import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { useLibraryStore } from '@renderer/stores/library';
import type { usePlayerStore } from '@renderer/stores/player';

export function useLibraryFilters(
  library: ReturnType<typeof useLibraryStore>,
  player: ReturnType<typeof usePlayerStore>
) {
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

  let trackCoverDebounce: ReturnType<typeof setTimeout> | null = null;
  let videoCoverDebounce: ReturnType<typeof setTimeout> | null = null;

  function debouncedPreloadCovers(
    coverList: string[],
    debounce: { current: ReturnType<typeof setTimeout> | null },
    set: (v: ReturnType<typeof setTimeout> | null) => void
  ): void {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      set(null);
      for (const path of coverList) player.loadCover(path);
    }, 300);
  }

  function preloadTrackCovers(tracks: { path: string }[]): void {
    debouncedPreloadCovers(
      tracks.slice(0, 200).map((tr) => tr.path),
      { current: trackCoverDebounce },
      (v) => (trackCoverDebounce = v)
    );
  }

  function preloadVideoCovers(tracks: { path: string }[]): void {
    debouncedPreloadCovers(
      tracks.slice(0, 100).map((tr) => tr.path),
      { current: videoCoverDebounce },
      (v) => (videoCoverDebounce = v)
    );
  }

  onMounted(() => {
    requestAnimationFrame(() => {
      preloadTrackCovers(filteredTracks.value);
      preloadVideoCovers(filteredVideo.value);
    });
  });

  watch(filteredVideo, (tracks) => {
    preloadVideoCovers(tracks);
  });

  watch(filteredTracks, (tracks) => {
    preloadTrackCovers(tracks);
  });

  onUnmounted(() => {
    if (queryTimer) clearTimeout(queryTimer);
    if (trackCoverDebounce) clearTimeout(trackCoverDebounce);
    if (videoCoverDebounce) clearTimeout(videoCoverDebounce);
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
