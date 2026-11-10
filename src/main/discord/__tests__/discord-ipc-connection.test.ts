import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DiscordConnection,
  connectDiscord,
  decodeFrames,
  discordIpcCandidates,
  encodeFrame,
  type DiscordFrame
} from '../discord-ipc';

class FakeSocket extends EventEmitter {
  written: Buffer[] = [];
  destroy = vi.fn(() => {
    this.destroyed = true;
  });
  setTimeout = vi.fn();
  destroyed = false;
  write = vi.fn((chunk: Buffer) => {
    this.written.push(chunk);
    return true;
  });
}

function fake(): FakeSocket {
  return new FakeSocket();
}

function connect(socket: FakeSocket): DiscordConnection {
  const connection = new DiscordConnection(socket as unknown as Socket);
  // Zamknięcie odrzuca `ready`; w testach, które nie sprawdzają tego odrzucenia,
  // musi być ono obsłużone, inaczej Vitest zgłasza błąd po zakończeniu testu.
  void connection.ready.catch(() => {});
  return connection;
}

function writtenFrames(socket: FakeSocket): DiscordFrame[] {
  const decoded = decodeFrames(Buffer.concat(socket.written));
  return decoded.frames;
}

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const originalEnv = {
  ONDA_DISCORD_IPC_PATH: process.env.ONDA_DISCORD_IPC_PATH,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  TMPDIR: process.env.TMPDIR
};

function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { configurable: true, value });
}

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform);
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('frame decoding', () => {
  it('keeps a short header in the rest buffer', () => {
    const short = Buffer.from([1, 0, 0, 0]);
    const decoded = decodeFrames(short);
    expect(decoded.frames).toEqual([]);
    expect(decoded.rest).toEqual(short);
    expect(decoded.corrupted).toBeUndefined();
  });

  it('decodes multiple frames at once', () => {
    const buffer = Buffer.concat([encodeFrame(1, { a: 1 }), encodeFrame(3, { b: 2 })]);
    const decoded = decodeFrames(buffer);
    expect(decoded.frames).toEqual([
      { op: 1, data: { a: 1 } },
      { op: 3, data: { b: 2 } }
    ]);
    expect(decoded.rest).toHaveLength(0);
  });

  it('maps invalid JSON to a null payload', () => {
    const body = Buffer.from('not-json', 'utf-8');
    const frame = Buffer.alloc(8 + body.length);
    frame.writeUInt32LE(1, 0);
    frame.writeUInt32LE(body.length, 4);
    body.copy(frame, 8);

    expect(decodeFrames(frame).frames).toEqual([{ op: 1, data: null }]);
  });

  it('stops at a header whose body has not fully arrived', () => {
    const frame = encodeFrame(1, { hello: 'world' });
    const partial = frame.subarray(0, frame.length - 2);

    const decoded = decodeFrames(Buffer.concat([frame, partial]));

    expect(decoded.frames).toEqual([{ op: 1, data: { hello: 'world' } }]);
    expect(decoded.rest).toEqual(partial);
  });
});

describe('ipc candidates', () => {
  beforeEach(() => {
    delete process.env.ONDA_DISCORD_IPC_PATH;
  });

  it('lists both Windows pipe prefixes', () => {
    setPlatform('win32');
    const candidates = discordIpcCandidates();

    expect(candidates).toHaveLength(20);
    expect(candidates[0]).toBe('\\\\?\\pipe\\discord-ipc-0');
    expect(candidates[1]).toBe('\\\\.\\pipe\\discord-ipc-0');
    expect(candidates.at(-1)).toBe('\\\\.\\pipe\\discord-ipc-9');
  });

  it('builds Unix socket paths from the runtime directories', () => {
    setPlatform('linux');
    process.env.XDG_RUNTIME_DIR = '/xdg';
    process.env.TMPDIR = '/tmpdir-env';

    const candidates = discordIpcCandidates();

    expect(candidates).toContain(join('/xdg', 'discord-ipc-0'));
    expect(candidates).toContain(join('/tmpdir-env', 'discord-ipc-9'));
    expect(candidates).toContain(join('/tmp', 'discord-ipc-0'));
  });

  it('deduplicates identical runtime directories', () => {
    setPlatform('linux');
    process.env.XDG_RUNTIME_DIR = '/tmp';
    process.env.TMPDIR = '/tmp';

    const candidates = discordIpcCandidates();
    const indexPaths = candidates.filter((path) => path === join('/tmp', 'discord-ipc-0'));

    expect(indexPaths).toHaveLength(1);
  });
});

