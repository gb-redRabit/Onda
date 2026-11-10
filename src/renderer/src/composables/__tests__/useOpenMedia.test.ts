import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  player: {
    clearQueue: vi.fn(),
    setTrack: vi.fn(),
    enrichTrack: vi.fn(),
    pendingQueue: [] as unknown[],
    seek: vi.fn(),
    showResumePrompt: vi.fn()
  },
  ui: { notify: vi.fn() },
  build: vi.fn((options: { path: string }) => {
    const ext = options.path.split('.').pop() ?? '';
    const type = ext === 'mp3' || ext === 'flac' ? 'audio' : ext === 'mp4' ? 'video' : 'other';
    return { path: options.path, name: options.path, type };
  }),
  toUrl: vi.fn((path: string) => `media://${path}`),
  t: vi.fn((key: string, params?: unknown) => (params ? `${key}:${JSON.stringify(params)}` : key)),
  loggerInfo: vi.fn(),
  grant: vi.fn(),
  position: vi.fn(),
  RESUME: 30
}));

vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => h.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => h.ui }));
vi.mock('@renderer/utils/explorerMedia', () => ({ buildMediaFile: h.build }));
vi.mock('@renderer/utils/mediaUrl', () => ({ toMediaServerUrl: h.toUrl }));
vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: h.t } } }));
vi.mock('@shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));
vi.mock('@shared/constants', () => ({ RESUME_MIN_SECONDS: h.RESUME }));

async function load() {
  vi.resetModules();
  return import('../useOpenMedia');
}

function router() {
  return { push: vi.fn() } as never;
}

function api() {
  return { grantMediaAccess: h.grant, getPlaybackPosition: h.position };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  h.player.clearQueue.mockReset();
  h.player.setTrack.mockReset();
  h.player.enrichTrack.mockReset();
  h.player.pendingQueue = [];
  h.player.seek.mockReset();
  h.player.showResumePrompt.mockReset();
  h.ui.notify.mockReset();
  h.build.mockClear();
  h.toUrl.mockClear();
  h.t.mockClear();
  h.loggerInfo.mockReset();
  h.grant.mockReset();
  h.grant.mockResolvedValue(undefined);
  h.position.mockReset();
  h.position.mockResolvedValue(0);
  (window as unknown as { api?: unknown }).api = api();
});

describe('path handling', () => {
  it('ignores an empty selection', async () => {
    const { openMediaFiles } = await load();
    await openMediaFiles([], router());

    expect(h.build).not.toHaveBeenCalled();
    expect(h.ui.notify).not.toHaveBeenCalled();
  });

  it('warns when nothing is playable', async () => {
    const { openMediaFiles } = await load();
    await openMediaFiles(['D:/docs/a.txt', 'D:/pics/a.png'], router());

    expect(h.ui.notify).toHaveBeenCalledWith('warning', 'openMedia.unsupported');
    expect(h.grant).not.toHaveBeenCalled();
    expect(h.player.setTrack).not.toHaveBeenCalled();
  });

  it('queues only audio for mixed selections', async () => {
    const push = vi.fn();
    const { openMediaFiles } = await load();
    await openMediaFiles(['D:/a.mp3', 'D:/b.mp4', 'D:/c.flac'], { push } as never);

    expect(h.ui.notify).toHaveBeenCalledWith('info', 'openMedia.videosSkipped:{"n":1}');
    expect(h.grant.mock.calls.map(([path]) => path)).toEqual(['D:/a.mp3', 'D:/c.flac']);
    expect(h.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ path: 'D:/a.mp3' }));
    expect(h.player.pendingQueue).toEqual([expect.objectContaining({ path: 'D:/c.flac' })]);
    expect(push).toHaveBeenCalledWith('/audio');
    expect(h.toUrl).toHaveBeenCalledWith('D:/a.mp3');
  });

  it('routes video selections to the player', async () => {
    const push = vi.fn();
    const { openMediaFiles } = await load();
    await openMediaFiles(['D:/a.mp4'], { push } as never);

    expect(h.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ path: 'D:/a.mp4' }));
    expect(h.player.pendingQueue).toEqual([]);
    expect(push).toHaveBeenCalledWith('/player');
  });

  it('works without a preload bridge', async () => {
    delete (window as unknown as { api?: unknown }).api;
    const { openMediaFiles } = await load();
    await openMediaFiles(['D:/a.mp3'], router());

    expect(h.player.setTrack).toHaveBeenCalled();
    expect(h.player.showResumePrompt).not.toHaveBeenCalled();
  });
});

describe('resume positions', () => {
  it('prompts to resume above the threshold', async () => {
    h.position.mockResolvedValue(h.RESUME + 1);
    const { openMediaFiles } = await load();
    await openMediaFiles(['D:/a.mp3'], router());

    expect(h.position).toHaveBeenCalledWith('D:/a.mp3');
    expect(h.player.seek).toHaveBeenCalledWith(0);
    expect(h.player.showResumePrompt).toHaveBeenCalledWith('D:/a.mp3', h.RESUME + 1);
  });

  it('skips the prompt at or below the threshold', async () => {
    h.position.mockResolvedValue(h.RESUME);
    const { openMediaFiles } = await load();
    await openMediaFiles(['D:/a.mp3'], router());

    expect(h.player.showResumePrompt).not.toHaveBeenCalled();
  });

  it('treats a rejected position lookup as zero', async () => {
    h.position.mockRejectedValue(new Error('db'));
    const { openMediaFiles } = await load();

    await expect(openMediaFiles(['D:/a.mp3'], router())).resolves.toBeUndefined();
    expect(h.player.showResumePrompt).not.toHaveBeenCalled();
  });
});

describe('stale calls', () => {
  it('drops a slower open that was superseded', async () => {
    let releaseFirst!: () => void;
    h.grant.mockImplementation((path: string) =>
      path === 'D:/a.mp3'
        ? new Promise<void>((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve()
    );
    const push = vi.fn();
    const { openMediaFiles } = await load();

    const first = openMediaFiles(['D:/a.mp3'], { push } as never);
    await flush();
    const second = openMediaFiles(['D:/b.mp3'], { push } as never);
    await second;
    releaseFirst();
    await first;

    expect(h.player.setTrack).toHaveBeenCalledTimes(1);
    expect(h.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ path: 'D:/b.mp3' }));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('drops a superseded open while awaiting the resume position', async () => {
    let releaseFirst!: (value: number) => void;
    h.position.mockImplementation((path: string) =>
      path === 'D:/a.mp3'
        ? new Promise<number>((resolve) => {
            releaseFirst = resolve;
          })
        : Promise.resolve(0)
    );
    const push = vi.fn();
    const { openMediaFiles } = await load();

    const first = openMediaFiles(['D:/a.mp3'], { push } as never);
    await flush();
    const second = openMediaFiles(['D:/b.mp3'], { push } as never);
    await second;
    releaseFirst(90);
    await first;

    expect(h.player.showResumePrompt).toHaveBeenCalledWith('D:/a.mp3', 90);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/audio');
  });
});
