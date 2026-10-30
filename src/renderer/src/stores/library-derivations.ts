import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import type { MediaFile } from '@renderer/types/media';
import { topN } from '@renderer/utils/topN';
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST } from '@renderer/utils/libraryLabels';

// `tracks` to `shallowRef`: edycje metadanych utworu muszą być sygnalizowane przez
// wywołującego przez `triggerRef`. Statystyki odtwarzania (playCount / lastPlayed) żyją na
// tych samych obiektach, ale zmieniają się przy każdym odtworzeniu, więc są publikowane przez
// osobny licznik `statsRevision` — dzięki temu skończenie utworu tylko
// przelicza dwa widoki statystyk, a nie grupowanie artystów/albumów (które sortuje
// tysiące wpisów przez `localeCompare` i powoduje zacinanie UI przy bibliotece 50k).
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Wspólne grupowanie utworów audio po jednym polu metadanych. `artists` i `albums`
// różniły się tylko kluczem i fallbackiem, więc trzymanie dwóch kopii pętli
// groziło rozjechaniem się przy kolejnych zmianach (np. po `genre`).
function groupAudioByMetadataKey(
  tracks: readonly MediaFile[],
  key: 'artist' | 'album',
  fallback: string
): Array<[string, MediaFile[]]> {
  if (tracks.length === 0) return [];
  const groups = new Map<string, MediaFile[]>();
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const value = track.metadata?.[key] || fallback;
    const bucket = groups.get(value);
    if (bucket) bucket.push(track);
    else groups.set(value, [track]);
  }
  return Array.from(groups.entries()).sort((a, b) => nameCollator.compare(a[0], b[0]));
}

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

  // Tylko AUDIO i tylko faktycznie odtwarzane. Wcześniej pracowały na `tracks`
  // (cała biblioteka, łącznie z wideo i obrazami) bez progu `playCount`, więc
  // „Ostatnio odtwarzane"/„Najczęściej odtwarzane" pokazywały losowe, nieodtwarzane
  // pozycje, w tym pliki nie-audio.
  const recentTracks = computed(() => {
    void statsRevision.value;
    const played = audioTracks.value.filter((t) => (t.lastPlayed ?? 0) > 0);
    return played.length ? topN(played, 20, (t) => t.lastPlayed || 0) : [];
  });
  const mostPlayed = computed(() => {
    void statsRevision.value;
    const played = audioTracks.value.filter((t) => (t.playCount ?? 0) > 0);
    return played.length ? topN(played, 20, (t) => t.playCount) : [];
  });

  // Grupowanie działa na już odfiltrowanej domenie audio (`audioTracks`), a nie na
  // całej bibliotece: obrazy i wideo nie niosą metadanych artysty/albumu, więc
  // wcześniejsze `if (type !== 'audio') continue` marnowało cykle przy każdym
  // odświeżeniu (dla 50k plików to tysiące odrzuceń na każdy widok).
  const artists = computed(() =>
    groupAudioByMetadataKey(audioTracks.value, 'artist', UNKNOWN_ARTIST)
  );

  // Albumy grupujemy po nazwie ORAZ wykonawcy albumu (`albumArtist`, w razie braku
  // `artist`). Wcześniej kluczem była sama nazwa, więc „Greatest Hits" różnych
  // wykonawców zlewało się w jeden album. Gdy ta sama nazwa albumu występuje u
  // kilku wykonawców, etykietę rozróżniamy jako „Album — Wykonawca" (zachowując
  // krotkę `[name, tracks]`, której oczekują konsumenci).
  const albums = computed(() => {
    const groups = new Map<string, { album: string; artist: string; tracks: MediaFile[] }>();
    for (const track of audioTracks.value) {
      const album = track.metadata?.album || UNKNOWN_ALBUM;
      const artist = track.metadata?.albumArtist || track.metadata?.artist || UNKNOWN_ARTIST;
      const key = `${album.toLowerCase()}\u0000${artist.toLowerCase()}`;
      const bucket = groups.get(key);
      if (bucket) bucket.tracks.push(track);
      else groups.set(key, { album, artist, tracks: [track] });
    }
    const nameCounts = new Map<string, number>();
    for (const g of groups.values()) {
      const key = g.album.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    return Array.from(groups.values())
      .map((g): [string, MediaFile[]] => [
        (nameCounts.get(g.album.toLowerCase()) ?? 1) > 1 ? `${g.album} — ${g.artist}` : g.album,
        g.tracks
      ])
      .sort((a, b) => nameCollator.compare(a[0], b[0]));
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
