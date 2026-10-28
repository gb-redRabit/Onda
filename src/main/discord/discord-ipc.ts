import { connect, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;
const MAX_FRAME_BYTES = 1024 * 1024;

export interface DiscordFrame {
  op: number;
  data: unknown;
}

export function encodeFrame(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload ?? {}), 'utf-8');
  const frame = Buffer.alloc(8 + body.length);
  frame.writeUInt32LE(op, 0);
  frame.writeUInt32LE(body.length, 4);
  body.copy(frame, 8);
  return frame;
}

export function decodeFrames(buffer: Buffer): {
  frames: DiscordFrame[];
  rest: Buffer;
  corrupted?: boolean;
} {
  const frames: DiscordFrame[] = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const op = buffer.readUInt32LE(offset);
    const length = buffer.readUInt32LE(offset + 4);
    if (length > MAX_FRAME_BYTES) {
      // Nie konsumujemy ramki i nie pozwalamy `onData` doklejać kolejnych
      // chunków w nieskończoność. Wywołujący zamyka gniazdo.
      return { frames, rest: buffer.subarray(offset), corrupted: true };
    }
    if (buffer.length - offset - 8 < length) break;
    const json = buffer.subarray(offset + 8, offset + 8 + length).toString('utf-8');
    offset += 8 + length;
    try {
      frames.push({ op, data: JSON.parse(json) });
    } catch {
      frames.push({ op, data: null });
    }
  }
  return { frames, rest: buffer.subarray(offset) };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Lokalne gniazda Discord IPC. `ONDA_DISCORD_IPC_PATH` pozwala wskazać konkretne
 * gniazdo (testy / niestandardowe klienty). Discord trzyma gniazda `discord-ipc-0..9`.
 */
export function discordIpcCandidates(): string[] {
  const override = process.env.ONDA_DISCORD_IPC_PATH;
  if (override) return [override];
  const indices = Array.from({ length: 10 }, (_, index) => index);
  if (process.platform === 'win32') {
    return unique(
      indices.flatMap((index) => [
        `\\\\?\\pipe\\discord-ipc-${index}`,
        `\\\\.\\pipe\\discord-ipc-${index}`
      ])
    );
  }
  const bases = unique(
    [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, tmpdir(), '/tmp'].filter(
      (base): base is string => !!base
    )
  );
  return indices.flatMap((index) => bases.map((base) => join(base, `discord-ipc-${index}`)));
}

export class DiscordConnection {
  private buffer: Buffer = Buffer.alloc(0);
  private closed = false;
  private readonly readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;

  constructor(private readonly socket: Socket) {
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    socket.on('close', () => this.handleClose());
    socket.on('error', (error) => {
      this.onError?.(error);
      this.handleClose();
    });
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { frames, rest, corrupted } = decodeFrames(this.buffer);
    this.buffer = rest;
    if (corrupted) {
      this.socket.destroy();
      this.handleClose();
      return;
    }
    for (const frame of frames) {
      if (frame.op === OP_PING) {
        this.write(OP_PONG, frame.data);
        continue;
      }
      if (frame.op === OP_CLOSE) {
        this.handleClose();
        continue;
      }
      const data = frame.data as { evt?: string } | null;
      if (frame.op === OP_FRAME && data?.evt === 'READY') this.readyResolve();
    }
  }

  write(op: number, payload: unknown): void {
    if (this.closed) return;
    try {
      this.socket.write(encodeFrame(op, payload));
    } catch {
      this.handleClose();
    }
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyReject(new Error('Discord IPC closed'));
    this.onClose?.();
  }

  setActivity(activity: unknown): void {
    this.write(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: randomUUID()
    });
  }

  clearActivity(): void {
    this.write(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid },
      nonce: randomUUID()
    });
  }

  close(): void {
    if (this.closed) return;
    this.write(OP_CLOSE, {});
    this.closed = true;
    try {
      this.socket.destroy();
    } catch {
      // już zamknięte
    }
  }
}

export function connectDiscord(clientId: string, timeoutMs = 2000): Promise<DiscordConnection> {
  const candidates = discordIpcCandidates();
  return new Promise((resolve, reject) => {
    let index = 0;

    const tryNext = (): void => {
      if (index >= candidates.length) {
        reject(new Error('Discord IPC not found'));
        return;
      }
      const path = candidates[index];
      index += 1;
      const socket = connect(path);
      let settled = false;

      const giveUp = (): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        tryNext();
      };

      const timer = setTimeout(giveUp, timeoutMs);
      socket.once('error', giveUp);
      socket.once('connect', () => {
        socket.setTimeout(0);
        const connection = new DiscordConnection(socket);
        connection.write(OP_HANDSHAKE, { v: 1, client_id: clientId });
        connection.ready
          .then(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.removeListener('error', giveUp);
            resolve(connection);
          })
          .catch(() => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.removeListener('error', giveUp);
            tryNext();
          });
      });
    };

    tryNext();
  });
}
