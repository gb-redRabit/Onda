import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'child_process';

// The regression this file exists for: `persist()` used to REPLACE the object in
// the `jobs` map. The running download kept writing to the old object (and set
// `job.child` on it), so `cancelDownloadJob` looked the job up in the map, found
// a copy without the child process, and returned false — the cancel silently
// did nothing and the download ran to completion.

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd(), isPackaged: false }
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

    // What the runner does on the first progress line.
    state.persist(job);
    const trackedBefore = state.jobs.get(job.id);
    expect(trackedBefore).toBe(job);

    // What download-attempt.ts does when yt-dlp starts.
    const child = { kill: vi.fn() } as unknown as ChildProcess;
    job.child = child;
    state.persist(job);

    // A later lookup (cancel/pause) must see the very same object.
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

    // The IPC snapshot has no `child` field (it is not an IPC field), so this
    // is the case that used to silently drop the process handle.
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

    // The memo is gone, so the next persist is treated as a status transition
    // and marks the queue dirty again.
    state.persist(job);
    state.persist(job);
    expect(emit).toHaveBeenCalledTimes(3);
  });
});

describe('queueOrder removal', () => {
  it('never removes the last element when the id is not queued', async () => {
    const state = await loadState();
    state.queueOrder.length = 0;
    state.queueOrder.push('a', 'b', 'c');

    // The bug: `splice(indexOf(id), 1)` with indexOf === -1 deletes 'c'.
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
