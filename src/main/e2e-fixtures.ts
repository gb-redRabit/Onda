import type { IpcDownloadJobInput, IpcDownloadTask, IpcYoutubeVideo } from '../shared/types/ipc';

// Env-gated fixtures for the Playwright suite (plan 2.2). Inactive unless the
// test launcher sets ONDA_E2E_FIXTURES=1, so packaged builds never see them.

export function e2eFixturesEnabled(): boolean {
  return process.env.ONDA_E2E_FIXTURES === '1';
}

export function e2eSearchItems(query: string): IpcYoutubeVideo[] {
  return [1, 2, 3].map((n) => ({
    id: `e2e-${n}`,
    title: `E2E Result ${n}`,
    description: `Fixture result for "${query}"`,
    thumbnail: '',
    channelTitle: 'E2E Channel',
    channelId: 'UCabcdefghijABCDEFGHIJ1234',
    duration: '1:00',
    viewCount: '1234',
    publishedAt: '2026-01-01T00:00:00.000Z'
  }));
}

type Emit = (task: IpcDownloadTask) => void;

const ACTIVE_STATUSES = new Set(['pending', 'downloading', 'paused']);

let tasks: IpcDownloadTask[] = [];
const taskTimers = new Map<string, Array<ReturnType<typeof setTimeout>>>();

function clearTaskTimers(id: string): void {
  const pending = taskTimers.get(id);
  if (!pending) return;
  for (const timer of pending) clearTimeout(timer);
  taskTimers.delete(id);
}

function schedule(id: string, ms: number, fn: () => void): void {
  const pending = taskTimers.get(id) ?? [];
  pending.push(setTimeout(fn, ms));
  taskTimers.set(id, pending);
}

function findTask(id: string): IpcDownloadTask | undefined {
  return tasks.find((task) => task.id === id);
}

function isFinished(task: IpcDownloadTask): boolean {
  return task.status === 'completed' || task.status === 'error' || task.status === 'cancelled';
}

// URL markers let a test pick a deterministic lifecycle instead of racing the
// real timers: `#hold` stays pending (queued), `#downloading` stays active at
// 40 %, anything else mirrors pending → downloading → completed so the
// renderer's progress broadcasts and status rendering are exercised.
function behaviorOf(url: string): 'hold' | 'downloading' | 'normal' {
  if (url.includes('#hold')) return 'hold';
  if (url.includes('#downloading')) return 'downloading';
  return 'normal';
}

export function e2eAddDownloadTasks(jobs: IpcDownloadJobInput[], emit: Emit): IpcDownloadTask[] {
  const created = jobs.map((job, index) => {
    const task: IpcDownloadTask = {
      id: `e2e-task-${tasks.length + index + 1}`,
      url: job.url,
      title: job.title,
      thumbnail: job.thumbnail,
      kind: job.kind,
      format: job.format,
      quality: job.quality,
      outputDir: job.outputDir,
      filenameTemplate: job.filenameTemplate,
      progress: 0,
      speed: '—',
      eta: '—',
      status: 'pending',
      startedAt: Date.now(),
      coverStatus: 'none'
    };
    tasks.push(task);
    return { task, index };
  });

  for (const { task, index } of created) {
    // Broadcast the queued snapshot immediately: jobs that never progress
    // (e.g. `#hold`) would otherwise never reach the renderer store.
    emit({ ...task });

    const behavior = behaviorOf(task.url);
    if (behavior === 'hold') continue;

    schedule(task.id, 150 + index * 50, () => {
      task.status = 'downloading';
      task.progress = behavior === 'downloading' ? 40 : 50;
      task.speed = '1.0 MiB/s';
      task.eta = '0:05';
      emit({ ...task });
    });
    if (behavior === 'downloading') continue;

    schedule(task.id, 500 + index * 50, () => {
      task.status = 'completed';
      task.progress = 100;
      task.speed = '';
      task.eta = '';
      task.completedAt = Date.now();
      task.outputPath = `${task.outputDir}/e2e-output.${task.kind === 'audio' ? 'm4a' : 'mp4'}`;
      emit({ ...task });
    });
  }

  return created.map(({ task }) => ({ ...task }));
}

export function e2eListDownloadTasks(): IpcDownloadTask[] {
  return tasks.map((task) => ({ ...task }));
}

export function e2ePauseDownloadTask(id: string): boolean {
  const task = findTask(id);
  if (!task || !ACTIVE_STATUSES.has(task.status) || task.status === 'paused') return false;
  clearTaskTimers(id);
  task.status = 'paused';
  return true;
}

export function e2eResumeDownloadTask(id: string): boolean {
  const task = findTask(id);
  if (!task || task.status !== 'paused') return false;
  task.status = 'pending';
  task.error = undefined;
  return true;
}

export function e2eCancelDownloadTask(id: string): boolean {
  const task = findTask(id);
  if (!task || !ACTIVE_STATUSES.has(task.status)) return false;
  clearTaskTimers(id);
  task.status = 'cancelled';
  return true;
}

export function e2eClearFinishedDownloadTasks(): boolean {
  const kept: IpcDownloadTask[] = [];
  let removed = false;
  for (const task of tasks) {
    if (isFinished(task)) {
      clearTaskTimers(task.id);
      removed = true;
    } else {
      kept.push(task);
    }
  }
  tasks = kept;
  return removed;
}
