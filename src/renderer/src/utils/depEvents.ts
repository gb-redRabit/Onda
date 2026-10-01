type DepEvents = {
  /** Zależność została zainstalowana, zaktualizowana lub usunięta — status mógł się zmienić. */
  changed: void;
};

type Listener<T> = (data: T) => void;

class DepEventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends keyof DepEvents>(event: K, fn: Listener<DepEvents[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as Listener<unknown>);
    return () => this.listeners.get(event)?.delete(fn as Listener<unknown>);
  }

  // Payloady `void` są emitowane bez argumentu (`emit('changed')`).
  emit<K extends keyof DepEvents>(
    event: K,
    ...args: DepEvents[K] extends void ? [] : [DepEvents[K]]
  ): void {
    const data = args[0] as DepEvents[K];
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  off<K extends keyof DepEvents>(event: K, fn: Listener<DepEvents[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<unknown>);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Lokalny dla renderera bus zmian zależności. Sam status jest sondowany w
// procesie głównym (dep:check*), więc cokolwiek trzyma własną kopię — dziś
// banner brakujących zależności — musi zostać pchnięte po zakończeniu instalacji,
// zamiast czekać na następny focus okna.
export const depEvents = new DepEventBus();
