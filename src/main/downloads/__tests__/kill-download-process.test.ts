import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { killDownloadProcess } from '../kill-download-process';
import { logger } from '../../../shared/logger';

// `child.kill()` sygnalizuje jeden proces. yt-dlp uruchamia ffmpeg, więc anulowanie zadania
// zostawiało działający enkoder: wciąż zapisujący plik wyjściowy, wciąż
// trzymający uchwyt i niemożliwy do zabicia z UI, bo zadanie zniknęło. Ponowione
// zadanie konkurowało wtedy z osieroconym procesem o to samo miejsce docelowe.

const h = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: h.spawn }));
vi.mock('../../../shared/logger', () => ({
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

function fakeKiller() {
  const killer = new EventEmitter() as EventEmitter & {
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };
  killer.killed = false;
  killer.kill = vi.fn();
  killer.unref = vi.fn();
  h.spawn.mockReturnValue(killer);
  return killer;
}

beforeEach(() => {
  h.spawn.mockReset();
  vi.mocked(logger.warn).mockClear();
});

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

describe('killDownloadProcess on Windows', () => {
  it('kills the whole process tree with taskkill instead of signalling the child', () => {
    setPlatform('win32');
    const child = new FakeChild();
    child.pid = 4242;
    const killer = fakeKiller();

    killDownloadProcess(child as never);

    expect(h.spawn).toHaveBeenCalledWith('taskkill', ['/pid', '4242', '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    expect(child.signals).toEqual([]);
    expect(killer.unref).toHaveBeenCalled();
  });

  it('retries taskkill after the grace period when the process survives', () => {
    vi.useFakeTimers();
    try {
      setPlatform('win32');
      const child = new FakeChild();
      child.pid = 4242;
      fakeKiller();

      killDownloadProcess(child as never);
      expect(h.spawn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);

      expect(h.spawn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        'download',
        expect.stringContaining('ignored SIGTERM')
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('kills a hung taskkill after its own timeout', () => {
    vi.useFakeTimers();
    try {
      setPlatform('win32');
      const child = new FakeChild();
      child.pid = 4242;
      const killer = fakeKiller();

      killDownloadProcess(child as never);
      vi.advanceTimersByTime(5000);

      expect(killer.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs instead of throwing when taskkill cannot start', () => {
    setPlatform('win32');
    const child = new FakeChild();
    child.pid = 4242;
    h.spawn.mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });

    expect(() => killDownloadProcess(child as never)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'download',
      'taskkill for 4242 could not start',
      expect.any(Error)
    );
  });

  it('logs when the taskkill process reports an error', () => {
    setPlatform('win32');
    const child = new FakeChild();
    child.pid = 4242;
    const killer = fakeKiller();

    killDownloadProcess(child as never);
    const failure = new Error('access denied');
    killer.emit('error', failure);

    expect(logger.warn).toHaveBeenCalledWith('download', 'taskkill for 4242 failed', failure);
  });

  it('has no tree to kill when the child has no pid', () => {
    setPlatform('win32');
    const child = new FakeChild();
    child.pid = undefined;

    expect(() => killDownloadProcess(child as never)).not.toThrow();
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it('leaves an already-dead taskkill alone at its timeout', () => {
    vi.useFakeTimers();
    try {
      setPlatform('win32');
      const child = new FakeChild();
      child.pid = 4242;
      const killer = fakeKiller();

      killDownloadProcess(child as never);
      killer.killed = true;
      vi.advanceTimersByTime(5000);

      expect(killer.kill).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('killDownloadProcess escalation without a pid', () => {
  it('still kills the single process and logs a placeholder pid', () => {
    vi.useFakeTimers();
    try {
      setPlatform('linux');
      const child = new FakeChild();
      child.pid = undefined;

      killDownloadProcess(child as never);
      vi.advanceTimersByTime(2000);

      expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
      expect(logger.warn).toHaveBeenCalledWith(
        'download',
        expect.stringContaining('pid ? ignored SIGTERM')
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

afterAll(() => {
  setPlatform(PLATFORM);
});
