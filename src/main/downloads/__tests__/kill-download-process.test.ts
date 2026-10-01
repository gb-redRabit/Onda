import { afterAll, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { killDownloadProcess } from '../kill-download-process';

// `child.kill()` sygnalizuje jeden proces. yt-dlp uruchamia ffmpeg, więc anulowanie zadania
// zostawiało działający enkoder: wciąż zapisujący plik wyjściowy, wciąż
// trzymający uchwyt i niemożliwy do zabicia z UI, bo zadanie zniknęło. Ponowione
// zadanie konkurowało wtedy z osieroconym procesem o to samo miejsce docelowe.

vi.mock('@shared/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

class FakeChild extends EventEmitter {
  pid: number | undefined;
  killed = false;
  signals: NodeJS.Signals[] = [];

  private handlers: Array<[NodeJS.Signals, () => void]> = [];

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    this.signals.push(signal as NodeJS.Signals);
    const handlers = this.handlers.filter(([s]) => s === signal);
    for (const [, fn] of handlers) fn();
    return true;
  }

  /** Symuluje proces, który przechwytuje SIGTERM i działa dalej. */
  onSignal(signal: NodeJS.Signals, fn: () => void): void {
    this.handlers.push([signal, fn]);
  }

  exit(): void {
    this.killed = true;
    this.emit('exit', 0, null);
  }
}

const PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

describe('killDownloadProcess', () => {
  it('asks the process to stop rather than killing it outright', () => {
    const child = new FakeChild();
    child.pid = 4242;
    child.onSignal('SIGTERM', () => child.exit());
    setPlatform('linux');

    killDownloadProcess(child as never);

    // Najpierw SIGTERM: yt-dlp sprząta swój .part przy uprzejmym sygnale, a
    // twarde zabicie od razu zostawiłoby obcięte pobieranie.
    expect(child.signals[0]).toBe('SIGTERM');
  });

  it('escalates to SIGKILL when the process ignores SIGTERM', () => {
    vi.useFakeTimers();
    try {
      const child = new FakeChild();
      child.pid = 4242;
      // Brak handlera: proces przeżywa SIGTERM, jak zawieszony ffmpeg.
      setPlatform('linux');

      killDownloadProcess(child as never);
      expect(child.signals).toEqual(['SIGTERM']);

      vi.advanceTimersByTime(2500);

      expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not escalate once the process is gone', () => {
    vi.useFakeTimers();
    try {
      const child = new FakeChild();
      child.pid = 4242;
      child.onSignal('SIGTERM', () => child.exit());
      setPlatform('linux');

      killDownloadProcess(child as never);
      child.exit();
      vi.advanceTimersByTime(10_000);

      expect(child.signals).toEqual(['SIGTERM']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives being called twice on the same child', () => {
    vi.useFakeTimers();
    try {
      const child = new FakeChild();
      child.pid = 4242;
      setPlatform('linux');

      killDownloadProcess(child as never);
      child.killed = true;
      killDownloadProcess(child as never);
      vi.advanceTimersByTime(5000);

      expect(child.signals).toEqual(['SIGTERM']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a missing child instead of throwing', () => {
    expect(() => killDownloadProcess(null)).not.toThrow();
    expect(() => killDownloadProcess(undefined)).not.toThrow();
  });

  it('falls back to the single process when the group signal is refused', () => {
    const child = new FakeChild();
    child.pid = undefined;
    setPlatform('linux');

    // Brak pid oznacza brak grupy do sygnalizowania; proces i tak musi zginąć.
    expect(() => killDownloadProcess(child as never)).not.toThrow();
    expect(child.signals[0]).toBe('SIGTERM');
  });
});

afterAll(() => {
  setPlatform(PLATFORM);
});
