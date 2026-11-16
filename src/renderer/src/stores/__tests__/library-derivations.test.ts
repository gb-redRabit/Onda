import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useLibraryDerivations } from '../library-derivations';
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST } from '@renderer/utils/libraryLabels';
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
    expect(d.artists.value.map(([n]) => n)).toEqual([UNKNOWN_ARTIST]);
    expect(d.albums.value.map(([n]) => n)).toEqual([UNKNOWN_ALBUM]);

    tracks.value = [track('/a.mp3', 'Alpha', 'One'), track('/b.mp3', 'Alpha', 'One')];
    expect(d.artists.value).toHaveLength(1);
    expect(d.albums.value).toHaveLength(1);
  });

  it('splits same-named albums by artist and disambiguates the label', () => {
    const tracks = ref<MediaFile[]>([
      track('/a1.mp3', 'Alice', 'Greatest Hits'),
      track('/b1.mp3', 'Bob', 'Greatest Hits'),
      track('/c1.mp3', 'Alice', 'Solo')
    ]);
    const d = useLibraryDerivations(tracks);

    const names = d.albums.value.map(([n]) => n);
    expect(d.albums.value).toHaveLength(3);
    // Unikalna nazwa zostaje bez wykonawcy...
    expect(names).toContain('Solo');
    // ...a powtarzalna jest rozróżniona wykonawcą.
    expect(names).toContain('Greatest Hits — Alice');
    expect(names).toContain('Greatest Hits — Bob');
  });
});

describe('library derivations edge data', () => {
  function media(path: string, type: 'audio' | 'video' | 'image'): MediaFile {
    return {
      id: path,
      name: path.split('/').pop() ?? path,
      path,
      extension: `.${type}`,
      mimeType: `${type}/x`,
      size: 1,
      type,
      metadata: {}
    } as MediaFile;
  }

  it('returns empty derivations for an empty library', () => {
    const d = useLibraryDerivations(ref<MediaFile[]>([]));

    expect(d.trackStats.value).toMatchObject({ audio: 0, video: 0, image: 0 });
    expect(d.recentTracks.value).toEqual([]);
    expect(d.mostPlayed.value).toEqual([]);
    expect(d.artists.value).toEqual([]);
    expect(d.albums.value).toEqual([]);
  });

  it('splits tracks by media type', () => {
    const d = useLibraryDerivations(
      ref<MediaFile[]>([
        media('/a.mp3', 'audio'),
        media('/v.mp4', 'video'),
        media('/i.png', 'image')
      ])
    );

    expect(d.audioCount.value).toBe(1);
    expect(d.videoCount.value).toBe(1);
    expect(d.imageCount.value).toBe(1);
    expect(d.videoTracks.value.map((t) => t.id)).toEqual(['/v.mp4']);
    expect(d.imageTracks.value.map((t) => t.id)).toEqual(['/i.png']);
  });

  it('omits tracks without playback statistics and follows revisions', () => {
    const tracks = ref<MediaFile[]>([
      {
        ...media('/a.mp3', 'audio'),
        lastPlayed: undefined,
        playCount: undefined
      } as unknown as MediaFile,
      { ...media('/b.mp3', 'audio'), lastPlayed: 100, playCount: 2 } as MediaFile
    ]);
    const revision = ref(0);
    const d = useLibraryDerivations(tracks, revision);

    expect(d.recentTracks.value.map((t) => t.id)).toEqual(['/b.mp3']);
    expect(d.mostPlayed.value.map((t) => t.id)).toEqual(['/b.mp3']);

    tracks.value[1].lastPlayed = 200;
    revision.value++;
    expect(d.recentTracks.value[0].lastPlayed).toBe(200);
  });
});

describe('library derivations mixed grouping', () => {
  it('sorts multiple artists and ignores unrelated media types', () => {
    const tracks = ref<MediaFile[]>([
      {
        ...track('/a.mp3', 'Beta', 'One')
      },
      {
        ...track('/b.mp3', 'Alpha', 'Two')
      },
      {
        id: '/notes.txt',
        name: 'notes.txt',
        path: '/notes.txt',
        extension: '.txt',
        mimeType: 'text/plain',
        size: 1,
        type: 'other',
        metadata: {}
      } as unknown as MediaFile
    ]);
    const d = useLibraryDerivations(tracks);

    expect(d.artists.value.map(([name]) => name)).toEqual(['Alpha', 'Beta']);
    expect(d.audioCount.value).toBe(2);
    expect(d.videoCount.value).toBe(0);
    expect(d.imageCount.value).toBe(0);
  });
});
