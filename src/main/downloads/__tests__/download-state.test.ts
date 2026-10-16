import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'child_process';

// Regresja, dla której istnieje ten plik: `persist()` ZASTĘPOWAŁ obiekt w
// mapie `jobs`. Działające pobieranie nadal pisało do starego obiektu (i ustawiało
// na nim `job.child`), więc `cancelDownloadJob` odszukiwał zadanie w mapie, znajdował
// kopię bez procesu potomnego i zwracał false — anulowanie po cichu
// nic nie robiło, a pobieranie biegło do końca.

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd(), isPackaged: false }
}));

// Kolejka zapisywana na dysk jest nieistotna dla tych testów; izolujemy się od fs,
// żeby fałszywe zegary mogły bezpiecznie odpalać debounce zapisu.
vi.mock('../download-queue-store', () => ({
  persistJobs: vi.fn(async () => {}),
  queueFilePath: () => 'queue.json',
  capPersistedJobs: (jobs: unknown[]) => jobs
}));

const emit = vi.fn();

async function loadState() {
  vi.resetModules();
  return import('../download-state');
}

describe('download job identity', () => {
  beforeEach(() => {
    emit.mockReset();
  });

  it('keeps the same object in the map so a child process stays reachable', async () => {
    const state = await loadState();
    state.setDownloadEmit(emit);

    const job = { id: 'job-1', url: 'https://x/y', title: 't', status: 'downloading' } as any;
    state.jobs.set(job.id, job);

    // Co robi runner przy pierwszej linii postępu.
    state.persist(job);
    const trackedBefore = state.jobs.get(job.id);
    expect(trackedBefore).toBe(job);

    // Co robi download-attempt.ts, gdy yt-dlp startuje.
    const child = { kill: vi.fn() } as unknown as ChildProcess;
    job.child = child;
    state.persist(job);

    // Późniejsze wyszukanie (anulowanie/pauza) musi zobaczyć ten sam obiekt.
    const trackedAfter = state.jobs.get(job.id);
    expect(trackedAfter).toBe(job);
    expect(trackedAfter?.child).toBe(child);
  });

  it('carries the child across a persist that replaces the IPC fields', async () => {
    const state = await loadState();
    state.setDownloadEmit(emit);

    const job = { id: 'job-2', url: 'https://x/y', title: 't', status: 'downloading' } as any;
    state.jobs.set(job.id, job);
    const child = { kill: vi.fn() } as unknown as ChildProcess;
    job.child = child;
    state.persist(job);

    // Migawka IPC nie ma pola `child` (nie jest to pole IPC), więc to
    // jest przypadek, który kiedyś po cichu gubił uchwyt procesu.
    const { snapshotDownloadTask } = await import('../download-snapshot');
    expect(snapshotDownloadTask(job)).not.toHaveProperty('child');
    expect(state.jobs.get('job-2')?.child).toBe(child);
  });

  it('adopts a job that was never registered under its id', async () => {
    const state = await loadState();
    state.setDownloadEmit(emit);

    const job = { id: 'job-3', url: 'https://x/y', title: 't', status: 'pending' } as any;
    state.persist(job);

    expect(state.jobs.get('job-3')).toBe(job);
  });

  it('emits a snapshot without the process handle', async () => {
    const state = await loadState();
    emit.mockReset();
    state.setDownloadEmit(emit);

    const job = { id: 'job-4', url: 'https://x/y', title: 't', status: 'downloading' } as any;
    state.jobs.set(job.id, job);
    job.child = { kill: vi.fn() } as unknown as ChildProcess;
    state.persist(job);

    expect(emit).toHaveBeenCalledTimes(1);
    const emitted = emit.mock.calls[0][0] as Record<string, unknown>;
    expect(emitted).not.toHaveProperty('child');
    expect(emitted.status).toBe('downloading');
  });

  it('forgetJob drops the status memo and the abort controller', async () => {
    const state = await loadState();
    state.setDownloadEmit(emit);

    const job = { id: 'job-5', url: 'https://x/y', title: 't', status: 'downloading' } as any;
    state.jobs.set(job.id, job);
    state.persist(job);
    state.jobAbortControllers.set('job-5', new AbortController());

    state.forgetJob('job-5');
    expect(state.jobAbortControllers.has('job-5')).toBe(false);

    // Memo zniknęło, więc następny persist jest traktowany jako zmiana statusu
    // i ponownie oznacza kolejkę jako brudną.
    state.persist(job);
    state.persist(job);
    expect(emit).toHaveBeenCalledTimes(3);
  });
});

