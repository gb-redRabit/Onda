import type { MediaFile } from './types/media';

/**
 * Usuwa binarne okładki z obiektu utworu wysyłanego przez IPC. `metadata.picture`
 * potrafi mieć setki kilobajtów, a shell i tak ładuje okładki przez `media:getCover`.
 * Zwraca nowy obiekt — nie mutuje utworu trzymanego w Core.
 */
export function stripTrackPictures(track: MediaFile | null): MediaFile | null {
  if (!track) return null;
  if (!track.metadata?.picture?.length) return track;
  const metadata = { ...track.metadata };
  delete metadata.picture;
  return { ...track, metadata };
}

/**
 * Zamienia utwór z reactive()/ref() na czysty obiekt możliwy do wysłania przez IPC.
 * Samo `stripTrackPictures` zwracało Proxy, a structured clone odrzuca Proxy
 * („An object could not be cloned”). JSON usuwa też `undefined` i egzotyczne
 * wartości, zostawiając wyłącznie dane DTO.
 */
export function toPlainTrack(track: MediaFile | null): MediaFile | null {
  const stripped = stripTrackPictures(track);
  if (!stripped) return null;
  return JSON.parse(JSON.stringify(stripped)) as MediaFile;
}
