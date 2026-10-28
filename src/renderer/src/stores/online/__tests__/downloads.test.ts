import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nextTick, reactive, watchEffect } from 'vue';
import { createOnlineDownloads } from '../downloads';

// Regresja: zadania budowane z preferencji subskrypcji (Pinia = reaktywne proxy Vue)
// muszą być sprowadzone do zwykłych obiektów przed IPC. Bez tego `ipcRenderer.invoke`
// rzuca "An object could not be cloned" i cała partia pobrań jest po cichu odrzucana.

const invoke = vi.fn();
beforeEach(() => {
  invoke.mockReset();
  (window as unknown as { api: unknown }).api = { invoke };
});

function input(overrides: Record<string, unknown>) {
  return {
    url: 'https://www.youtube.com/watch?v=x',
    title: 't',
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    outputDir: '',
    filenameTemplate: '{title}',
    ...overrides
  };
}

describe('createOnlineDownloads.submitJobs', () => {
  it('sends a structured-cloneable payload even when built from reactive prefs', async () => {
    invoke.mockResolvedValueOnce([]);
    const dl = createOnlineDownloads(() => {});
    const cover = reactive({ type: 'thumbnail' });
    const metaOverride = reactive({ artist: 'A', album: 'B' });
    const batch = [input({ videoId: 'x', cover, metaOverride }) as never];

    await dl.submitJobs(batch);

    expect(invoke).toHaveBeenCalledTimes(1);
    const payload = invoke.mock.calls[0][1] as unknown;
    expect(() => structuredClone(payload)).not.toThrow();
    const sent = (payload as Array<{ cover: unknown; metaOverride: unknown }>)[0];
    expect(sent.cover).toEqual({ type: 'thumbnail' });
    expect(sent.metaOverride).toEqual({ artist: 'A', album: 'B' });
  });

  it('returns the created tasks', async () => {
    invoke.mockResolvedValueOnce([{ id: '1', videoId: 'x' }]);
    const dl = createOnlineDownloads(() => {});
    await expect(dl.submitJobs([input({ videoId: 'x' }) as never])).resolves.toEqual([
      { id: '1', videoId: 'x' }
    ]);
  });

  it('is a no-op for an empty batch', async () => {
    const dl = createOnlineDownloads(() => {});
    await expect(dl.submitJobs([])).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('createOnlineDownloads.downloadStatusFor', () => {
  it('stays reactive after an optimistic status update', async () => {
    invoke.mockResolvedValueOnce(true);
    const dl = createOnlineDownloads(() => {});
    dl.upsertTask({ id: '1', videoId: 'x', title: 't', status: 'downloading' } as never);

    let observed: string | null = null;
    const stop = watchEffect(() => {
      observed = dl.downloadStatusFor('x');
    });
    expect(observed).toBe('downloading');

    await dl.cancelDownload('1');
    await nextTick();

    expect(observed).toBe('cancelled');
    expect(dl.coverStatusFor('x')).toBeNull();
    stop();
  });
});

describe('createOnlineDownloads.retryCover', () => {
  function coverTask(overrides: Record<string, unknown> = {}) {
    return {
      id: '1',
      title: 't',
      videoId: 'x',
      status: 'completed',
      coverStatus: 'error',
      coverError: 'boom',
      ...overrides
    };
  }

  it('optimistically marks the cover as fetching and sends the IPC', async () => {
    invoke.mockResolvedValueOnce({ success: true });
    const dl = createOnlineDownloads(() => {});
    dl.upsertTask(coverTask() as never);

    await dl.retryCover(dl.downloads.value[0]);

    expect(invoke).toHaveBeenCalledWith('yt:download:retryCover', '1');
    expect(dl.downloads.value[0].coverStatus).toBe('fetching');
    expect(dl.downloads.value[0].coverError).toBeUndefined();
  });

  it('reverts to the previous state when the retry fails', async () => {
    invoke.mockResolvedValueOnce({ success: false, error: 'nope' });
    const dl = createOnlineDownloads(() => {});
    dl.upsertTask(coverTask() as never);

    await dl.retryCover(dl.downloads.value[0]);

    expect(dl.downloads.value[0].coverStatus).toBe('error');
    expect(dl.downloads.value[0].coverError).toBe('boom');
  });
});
