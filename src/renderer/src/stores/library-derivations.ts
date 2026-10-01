import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { topN } from '@renderer/utils/topN';

// `tracks` is a `shallowRef`: edits to a track's metadata must be signalled by
// the caller via `triggerRef`. Play statistics (playCount / lastPlayed) live on
// the same objects but change on every play, so they are published through a
// separate `statsRevision` counter instead — that way finishing a song only
// recomputes the two stats views, not the artists/albums grouping (which sorts
// thousands of entries with `localeCompare` and janks the UI on a 50k library).
export function useLibraryDerivations(
  tracks: Ref<MediaFile[]>,
  statsRevision: Ref<number> = ref(0)
) {
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
    void statsRevision.value;
    const ts = tracks.value;
    const withPlayed = ts.filter((t) => t.lastPlayed);
    if (withPlayed.length === 0) return [];
    return topN(withPlayed, 20, (t) => t.lastPlayed || 0);
  });
  const mostPlayed = computed(() => {
    void statsRevision.value;
    const ts = tracks.value;
    if (ts.length === 0) return [];
    return topN(ts, 20, (t) => t.playCount);
  });

  const artists = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      // Only audio files carry artist metadata — videos/images must not be
      // lumped into "Unknown Artist".
      if (ts[i].type !== 'audio') continue;
      const artist = ts[i].metadata?.artist || 'Unknown Artist';
      if (!map.has(artist)) map.set(artist, []);
      map.get(artist)!.push(ts[i]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  });

  const albums = computed(() => {
    const ts = tracks.value;
    if (ts.length === 0) return [];
    const map = new Map<string, MediaFile[]>();
    for (let i = 0; i < ts.length; i++) {
      // Only audio files can belong to an album — keep images/videos out of
      // the albums view (they have no album tag and would end up in
      // "Unknown Album").
      if (ts[i].type !== 'audio') continue;
      const album = ts[i].metadata?.album || 'Unknown Album';
      if (!map.has(album)) map.set(album, []);
      map.get(album)!.push(ts[i]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
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
    albums
  };
}
