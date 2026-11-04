// `music-metadata` parsuje tagi wielu formatów i jest dużym modułem ESM. Ładujemy
// go dopiero przy pierwszym odczycie metadanych (skan, okładka, napisy, edytor),
// żeby nie obciążał startu procesu main. Import jest cache'owany przez sam loader.
type MusicMetadata = typeof import('music-metadata');

let metadataPromise: Promise<MusicMetadata> | null = null;

export function loadMusicMetadata(): Promise<MusicMetadata> {
  if (!metadataPromise) metadataPromise = import('music-metadata');
  return metadataPromise;
}
