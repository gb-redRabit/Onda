import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive } from 'vue';
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

  it('returns the videoIds of the created tasks', async () => {
    invoke.mockResolvedValueOnce([{ id: '1', videoId: 'x' }]);
    const dl = createOnlineDownloads(() => {});
    await expect(dl.submitJobs([input({ videoId: 'x' }) as never])).resolves.toEqual(['x']);
  });

  it('is a no-op for an empty batch', async () => {
    const dl = createOnlineDownloads(() => {});
    await expect(dl.submitJobs([])).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});
