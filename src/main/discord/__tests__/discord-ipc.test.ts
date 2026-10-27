import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  connectDiscord,
  decodeFrames,
  discordIpcCandidates,
  encodeFrame,
  type DiscordFrame
} from '../discord-ipc';

describe('frame encoding', () => {
  it('round-trips frames and keeps a partial frame in the rest buffer', () => {
    const frame = encodeFrame(1, { cmd: 'SET_ACTIVITY' });
    const { frames, rest } = decodeFrames(Buffer.concat([frame, frame.subarray(0, 4)]));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ op: 1, data: { cmd: 'SET_ACTIVITY' } });
    expect(rest).toHaveLength(4);
  });

  it('honours the ONDA_DISCORD_IPC_PATH override', () => {
    process.env.ONDA_DISCORD_IPC_PATH = 'custom-path';
    expect(discordIpcCandidates()).toEqual(['custom-path']);
    delete process.env.ONDA_DISCORD_IPC_PATH;
  });
});

describe('discord ipc connection', () => {
  let dir = '';
  let pipePath = '';
  let server: Server;
  let clientSocket: Socket | null = null;
  let buffer: Buffer = Buffer.alloc(0);
  let received: DiscordFrame[] = [];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'onda-discord-'));
    pipePath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\onda-discord-test-${process.pid}-${Date.now()}`
        : join(dir, 'discord.sock');
    received = [];
    buffer = Buffer.alloc(0);
    server = createServer((socket) => {
      clientSocket = socket;
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        const parsed = decodeFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) {
          received.push(frame);
          if (frame.op === 0) {
            socket.write(encodeFrame(1, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1 } }));
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(pipePath, () => resolve()));
    process.env.ONDA_DISCORD_IPC_PATH = pipePath;
  });

  afterEach(async () => {
    delete process.env.ONDA_DISCORD_IPC_PATH;
    clientSocket?.destroy();
    clientSocket = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (process.platform !== 'win32') {
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  it('handshakes and sends SET_ACTIVITY', async () => {
    const connection = await connectDiscord('123456789012345678');
    connection.setActivity({ details: 'Song', type: 2 });

    await expect
      .poll(
        () =>
          received.some(
            (frame) => frame.op === 1 && (frame.data as { cmd?: string }).cmd === 'SET_ACTIVITY'
          ),
        { timeout: 3000 }
      )
      .toBe(true);

    const handshake = received.find((frame) => frame.op === 0);
    expect(handshake?.data).toMatchObject({ v: 1, client_id: '123456789012345678' });
    const activity = received.find(
      (frame) => frame.op === 1 && (frame.data as { cmd?: string }).cmd === 'SET_ACTIVITY'
    );
    expect((activity?.data as { args?: { activity?: unknown } }).args?.activity).toMatchObject({
      details: 'Song'
    });
    connection.close();
  });
});
