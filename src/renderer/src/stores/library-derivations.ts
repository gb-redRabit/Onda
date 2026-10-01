import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { topN } from '@renderer/utils/topN';

// `tracks` to `shallowRef`: edycje metadanych utworu muszą być sygnalizowane przez
// wywołującego przez `triggerRef`. Statystyki odtwarzania (playCount / lastPlayed) żyją na
// tych samych obiektach, ale zmieniają się przy każdym odtworzeniu, więc są publikowane przez
// osobny licznik `statsRevision` — dzięki temu skończenie utworu tylko
// przelicza dwa widoki statystyk, a nie grupowanie artystów/albumów (które sortuje
// tysiące wpisów przez `localeCompare` i powoduje zacinanie UI przy bibliotece 50k).
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
      // Tylko pliki audio noszą metadane artysty — wideo/obrazy nie mogą być
      // wrzucane do "Unknown Artist".
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
      // Tylko pliki audio mogą należeć do albumu — trzymaj obrazy/wideo poza
      // widokiem albumów (nie mają tagu albumu i trafiłyby do
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
