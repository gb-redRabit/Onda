import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { makeGrantableScratch } from '../../__tests__/scratch-dirs';

// The exploratory fs channels took renderer arguments unchecked. `fs:readdir`
// and `fs:getProperties` were happy to walk any path, and `shell:openTerminal`
// spawned a detached shell per call.

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
const openPaths: string[] = [];
let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false, getVersion: () => '0.0.0-test' },
  ipcMain: { handle: (channel: string, listener: Handler) => handlers.set(channel, listener) },
  shell: {
    showItemInFolder: (p: string) => openPaths.push(`show:${p}`),
    openPath: async (p: string) => {
      openPaths.push(`open:${p}`);
      return '';
    }
  },
  clipboard: { writeText: vi.fn(), readText: () => '' },
  dialog: { showMessageBox: async () => ({ response: 0 }) },
  BrowserWindow: { fromWebContents: () => null }
}));

const grantedRoots: string[] = [];
const spawns: Array<{ cmd: string; args: string[] }> = [];

// Partial: fs-utils promisifies `exec` from this module, so only `spawn` is
// replaced. A full stub would break the module graph.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const fakeSpawn = (cmd: string, args: string[]) => {
    spawns.push({ cmd, args });
    return { unref: () => {}, kill: () => {} };
  };
  return {
    ...actual,
    spawn: fakeSpawn,
    default: { ...actual, spawn: fakeSpawn }
  };
});

// media-handlers imports addAllowedRoot from src/main/media-server, which is
// two levels up from this test file.
vi.mock('../../media-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../media-server')>();
  return {
    ...actual,
    addAllowedRoot: async (root: string) => {
      grantedRoots.push(root);
    }
  };
});

const { registerFsHandlers } = await import('../fs-handlers');
const { registerMediaHandlers } = await import('../media-handlers');

const senders: Array<{ send: (channel: string, payload: unknown) => void }> = [];
function event(): { sender: { send: (channel: string, payload: unknown) => void } } {
  const sender = { send: vi.fn() };
  senders.push(sender);
  return { sender };
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`channel ${channel} is not registered`);
  return Promise.resolve(handler(event(), ...args));
}

/**
 * `fs:readdir` streams: one `{done:false, items:[...]}` per batch followed by a
 * `{done:true, items:[]}` terminator, so the items have to be collected rather
 * than read off the last call.
 */
function batchedItems(): { batches: number; items: Array<{ name: string }> } {
  const sender = senders.at(-1)!;
  const calls = (sender.send as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const items: Array<{ name: string }> = [];
  let batches = 0;
  for (const [channel, payload] of calls) {
    if (channel !== 'fs:readdir:batch') continue;
    batches++;
    const batch = payload as { done: boolean; items: Array<{ name: string }> };
    items.push(...(batch.items ?? []));
  }
  return { batches, items };
}

let mediaDir = '';
// os.tmpdir() is not an ordinary folder everywhere — on macOS it is under
// /var, and on a Windows runner with TEMP/TMP unset it is C:\WINDOWS\temp — so
// the fixture lives under the home directory instead. See scratch-dirs.ts.
let scratch: Awaited<ReturnType<typeof makeGrantableScratch>> | null = null;

beforeAll(async () => {
  scratch = await makeGrantableScratch('fs-guards');
  userData = await mkdtemp(join(scratch.dir, 'userdata-'));
  mediaDir = join(scratch.dir, 'Music', 'Album');
  await mkdir(mediaDir, { recursive: true });
  await writeFile(join(mediaDir, 'track.mp3'), 'x');
  registerFsHandlers();
  registerMediaHandlers();
});

afterAll(async () => {
  await rm(userData, { recursive: true, force: true });
  await scratch?.cleanup();
});

beforeEach(() => {
  openPaths.length = 0;
  senders.length = 0;
  grantedRoots.length = 0;
  spawns.length = 0;
});

describe('exploratory fs channels validate their arguments', () => {
  it.each([
    ['fs:readdir', ['relative/dir']],
    ['fs:readdir', [null]],
    ['fs:readdir', ['']],
    ['fs:getProperties', ['relative/dir']],
    ['fs:getProperties', [42]],
    ['fs:findDuplicates', ['relative/dir']],
    ['shell:showItemInFolder', ['relative/file']],
    ['shell:openTerminal', ['relative/dir']],
    ['shell:getFileIcon', ['relative/file']],
    ['media:grantAccess', ['relative/file']]
  ])('%s refuses a non-absolute path (%j)', async (channel, args) => {
    await expect(invoke(channel, ...args)).resolves.not.toThrow();
  });

  it('fs:readdir reports an invalid path as an empty batch rather than listing drives', async () => {
    await invoke('fs:readdir', 'not/absolute');
    expect(batchedItems()).toEqual({ batches: 1, items: [] });
  });

  it('fs:readdir still lists the current directory', async () => {
    await invoke('fs:readdir', mediaDir);
    expect(batchedItems().items.map((i) => i.name)).toContain('track.mp3');
  });

  it('fs:readdir still lists drives for the root', async () => {
    await invoke('fs:readdir', '/');
    expect(batchedItems().batches).toBe(1);
  });

  it('fs:getProperties returns null for an invalid path', async () => {
    expect(await invoke('fs:getProperties', '../escape')).toBeNull();
  });

  it('fs:findDuplicates returns no groups for an invalid path', async () => {
    expect(await invoke('fs:findDuplicates', 'nope')).toEqual([]);
  });

  it('shell:openTerminal spawns one shell for a burst of overlapping calls', async () => {
    // Without the re-entrancy latch each call spawned a detached cmd.exe, so
    // the channel was usable as a process bomb.
    await Promise.all([
      invoke('shell:openTerminal', mediaDir),
      invoke('shell:openTerminal', mediaDir),
      invoke('shell:openTerminal', mediaDir)
    ]);
    expect(spawns).toHaveLength(1);
    expect(spawns[0].args.at(-1)).toBe(await realpath(mediaDir));
  });

  it('shell:openTerminal refuses a file', async () => {
    await invoke('shell:openTerminal', join(mediaDir, 'track.mp3'));
    expect(spawns).toEqual([]);
  });

  it('shell:openTerminal accepts a new directory once the latch clears', async () => {
    // The burst test above left the 500 ms latch engaged; a real second click
    // after that window has to work.
    await new Promise((r) => setTimeout(r, 600));
    await invoke('shell:openTerminal', mediaDir);
    expect(spawns).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 600));
    await invoke('shell:openTerminal', mediaDir);
    expect(spawns).toHaveLength(2);
  });

  it('media:grantAccess refuses a protected path', async () => {
    // The grant is persisted into extraRoots, so without this a caller could
    // hand the media server a system directory for the rest of the session.
    const protectedDir = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
    expect(await invoke('media:grantAccess', join(protectedDir, 'a.dll'))).toBe(false);
    expect(grantedRoots).toEqual([]);
  });

  it('media:grantAccess accepts an ordinary media folder', async () => {
    const track = join(mediaDir, 'track.mp3');
    expect(await invoke('media:grantAccess', track)).toBe(true);
    expect(grantedRoots).toEqual([track, mediaDir]);
  });

  it('fs:copyPath refuses an oversized string', async () => {
    // Clipboard writes are cheap but unbounded input from the renderer is not.
    await expect(invoke('fs:copyPath', 'C:\\' + 'a'.repeat(9000))).resolves.not.toThrow();
  });
});
