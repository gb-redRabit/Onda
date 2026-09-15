// Peek/auto-hide state machine for the edge-docked audio PiP (plan 6.2),
// extracted from `audio-pip-manager.ts` so it can be tested without Electron.
// The manager supplies the policy (`canPeek`) and the side effects (bounds +
// UI update); the controller owns the state and the timer.

export interface PeekControllerDeps {
  /** Auto-hide enabled, an edge dock is active and no preview is showing. */
  canPeek: () => boolean;
  /** Peeking only applies to a live, visible window. */
  isWindowVisible: () => boolean;
  /** Repositions the window for the new peeked state. */
  applyPeeked: (peeked: boolean) => void;
  /** Called after the state changed (UI refresh); optional. */
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

  /** Arms the auto-peek timer; no-op while one is pending, when peeking is not
   * allowed or when the window is already peeked. */
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

  /** Drops the pending timer and the peeked state (callers usually also hide). */
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