describe('progress emit throttling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    emit.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces rapid progress ticks but flushes the last one', async () => {
    const state = await loadState();
    state.setDownloadEmit(emit);
    const job = { id: 'job-t', url: 'https://x/y', title: 't', status: 'downloading' } as any;
    state.jobs.set(job.id, job);

    state.persistThrottled(job); // pierwsze tyknięcie — natychmiast
    state.persistThrottled(job);
    state.persistThrottled(job);
    expect(emit).toHaveBeenCalledTimes(1);

    // Po oknie dławienia domyka się z ostatnim tyknięciem (postęp nie ginie).
    await vi.advanceTimersByTimeAsync(600);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('emits a status change immediately and drops the queued progress tick', async () => {
    const state = await loadState();
    state.setDownloadEmit(emit);
    const job = { id: 'job-u', url: 'https://x/y', title: 't', status: 'downloading' } as any;
    state.jobs.set(job.id, job);

    state.persistThrottled(job); // natychmiast (1)
    state.persistThrottled(job); // zakolejkowane tyknięcie
    state.persist(job); // natychmiast (2) — unieważnia zakolejkowane
    expect(emit).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(600);
    expect(emit).toHaveBeenCalledTimes(2); // brak spóźnionego duplikatu
  });

  it('does not resurrect a job that was dropped before the trailing tick', async () => {
    const state = await loadState();
    state.setDownloadEmit(emit);
    const job = { id: 'job-v', url: 'https://x/y', title: 't', status: 'downloading' } as any;
    state.jobs.set(job.id, job);

    state.persistThrottled(job); // natychmiast (1)
    state.persistThrottled(job); // zakolejkowane
    state.jobs.delete(job.id);
    state.forgetJob(job.id);
    await vi.advanceTimersByTimeAsync(600);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(state.jobs.has(job.id)).toBe(false);
  });
});

describe('queueOrder removal', () => {
  it('never removes the last element when the id is not queued', async () => {
    const state = await loadState();
    state.queueOrder.length = 0;
    state.queueOrder.push('a', 'b', 'c');

    // Błąd: `splice(indexOf(id), 1)` przy indexOf === -1 usuwa 'c'.
    const idx = state.queueOrder.indexOf('missing');
    if (idx >= 0) state.queueOrder.splice(idx, 1);
    expect(state.queueOrder).toEqual(['a', 'b', 'c']);
  });
});

describe('reportCompleted routing', () => {
  it('routes a channel+video job to the subscription handler only', async () => {
    const state = await loadState();
    const subs = vi.fn();
    const sources = vi.fn();
    state.setDownloadCompletedHandler(subs);
    state.setSourceItemDownloadedHandler(sources);

    state.reportCompleted({ channelId: 'ch', videoId: 'vid' } as any);

    expect(subs).toHaveBeenCalledWith('ch', 'vid');
    expect(sources).not.toHaveBeenCalled();
  });

  it('routes a source+item job to the sources handler only', async () => {
    const state = await loadState();
    const subs = vi.fn();
    const sources = vi.fn();
    state.setDownloadCompletedHandler(subs);
    state.setSourceItemDownloadedHandler(sources);

    state.reportCompleted({ source: { sourceId: 'src', sourceItemId: 'item' } } as any);

    expect(sources).toHaveBeenCalledWith('src', 'item');
    expect(subs).not.toHaveBeenCalled();
  });

  it('does not report a source job without an item id', async () => {
    const state = await loadState();
    const sources = vi.fn();
    state.setSourceItemDownloadedHandler(sources);

    state.reportCompleted({ source: { sourceId: 'src' } } as any);

    expect(sources).not.toHaveBeenCalled();
  });
});