describe('connection lifecycle', () => {
  it('resolves ready after a READY frame split across chunks', async () => {
    const socket = fake();
    const connection = connect(socket);
    const ready = connection.ready;
    const frame = encodeFrame(1, { evt: 'READY' });

    socket.emit('data', frame.subarray(0, 5));
    socket.emit('data', frame.subarray(5));

    await expect(ready).resolves.toBeUndefined();
  });

  it('answers pings with pongs', () => {
    const socket = fake();
    connect(socket);
    socket.emit('data', encodeFrame(3, { nonce: 1 }));

    expect(writtenFrames(socket)).toEqual([{ op: 4, data: { nonce: 1 } }]);
  });

  it('closes on a close frame and reports it once', async () => {
    const socket = fake();
    const connection = connect(socket);
    const onClose = vi.fn();
    connection.onClose = onClose;

    socket.emit('data', encodeFrame(2, {}));
    socket.emit('close');

    expect(onClose).toHaveBeenCalledTimes(1);
    await expect(connection.ready).rejects.toThrow('Discord IPC closed');
  });

  it('destroys the socket on an oversized frame', () => {
    const socket = fake();
    const connection = connect(socket);
    const onClose = vi.fn();
    connection.onClose = onClose;

    const header = Buffer.alloc(8);
    header.writeUInt32LE(1, 0);
    header.writeUInt32LE(1024 * 1024 + 1, 4);
    socket.emit('data', header);

    expect(socket.destroy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('forwards socket errors and closes', () => {
    const socket = fake();
    const connection = connect(socket);
    const onError = vi.fn();
    const onClose = vi.fn();
    connection.onError = onError;
    connection.onClose = onClose;
    const error = new Error('pipe broke');

    socket.emit('error', error);

    expect(onError).toHaveBeenCalledWith(error);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops writing once closed', () => {
    const socket = fake();
    const connection = connect(socket);
    connection.close();
    const afterClose = socket.written.length;

    connection.write(1, { ignored: true });

    expect(socket.written).toHaveLength(afterClose);
    expect(writtenFrames(socket).at(-1)).toEqual({ op: 2, data: {} });
  });

  it('closes when the socket rejects a write', () => {
    const socket = fake();
    const connection = connect(socket);
    const onClose = vi.fn();
    connection.onClose = onClose;
    socket.write.mockImplementationOnce(() => {
      throw new Error('gone');
    });

    connection.write(1, { x: 1 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends activity payloads and clears them', () => {
    const socket = fake();
    const connection = connect(socket);

    connection.setActivity({ details: 'Song', type: 2 });
    connection.clearActivity();

    const frames = writtenFrames(socket);
    expect(frames[0].op).toBe(1);
    expect(frames[0].data).toMatchObject({
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: { details: 'Song', type: 2 } }
    });
    expect((frames[0].data as { nonce: string }).nonce).toEqual(expect.any(String));
    expect(frames[1].data).toMatchObject({ cmd: 'SET_ACTIVITY', args: { pid: process.pid } });
  });

  it('tolerates a socket that already failed to destroy', () => {
    const socket = fake();
    const connection = connect(socket);
    socket.destroy.mockImplementationOnce(() => {
      throw new Error('already closed');
    });

    expect(() => connection.close()).not.toThrow();
    expect(() => connection.close()).not.toThrow();
    expect(socket.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('connectDiscord failures', () => {
  let dir = '';
  let server: Server | null = null;
  let sockets: Socket[] = [];

  function setPipe(path: string): void {
    process.env.ONDA_DISCORD_IPC_PATH = path;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onda-discord-unit-'));
  });

  afterEach(async () => {
    delete process.env.ONDA_DISCORD_IPC_PATH;
    for (const socket of sockets) socket.destroy();
    sockets = [];
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });

  it('rejects when no candidate accepts the connection', async () => {
    setPipe(
      process.platform === 'win32' ? '\\\\.\\pipe\\onda-missing-pipe' : join(dir, 'gone.sock')
    );

    await expect(connectDiscord('1', 200)).rejects.toThrow('Discord IPC not found');
  });

  it('times out when the handshake never completes', async () => {
    const path =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\onda-silent-${process.pid}`
        : join(dir, 'silent.sock');
    server = createServer((socket) => {
      sockets.push(socket);
    });
    await new Promise<void>((resolve) => server!.listen(path, () => resolve()));
    setPipe(path);

    await expect(connectDiscord('1', 60)).rejects.toThrow('Discord IPC not found');
  });

  it('moves on when the connection closes before READY', async () => {
    const path =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\onda-close-${process.pid}`
        : join(dir, 'close.sock');
    server = createServer((socket) => {
      sockets.push(socket);
      socket.destroy();
    });
    await new Promise<void>((resolve) => server!.listen(path, () => resolve()));
    setPipe(path);

    await expect(connectDiscord('1', 500)).rejects.toThrow('Discord IPC not found');
  });
});
