type PiPHandler = () => void;

let handler: PiPHandler | null = null;

/**
 * Global registry for the video PiP toggle. /player registers its local
 * `vp.togglePiP` while mounted so app-level menus (Playback menu) can toggle
 * Picture-in-Picture from any view.
 */
export function setPlayerPiPHandler(next: PiPHandler | null): void {
  handler = next;
}

export function getPlayerPiPHandler(): PiPHandler | null {
  return handler;
}
