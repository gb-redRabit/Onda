import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useLibraryDerivations } from '../library-derivations';
import type { MediaFile } from '@renderer/types/media';

function track(path: string, artist: string, album: string): MediaFile {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    metadata: { artist, album }
  } as MediaFile;
}

describe('library derivations follow metadata edits, not just the track count', () => {
  it('regroups artists when a tag is edited without adding a track', () => {
    const tracks = ref<MediaFile[]>([track('/a.mp3', 'Alpha', 'One')]);
    const d = useLibraryDerivations(tracks);

    // Odczyt powyżej jest tu istotny: rozgrzewa memo, więc poniższa edycja trafia na
    // zapełniony cache, a nie pusty.
    expect(d.artists.value.map(([name]) => name)).toEqual(['Alpha']);

    // Ta sama długość, inny artysta. Stary cache był kluczowany po tracks.length, więc
    // ta edycja była niewidoczna, dopóki biblioteka nie została ponownie przeskanowana.
    tracks.value[0].metadata!.artist = 'Beta';

    expect(d.artists.value.map(([name]) => name)).toEqual(['Beta']);
  });

  it('regroups albums when a tag is edited without adding a track', () => {
    const tracks = ref<MediaFile[]>([track('/a.mp3', 'Alpha', 'One')]);
    const d = useLibraryDerivations(tracks);

    expect(d.albums.value.map(([name]) => name)).toEqual(['One']);

    tracks.value[0].metadata!.album = 'Two';

    expect(d.albums.value.map(([name]) => name)).toEqual(['Two']);
  });

  it('does not let one derivation poison the other', () => {
    // Oba dzieliły kiedyś jeden licznik długości, więc ten, który policzył się ostatni, ustawiał
    // go, a drugi pozostawał w przekonaniu, że jego cache jest wciąż ważny.
    const tracks = ref<MediaFile[]>([track('/a.mp3', 'Alpha', 'One')]);
    const d = useLibraryDerivations(tracks);

    // Oba są tu czytane, więc oba memo są rozgrzane, zanim którykolwiek tag zostanie edytowany.
    expect(d.artists.value.map(([n]) => n)).toEqual(['Alpha']);
    expect(d.albums.value.map(([n]) => n)).toEqual(['One']);

    tracks.value[0].metadata!.artist = 'Beta';
    tracks.value[0].metadata!.album = 'Two';

    expect(d.artists.value.map(([n]) => n)).toEqual(['Beta']);
    expect(d.albums.value.map(([n]) => n)).toEqual(['Two']);
  });

  it('still groups by the real tag, not the fallback, across a rescan', () => {
    const tracks = ref<MediaFile[]>([track('/a.mp3', '', ''), track('/b.mp3', '', '')]);
    const d = useLibraryDerivations(tracks);
    expect(d.artists.value.map(([n]) => n)).toEqual(['Unknown Artist']);
    expect(d.albums.value.map(([n]) => n)).toEqual(['Unknown Album']);

    tracks.value = [track('/a.mp3', 'Alpha', 'One'), track('/b.mp3', 'Alpha', 'One')];
    expect(d.artists.value).toHaveLength(1);
    expect(d.albums.value).toHaveLength(1);
  });
});
