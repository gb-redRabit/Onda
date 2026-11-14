import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
let progressCallback: ((...args: unknown[]) => void) | null = null;

beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  progressCallback = null;
  Object.defineProperty(window, 'api', {
    value: {
      invoke,
      on: (channel: string, callback: (...args: unknown[]) => void) => {
        if (channel === 'library:loudness:progress') progressCallback = callback;
        return () => {};
      }
    },
    configurable: true
  });
});

async function loadComposable() {
  const mod = await import('../useLoudnessAnalysis');
  return mod.useLoudnessAnalysis();
}

describe('useLoudnessAnalysis', () => {
  it('runs the analysis, reports progress and stores the result', async () => {
    const result = {
      analyzed: 2,
      albums: 1,
      failed: 0,
      aborted: false,
      truncated: false,
      updated: 2
    };
    invoke.mockResolvedValue(result);
    const loudness = await loadComposable();

    const pending = loudness.analyze();
    expect(loudness.running.value).toBe(true);
    progressCallback?.({ current: 1, total: 2 });
    expect(loudness.current.value).toBe(1);
    expect(loudness.total.value).toBe(2);
    await pending;

    expect(invoke).toHaveBeenCalledWith('library:analyzeLoudness');
    expect(loudness.running.value).toBe(false);
    expect(loudness.result.value).toEqual(result);
    expect(loudness.error.value).toBeNull();
  });

  it('surfaces a main-process error result', async () => {
    invoke.mockResolvedValue({
      analyzed: 0,
      albums: 0,
      failed: 0,
      aborted: false,
      truncated: false,
      updated: 0,
      error: 'FFmpeg is not available'
    });
    const loudness = await loadComposable();

    await loudness.analyze();

    expect(loudness.error.value).toBe('FFmpeg is not available');
  });

  it('cancels the running analysis', async () => {
    invoke.mockResolvedValue(true);
    const loudness = await loadComposable();

    await loudness.cancel();

    expect(invoke).toHaveBeenCalledWith('library:loudnessCancel');
  });

  it('subscribes once and ignores empty progress payloads', async () => {
    const loudness = await loadComposable();
    const mod = await import('../useLoudnessAnalysis');
    const second = mod.useLoudnessAnalysis();

    expect(second.running.value).toBe(false);

    progressCallback?.();
    progressCallback?.({ current: undefined, total: undefined });
    expect(loudness.current.value).toBe(0);
    expect(loudness.total.value).toBe(0);

    progressCallback?.({ current: 3 });
    expect(loudness.current.value).toBe(3);
    progressCallback?.({ total: 4 });
    expect(loudness.total.value).toBe(4);
  });

  it('ignores a second analyze while one is running', async () => {
    let resolve!: (value: unknown) => void;
    invoke.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const loudness = await loadComposable();

    const first = loudness.analyze();
    expect(loudness.running.value).toBe(true);
    await loudness.analyze();
    resolve(null);
    await first;

    expect(loudness.running.value).toBe(false);
    expect(loudness.result.value).toBeNull();
  });

  it('captures thrown errors of any type', async () => {
    invoke.mockRejectedValueOnce(new Error('boom'));
    const loudness = await loadComposable();

    await loudness.analyze();
    expect(loudness.error.value).toBe('boom');

    vi.resetModules();
    invoke.mockRejectedValueOnce('plain');
    const reloaded = await loadComposable();

    await reloaded.analyze();
    expect(reloaded.error.value).toBe('plain');
  });
});
