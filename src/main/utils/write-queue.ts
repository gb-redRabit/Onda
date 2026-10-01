/**
 * Serializuje asynchroniczne zapisy przez ograniczoną kolejkę FIFO zamiast
 * rosnącego w nieskończoność łańcucha promise'ów (`q = q.then(...)`), który
 * zachowuje każde oczekujące ogniwo. Zadania działają jedno po drugim w kolejności;
 * zadanie, które zawiedzie, jest izolowane i nie zatrzymuje następnych.
 */
export class WriteQueue {
  private readonly items: Array<() => Promise<void>> = [];
  private running = false;
  private readonly idleWaiters: Array<() => void> = [];

  push(task: () => Promise<void>): void {
    this.items.push(task);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let task = this.items.shift();
      while (task) {
        try {
          await task();
        } catch {
          // Zadanie nie może zepsuć kolejki; oczekuje się, że samo zgłosi
          // swoją awarię (log-file to robi).
        }
        task = this.items.shift();
      }
    } finally {
      this.running = false;
      const waiters = this.idleWaiters.splice(0, this.idleWaiters.length);
      for (const wait of waiters) wait();
    }
  }

  /** Rozwiązuje się, gdy każde dotąd dodane zadanie zostało zakończone. */
  whenIdle(): Promise<void> {
    if (!this.running && this.items.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }
}
