import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handler: null as ((req: any, res: any) => Promise<void>) | null,
  errorListener: null as ((err: Error) => void) | null,
  address: { port: 4321 } as { port: number } | null,
  pipelineCallback: null as ((err?: unknown) => void) | null,
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  getMimeType: vi.fn((_path: string): string => 'video/mp4'),
  isServableMediaPath: vi.fn((_path: string) => true),
  isProtectedPath: vi.fn((path: string) => path.includes('protected')),
  isAllowedExternalMediaRoot: vi.fn((path: string) => !path.includes('sensitive')),
  handleStreamProxy: vi.fn(async () => undefined),
  handleProviderStreamProxy: vi.fn(async () => undefined),
  createReadStream: vi.fn(() => ({}) as never),
  realpath: vi.fn(async (path: string) => path),
  stat: vi.fn(async (_path: string) => ({ size: 10 })),
  autoListen: true
}));

vi.mock('http', () => ({
  default: {
    createServer: (handler: (req: any, res: any) => Promise<void>) => {
      state.handler = handler;
      return {
        on: (event: string, listener: (err: Error) => void) => {
          if (event === 'error') state.errorListener = listener;
        },
        listen: (_port: number, _host: string, callback: () => void) => {
          if (state.autoListen) callback();
        },
        address: () => state.address,
        close: vi.fn()
      };
    }
  }
}));
vi.mock('fs', () => ({
  default: {
    promises: {
      realpath: state.realpath,
      stat: state.stat
    },
    createReadStream: state.createReadStream
  }
}));
vi.mock('stream', () => ({
  pipeline: (_stream: unknown, _res: unknown, callback: (err?: unknown) => void) => {
    state.pipelineCallback = callback;
  }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, error: state.loggerError }
}));
vi.mock('../../../shared/mime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/mime')>();
  return { ...actual, getMimeType: (path: string) => state.getMimeType(path) };
});
vi.mock('../media-server-stream', () => ({
  handleStreamProxy: state.handleStreamProxy,
  handleProviderStreamProxy: state.handleProviderStreamProxy
}));
vi.mock('../media-paths', () => ({
  isServableMediaPath: (path: string) => state.isServableMediaPath(path)
}));
vi.mock('../../path-policy', () => ({
  isProtectedPath: (path: string) => state.isProtectedPath(path),
  isAllowedExternalMediaRoot: (path: string) => state.isAllowedExternalMediaRoot(path)
}));

import {
  addAllowedRoot,
  createMediaServer,
  getExtraRoots,
  isPathWithinAllowedRoots,
  serveFileRange,
  setAllowedRoots,
  setRootsChangedHandler
} from '../media-server';

const MEDIA_ROOT = process.platform === 'win32' ? 'C:\\media' : '/media';
const OUTSIDE_ROOT = process.platform === 'win32' ? 'C:\\outside' : '/outside';

function makeRes() {
  const res: any = {
    headersSent: false,
    statusCode: 0,
    writeHead: vi.fn((status: number) => {
      res.statusCode = status;
      res.headersSent = true;
    }),
    setHeader: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn()
  };
  return res;
}

function makeReq(url: string, method = 'GET', headers: Record<string, string> = {}) {
  return { url, method, headers };
}

async function invoke(
  token: string,
  url: string,
  method = 'GET',
  headers: Record<string, string> = {}
) {
  const res = makeRes();
  await state.handler!(makeReq(`/${token}${url}`, method, headers), res);
  return res;
}

beforeEach(async () => {
  state.handler = null;
  state.errorListener = null;
  state.address = { port: 4321 };
  state.autoListen = true;
  state.pipelineCallback = null;
  state.loggerWarn.mockReset();
  state.loggerError.mockReset();
  state.getMimeType.mockReset();
  state.getMimeType.mockReturnValue('video/mp4');
  state.isServableMediaPath.mockReset();
  state.isServableMediaPath.mockReturnValue(true);
  state.isProtectedPath.mockImplementation((path: string) => path.includes('protected'));
  state.isAllowedExternalMediaRoot.mockImplementation(
    (path: string) => !path.includes('sensitive')
  );
  state.handleStreamProxy.mockReset();
  state.handleProviderStreamProxy.mockReset();
  state.createReadStream.mockReset();
  state.createReadStream.mockReturnValue({} as never);
  state.realpath.mockReset();
  state.realpath.mockImplementation(async (path: string) => path);
  state.stat.mockReset();
  state.stat.mockResolvedValue({ size: 10 });
  setRootsChangedHandler(null);
  await setAllowedRoots([]);
});

afterEach(() => {
  setRootsChangedHandler(null);
});

