import { computed } from 'vue';
import type { Ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { topN } from '@renderer/utils/topN';

export function useLibraryDerivations(tracks: Ref<MediaFile[]>) {
  let lastTracksCount = -1;
  let cachedArtists: Array<[string, MediaFile[]]> = [];
  let cachedAlbums: Array<[string, MediaFile[]]> = [];

  function invalidateDerivedCache() {
    lastTracksCount = -1;
    cachedArtists = [];
    cachedAlbums = [];
  }

  const trackStats = computed(() => {
    let audio = 0,
      video = 0,
      image = 0;
    const audioArr: MediaFile[] = [];
    const videoArr: MediaFile[] = [];
    const imageArr: MediaFile[] = [];
    const ts = tracks.value;
    for (let i = 0; i < ts.length; i++) {
      if (ts[i].type === 'audio') {
        audio++;
        audioArr.push(ts[i]);
      } else if (ts[i].type === 'video') {
        video++;
        videoArr.push(ts[i]);
      } else if (ts[i].type === 'image') {
        image++;
        imageArr.push(ts[i]);
      }
    }
    return { audio, video, image, audioArr, videoArr, imageArr };
  });

  const audioCount = computed(() => trackStats.value.audio);
  const videoCount = computed(() => trackStats.value.video);
  const imageCount = computed(() => trackStats.value.image);
  const audioTracks = computed(() => trackStats.value.audioArr);
  const videoTracks = computed(() => trackStats.value.videoArr);
  const imageTracks = computed(() => trackStats.value.imageArr);

  const recentTracks = computed(() => {
    const ts = tracks.value;
    const withPlayed = ts.filter((t) => t.lastPlayed);
    if (withPlayed.length === 0) return [];
    return topN(withPlayed, 20, (t) => t.lastPlayed || 0);
  });
  const mostPlayed = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    return topN(ts, 20, (t) => t.playCount);
  });

  const artists = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    if (ts.length === lastTracksCount && cachedArtists.length) return cachedArtists;
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      const artist = ts[i].metadata?.artist || 'Unknown Artist';
      if (!map.has(artist)) map.set(artist, []);
      map.get(artist)!.push(ts[i]);
    }
    cachedArtists = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    lastTracksCount = ts.length;
    return cachedArtists;
  });

  const albums = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    if (ts.length === lastTracksCount && cachedAlbums.length) return cachedAlbums;
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      const album = ts[i].metadata?.album || 'Unknown Album';
      if (!map.has(album)) map.set(album, []);
      map.get(album)!.push(ts[i]);
    }
    cachedAlbums = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    lastTracksCount = ts.length;
    return cachedAlbums;
  });

  return {
    trackStats,
    audioCount,
    videoCount,
    imageCount,
    audioTracks,
    videoTracks,
    imageTracks,
    recentTracks,
    mostPlayed,
    artists,
    albums,
    invalidateDerivedCache
  };
}
