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
    channelId: 'e2e-channel',
    duration: '1:00',
    viewCount: '1234',
    publishedAt: '2026-01-01T00:00:00.000Z'
  }));
}

type Emit = (task: IpcDownloadTask) => void;

let tasks: IpcDownloadTask[] = [];

// Mirrors the real queue lifecycle (pending → downloading → completed) so the
// renderer's progress broadcasts and status rendering are exercised end to end.
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
    return task;
  });

  created.forEach((task, index) => {
    setTimeout(
      () => {
        task.status = 'downloading';
        task.progress = 50;
        task.speed = '1.0 MiB/s';
        emit({ ...task });
      },
      150 + index * 50
    );
    setTimeout(
      () => {
        task.status = 'completed';
        task.progress = 100;
        task.speed = '';
        task.completedAt = Date.now();
        task.outputPath = `${task.outputDir}/e2e-output.${task.kind === 'audio' ? 'm4a' : 'mp4'}`;
        emit({ ...task });
      },
      500 + index * 50
    );
  });

  return created.map((task) => ({ ...task }));
}

export function e2eListDownloadTasks(): IpcDownloadTask[] {
  return tasks.map((task) => ({ ...task }));
}

export function e2eClearFinishedDownloadTasks(): boolean {
  tasks = tasks.filter((task) => task.status !== 'completed');
  return true;
}
