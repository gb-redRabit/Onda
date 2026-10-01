type PiPHandler = () => void;

let handler: PiPHandler | null = null;

/**
 * Globalny rejestr przełącznika PiP wideo. /player rejestruje swój lokalny
 * `vp.togglePiP` podczas montowania, dzięki czemu menu na poziomie aplikacji (menu Odtwarzanie) mogą przełączać
 * Picture-in-Picture z dowolnego widoku.
 */
export function setPlayerPiPHandler(next: PiPHandler | null): void {
  handler = next;
}

export function getPlayerPiPHandler(): PiPHandler | null {
  return handler;
}
