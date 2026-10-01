/**
 * Serialises async writes through a bounded FIFO instead of an ever-growing
 * promise chain (`q = q.then(...)`), which retains every pending link. Tasks
 * run one at a time in order; a failing task is isolated and does not stop the
 * ones after it.
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
          // A task must not break the queue; it is expected to report its own
          // failure (log-file does).
        }
        task = this.items.shift();
      }
    } finally {
      this.running = false;
      const waiters = this.idleWaiters.splice(0, this.idleWaiters.length);
      for (const wait of waiters) wait();
    }
  }

  /** Resolves once every task pushed so far has settled. */
  whenIdle(): Promise<void> {
    if (!this.running && this.items.length === 0) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }
}
