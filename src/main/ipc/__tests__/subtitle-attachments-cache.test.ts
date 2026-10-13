import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Regresja wydajnościowa: `subtitles:extractAttachments` uruchamiał ffprobe +
// mkvextract/ffmpeg przy KAŻDYM otwarciu tego samego pliku. Pierwsze wywołanie ma
// ekstrahować, drugie — obsłużyć z trwałego cache bez ani jednego spawnu.

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  runCalls: [] as string[][],
  userData: '',
  tempRoot: ''
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      state.handlers.set(channel, fn);
    }
  },
  app: { getPath: () => state.userData }
}));

vi.mock('../cover/cover-cache', async () => {
  const { mkdtempSync: mk } = await import('node:fs');
  const { tmpdir: tmp } = await import('node:os');
  const { join: j } = await import('node:path');
  state.tempRoot = mk(j(tmp(), 'onda-fonts-it-'));
  return { getTempDir: () => state.tempRoot };
});

vi.mock('../../binaries', () => ({
  resolveBin: async (name: string) => `/fake/${name}`
}));

const FONT_BYTES = [0, 1, 2, 3, 4];

vi.mock('../../utils/exec', () => ({
  runCommand: async (_bin: string, args: string[]) => {
    state.runCalls.push(args);
    if (args.includes('-show_entries')) {
      return JSON.stringify({
        streams: [{ index: 2, codec_type: 'attachment', tags: { filename: 'Roboto.ttf' } }]
      });
    }
    if (args[1] === 'attachments') {
      const spec = args[2];
      writeFileSync(spec.slice(spec.indexOf(':') + 1), Buffer.from(FONT_BYTES));
      return '';
    }
    return '';
  }
}));

const { registerSubtitleHandlers } = await import('../subtitle-handlers');

describe('subtitles:extractAttachments font cache', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.runCalls.length = 0;
    state.userData = mkdtempSync(join(tmpdir(), 'onda-fonts-user-'));
    registerSubtitleHandlers();
  });

  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true });
  });

  it('extracts on the first call and serves the cache on the next (before/after)', async () => {
    const video = join(state.userData, 'movie.mkv');
    writeFileSync(video, Buffer.alloc(2048, 7));
    const extract = state.handlers.get('subtitles:extractAttachments')!;

    const first = await extract({}, video);
    expect(first).toEqual([{ name: 'att_0', ext: 'ttf', data: FONT_BYTES }]);
    expect(state.runCalls.length).toBeGreaterThanOrEqual(2);

    state.runCalls.length = 0;
    const second = await extract({}, video);
    expect(second).toEqual(first);
    expect(state.runCalls).toHaveLength(0);
  });

  it('re-extracts after the source file changes', async () => {
    const video = join(state.userData, 'movie.mkv');
    writeFileSync(video, Buffer.alloc(1024, 3));
    const extract = state.handlers.get('subtitles:extractAttachments')!;

    await extract({}, video);
    state.runCalls.length = 0;

    writeFileSync(video, Buffer.alloc(4096, 4));
    await extract({}, video);
    expect(state.runCalls.length).toBeGreaterThanOrEqual(2);
  });
});
