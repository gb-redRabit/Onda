type AudioEvents = {
  timeUpdate: number;
  durationChange: number;
  playStateChange: boolean;
  trackEnd: void;
  trackLoaded: void;
  bufferChange: number;
  playable: void;
  streamError: string;
};

type Listener<T> = (data: T) => void;

class AudioEventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends keyof AudioEvents>(event: K, fn: Listener<AudioEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn as Listener<unknown>);
    return () => this.listeners.get(event)?.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof AudioEvents>(event: K, data: AudioEvents[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  off<K extends keyof AudioEvents>(event: K, fn: Listener<AudioEvents[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<unknown>);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const audioEvents = new AudioEventBus();
