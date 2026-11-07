import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  isPackaged: false
}));

vi.mock('electron', () => ({
  get app() {
    return {
      get isPackaged() {
        return state.isPackaged;
      }
    };
  }
}));

async function load() {
  vi.resetModules();
  const module = await import('../e2e-fixtures');
  for (const task of module.e2eListDownloadTasks()) module.e2eCancelDownloadTask(task.id);
  module.e2eClearFinishedDownloadTasks();
  return module;
}

function job(url: string, title = 'Job', kind = 'audio') {
  return { url, title, kind } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.isPackaged = false;
  process.env.ONDA_E2E_FIXTURES = '1';
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ONDA_E2E_FIXTURES;
});

describe('feature flag', () => {
  it('enables fixtures only in unpackaged builds with the env flag', async () => {
    let module = await load();
    expect(module.e2eFixturesEnabled()).toBe(true);

    state.isPackaged = true;
    module = await load();
    expect(module.e2eFixturesEnabled()).toBe(false);

    state.isPackaged = false;
    delete process.env.ONDA_E2E_FIXTURES;
    module = await load();
    expect(module.e2eFixturesEnabled()).toBe(false);
  });
});

describe('provider fixtures', () => {
  it('detects the cookie marker and ignores other URLs', async () => {
    const module = await load();
    const cookie = module.e2eProviderDetect('https://e2e.provider.cookie/share');
    expect(cookie).toMatchObject({
      id: 'pikpak',
      capabilities: { auth: 'cookie' },
      ref: { provider: 'pikpak', shareId: 'E2E-SHARE' }
    });
    expect(module.e2eProviderDetect('https://example.com')).toBeNull();
  });

  it('detects the anonymous provider marker', async () => {
    const module = await load();
    expect(module.e2eProviderDetect('https://e2e.provider/xyz')).toMatchObject({
      capabilities: {
        folders: true,
        thumbnails: true,
        anonymous: true,
        expiringLink: true,
        auth: 'none'
      }
    });
  });

  it('lists root and nested folders deterministically', async () => {
    const module = await load();
    expect(module.e2eProviderList()).toEqual([
      { id: 'folder-1', name: 'Folder One', kind: 'folder' },
      { id: 'file-1', name: 'Movie One.mp4', kind: 'file', size: 10485760 },
      { id: 'file-2', name: 'Song Two.flac', kind: 'file', size: 5242880 }
    ]);
    expect(module.e2eProviderList('folder-1')).toEqual([
      { id: 'file-nested', name: 'Nested Clip.mp4', kind: 'file', size: 2097152 }
    ]);
    expect(module.e2eProviderDownloaded()).toEqual(['file-2']);
  });

  it('returns provider credential fixtures', async () => {
    const module = await load();
    expect(module.e2eProviderAuthList()).toEqual([
      { id: 'pikpak', label: 'PikPak', icon: 'pikpak', hasCookie: false, required: true },
      { id: 'gdrive', label: 'Google Drive', icon: 'gdrive', hasCookie: false, required: false }
    ]);
  });

  it('builds three search fixtures for the query', async () => {
    const module = await load();
    const items = module.e2eSearchItems('cats');
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      id: 'e2e-1',
      title: 'E2E Result 1',
      description: 'Fixture result for "cats"',
      channelTitle: 'E2E Channel',
      channelId: 'UCabcdefghijABCDEFGHIJ1234'
    });
    expect(items.map((item) => item.id)).toEqual(['e2e-1', 'e2e-2', 'e2e-3']);
  });
});