describe('allowed roots', () => {
  it('notifies the handler and skips empty library roots', async () => {
    const changed = vi.fn();
    setRootsChangedHandler(changed);

    await setAllowedRoots(['', 'C:/library']);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(isPathWithinAllowedRoots('C:/library/song.mp3')).toBe(true);
    expect(isPathWithinAllowedRoots('D:/other/song.mp3')).toBe(false);
  });

  it('honours the handler for granted roots', async () => {
    const changed = vi.fn();
    setRootsChangedHandler(changed);

    expect(await addAllowedRoot('C:/granted')).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('rejects empty roots, accepts duplicates and enforces the cap', async () => {
    expect(await addAllowedRoot('')).toBe(false);

    expect(await addAllowedRoot('C:/dup')).toBe(true);
    expect(await addAllowedRoot('C:/dup')).toBe(true);
    expect(getExtraRoots().filter((root) => root === 'C:/dup')).toHaveLength(1);

    let fill = 0;
    while (await addAllowedRoot(`C:/fill-${fill}`)) {
      fill += 1;
      if (fill > 300) break;
    }

    expect(getExtraRoots()).toHaveLength(200);
    expect(await addAllowedRoot('C:/one-too-many')).toBe(false);
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media',
      expect.stringContaining('limit of 200 reached')
    );
  });
});

describe('serveFileRange', () => {
  it('logs stream errors other than premature close', () => {
    serveFileRange(makeRes(), '/media/a.mp4', 0, 10, 'range');
    state.pipelineCallback!(new Error('disk failure'));

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'media-server',
      expect.stringContaining('disk failure')
    );
  });

  it('ignores premature closes and clean completions', () => {
    serveFileRange(makeRes(), '/media/a.mp4', null, null, 'full');
    const premature = Object.assign(new Error('closed'), { code: 'ERR_STREAM_PREMATURE_CLOSE' });
    state.pipelineCallback!(premature);
    state.pipelineCallback!(undefined);

    expect(state.loggerWarn).not.toHaveBeenCalled();
  });
});

describe('createMediaServer', () => {
  it('proxies provider streams before local paths', async () => {
    const server = await createMediaServer();

    await invoke(server.token, '/stream?provider=abc');
    expect(state.handleProviderStreamProxy).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET' }),
      expect.any(Object),
      'abc'
    );

    await invoke(server.token, '/stream?url=https%3A%2F%2Fexample.com');
    expect(state.handleStreamProxy).toHaveBeenCalled();
  });

  it('rejects HEAD requests without a path and for invalid paths', async () => {
    const server = await createMediaServer();

    const missing = await invoke(server.token, '/', 'HEAD');
    expect(missing.statusCode).toBe(400);
    expect(missing.end).toHaveBeenCalledWith('invalid path');

    const relative = await invoke(server.token, '/?path=relative%2Ffile.mp4', 'HEAD');
    expect(relative.statusCode).toBe(400);

    const forbidden = await invoke(
      server.token,
      `/?path=${encodeURIComponent(join(OUTSIDE_ROOT, 'file.txt'))}`,
      'HEAD'
    );
    expect(forbidden.statusCode).toBe(403);
  });

  it('falls back to default URL parts when headers are missing', async () => {
    const server = await createMediaServer();
    const res = makeRes();

    await state.handler!({ url: undefined, method: 'GET', headers: {} }, res);

    expect(res.statusCode).toBe(403);
    expect(server.token).toBeTruthy();
  });

  it('destroys the response when headers were already sent', async () => {
    await setAllowedRoots([MEDIA_ROOT]);
    const server = await createMediaServer();
    state.createReadStream.mockImplementationOnce(() => {
      throw new Error('stream failure');
    });

    const res = await invoke(
      server.token,
      `/?path=${encodeURIComponent(join(MEDIA_ROOT, 'a.mp4'))}`
    );

    expect(res.destroy).toHaveBeenCalled();
    expect(state.loggerError).toHaveBeenCalledWith(
      'media-server',
      expect.stringContaining('request failed'),
      'stream failure'
    );
  });

  it('falls back to an empty error message', async () => {
    await setAllowedRoots([MEDIA_ROOT]);
    const server = await createMediaServer();
    state.getMimeType.mockImplementationOnce(() => {
      throw 'plain failure';
    });

    await invoke(server.token, `/?path=${encodeURIComponent(join(MEDIA_ROOT, 'a.mp4'))}`);

    expect(state.loggerError).toHaveBeenCalledWith(
      'media-server',
      expect.stringContaining('request failed'),
      ''
    );
  });

  it('evicts old stat and path resolution cache entries', async () => {
    const cacheRoot = process.platform === 'win32' ? 'C:\\cache' : '/cache';
    await setAllowedRoots([cacheRoot]);
    const server = await createMediaServer();

    for (let i = 0; i < 520; i += 1) {
      const file = join(cacheRoot, `file-${i}.mp4`);
      const res = await invoke(server.token, `/?path=${encodeURIComponent(file)}`, 'HEAD');
      expect(res.statusCode).toBe(200);
    }

    expect(state.stat).toHaveBeenCalledTimes(520);
    expect(state.realpath).toHaveBeenCalledTimes(521);
  });

  it('uses port zero when the address is unavailable', async () => {
    state.address = null;
    const server = await createMediaServer();
    expect(server.port).toBe(0);
  });

  it('rejects when the server emits an error', async () => {
    state.autoListen = false;
    const pending = createMediaServer();
    state.errorListener!(new Error('listen failure'));

    await expect(pending).rejects.toThrow('listen failure');
    expect(state.loggerError).toHaveBeenCalledWith(
      'media-server',
      'server error',
      'listen failure'
    );
  });
});
