// Maszyna stanów peek/auto-hide dla audio PiP zadokowanego na krawędzi (plan 6.2),
// wyodrębniona z `audio-pip-manager.ts`, aby można ją było testować bez Electrona.
// Manager dostarcza politykę (`canPeek`) i efekty uboczne (współrzędne +
// aktualizacja UI); kontroler posiada stan i timer.

export interface PeekControllerDeps {
  /** Auto-hide włączony, aktywne zadokowanie na krawędzi i brak pokazywanego podglądu. */
  canPeek: () => boolean;
  /** Peek dotyczy tylko żywego, widocznego okna. */
  isWindowVisible: () => boolean;
  /** Repozycjonuje okno dla nowego stanu peeked. */
  applyPeeked: (peeked: boolean) => void;
  /** Wywoływane po zmianie stanu (odświeżenie UI); opcjonalne. */
  onChanged?: (peeked: boolean) => void;
  delayMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

const DEFAULT_DELAY_MS = 900;

export class PeekController {
  private peekedState = false;
  private mouseInside = false;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: PeekControllerDeps) {}

  get peeked(): boolean {
    return this.peekedState;
  }

  isScheduled(): boolean {
    return this.delayTimer !== null;
  }

  setMouseInside(inside: boolean): void {
    this.mouseInside = inside;
  }

  peek(): void {
    if (this.mouseInside) return;
    this.setPeeked(true);
  }

  unpeek(): void {
    this.setPeeked(false);
  }

  /** Uzbraja timer auto-peek; no-op, gdy jakiś jest w toku, gdy peek nie jest
   * dozwolony lub gdy okno jest już w stanie peeked. */
  schedule(): void {
    if (this.delayTimer || !this.deps.canPeek() || this.peekedState) return;
    const setTimeoutFn = this.deps.setTimeoutFn ?? setTimeout;
    this.delayTimer = setTimeoutFn(() => {
      this.delayTimer = null;
      this.peek();
    }, this.deps.delayMs ?? DEFAULT_DELAY_MS);
  }

  cancelDelay(): void {
    if (this.delayTimer) {
      const clearTimeoutFn = this.deps.clearTimeoutFn ?? clearTimeout;
      clearTimeoutFn(this.delayTimer);
      this.delayTimer = null;
    }
  }

  /** Usuwa oczekujący timer i stan peeked (wywołujący zwykle też ukrywają). */
  reset(): void {
    this.cancelDelay();
    this.peekedState = false;
  }

  private setPeeked(next: boolean): void {
    if (!this.deps.canPeek() || this.peekedState === next) return;
    if (!this.deps.isWindowVisible()) return;
    this.peekedState = next;
    this.cancelDelay();
    this.deps.applyPeeked(next);
    this.deps.onChanged?.(next);
  }
}