describe('download task fixtures', () => {
  it('emits pending immediately and completes normal downloads', async () => {
    const module = await load();
    const emit = vi.fn();
    const created = module.e2eAddDownloadTasks(
      [job('https://x/video#normal'), job('https://x/song')],
      emit
    );

    expect(created).toHaveLength(2);
    expect(created[0].id).toMatch(/^e2e-task-/);
    expect(created[1].id).not.toBe(created[0].id);
    const firstId = created[0].id;
    expect(created[0]).toMatchObject({ status: 'pending', progress: 0, speed: '—', eta: '—' });
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit.mock.calls[0][0]).toMatchObject({ status: 'pending' });

    await vi.advanceTimersByTimeAsync(150);
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: firstId, status: 'downloading', progress: 50 })
    );

    await vi.advanceTimersByTimeAsync(350);
    const completed = emit.mock.calls.at(-1)![0];
    expect(completed).toMatchObject({
      id: firstId,
      status: 'completed',
      progress: 100,
      speed: '',
      eta: ''
    });
    expect(completed.outputPath).toMatch(/e2e-output\.m4a$/);
    expect(completed.completedAt).toEqual(expect.any(Number));
  });

  it('uses mp4 output for video and staggered timers for later jobs', async () => {
    const module = await load();
    const emit = vi.fn();
    const added = module.e2eAddDownloadTasks(
      [job('https://x/a', 'First'), job('https://x/b', 'Second', 'video')],
      emit
    );
    const secondId = added[1].id;

    await vi.advanceTimersByTimeAsync(200);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ id: secondId, status: 'downloading', progress: 50 })
    );

    await vi.advanceTimersByTimeAsync(350);
    expect(module.e2eListDownloadTasks().find((task) => task.id === secondId)).toMatchObject({
      status: 'completed',
      outputPath: expect.stringMatching(/e2e-output\.mp4$/)
    });
  });

  it('pins #downloading at 40 percent and #hold at pending', async () => {
    const module = await load();
    const emit = vi.fn();
    const added = module.e2eAddDownloadTasks(
      [job('https://x/a#downloading'), job('https://x/b#hold')],
      emit
    );
    const downId = added[0].id;
    const holdId = added[1].id;

    await vi.advanceTimersByTimeAsync(150);
    const downloading = module.e2eListDownloadTasks().find((task) => task.id === downId)!;
    expect(downloading).toMatchObject({ status: 'downloading', progress: 40, speed: '1.0 MiB/s' });

    await vi.advanceTimersByTimeAsync(2000);
    expect(module.e2eListDownloadTasks().find((task) => task.id === downId)).toMatchObject({
      status: 'downloading',
      progress: 40
    });
    expect(module.e2eListDownloadTasks().find((task) => task.id === holdId)).toMatchObject({
      status: 'pending',
      progress: 0
    });
  });

  it('keeps ids increasing and returns copies from list', async () => {
    const module = await load();
    const first = module.e2eAddDownloadTasks([job('https://x/a#hold')], vi.fn());
    const second = module.e2eAddDownloadTasks([job('https://x/b#hold')], vi.fn());
    expect(second[0].id).not.toBe(first[0].id);

    const listed = module.e2eListDownloadTasks();
    listed[0].title = 'Mutated';
    expect(module.e2eListDownloadTasks()[0].title).not.toBe('Mutated');
  });
});

describe('task controls', () => {
  it('pauses active tasks and clears their timers', async () => {
    const module = await load();
    const emit = vi.fn();
    const created = module.e2eAddDownloadTasks([job('https://x/a')], emit);
    const id = created[0].id;

    expect(module.e2ePauseDownloadTask('missing')).toBe(false);
    expect(module.e2ePauseDownloadTask(id)).toBe(true);
    expect(module.e2eListDownloadTasks()[0].status).toBe('paused');
    expect(module.e2ePauseDownloadTask(id)).toBe(false);

    const emits = emit.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(emit.mock.calls.length).toBe(emits);
  });

  it('cancels active and paused tasks but not finished ones', async () => {
    const module = await load();
    const firstBatch = module.e2eAddDownloadTasks(
      [job('https://x/a'), job('https://x/b')],
      vi.fn()
    );

    await vi.advanceTimersByTimeAsync(600);
    expect(module.e2eCancelDownloadTask(firstBatch[0].id)).toBe(false);

    const secondBatch = module.e2eAddDownloadTasks(
      [job('https://x/c#hold'), job('https://x/d#hold')],
      vi.fn()
    );
    expect(module.e2eCancelDownloadTask(secondBatch[0].id)).toBe(true);
    expect(module.e2ePauseDownloadTask(secondBatch[1].id)).toBe(true);
    expect(module.e2eCancelDownloadTask(secondBatch[1].id)).toBe(true);
    expect(module.e2eCancelDownloadTask('missing')).toBe(false);
  });

  it('resumes only paused tasks and clears their error', async () => {
    const module = await load();
    const created = module.e2eAddDownloadTasks([job('https://x/a#hold')], vi.fn());
    const id = created[0].id;
    expect(module.e2eResumeDownloadTask(id)).toBe(false);
    expect(module.e2eResumeDownloadTask('missing')).toBe(false);

    module.e2ePauseDownloadTask(id);
    expect(module.e2eResumeDownloadTask(id)).toBe(true);
    expect(module.e2eListDownloadTasks()[0]).toMatchObject({
      status: 'pending',
      error: undefined
    });
  });

  it('clears finished tasks and keeps active ones', async () => {
    const module = await load();
    const created = module.e2eAddDownloadTasks(
      [job('https://x/a'), job('https://x/b#hold')],
      vi.fn()
    );
    await vi.advanceTimersByTimeAsync(600);
    expect(module.e2eClearFinishedDownloadTasks()).toBe(true);

    const remaining = module.e2eListDownloadTasks();
    expect(remaining.some((task) => task.id === created[0].id)).toBe(false);
    expect(remaining.find((task) => task.id === created[1].id)).toMatchObject({
      status: 'pending'
    });
    expect(module.e2eClearFinishedDownloadTasks()).toBe(false);
  });
});
