// Jedyny `<video>` należący do odtwarzacza. `document.querySelector('video')`
// może trafić animowaną okładkę `<MediaCover>` i przewinąć ją zamiast filmu.
let current: HTMLVideoElement | null = null;

export function setPlayerVideoElement(element: HTMLVideoElement | null): void {
  current = element;
}

export function getPlayerVideoElement(): HTMLVideoElement | null {
  return current;
}
