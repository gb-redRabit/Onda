type DepEvents = {
  /** A dependency was installed, updated or removed — status may have changed. */
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

  // `void` payloads are emitted without an argument (`emit('changed')`).
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

// Renderer-local bus for dependency changes. The status itself is probed in the
// main process (dep:check*), so anything that keeps its own copy — today the
// missing-dependencies banner — must be nudged when an install finishes instead
// of waiting for the next window focus.
export const depEvents = new DepEventBus();
