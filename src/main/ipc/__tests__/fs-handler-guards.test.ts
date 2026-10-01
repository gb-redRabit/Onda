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
// two levels up from this test file. The mock mirrors the real signature: the
// handler branches on whether the root was actually stored.
vi.mock('../../media/media-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../media/media-server')>();
  return {
    ...actual,
    addAllowedRoot: async (root: string): Promise<boolean> => {
      grantedRoots.push(root);
      return true;
    }
  };
});

const { registerFsHandlers } = await import('../fs/fs-handlers');
const { registerMediaHandlers } = await import('../media/media-handlers');

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

  // Enumerating every drive is real I/O. Locally that is milliseconds, but on a
  // cold Windows CI runner, or one with a network-mapped drive, it overruns the
  // default 5 s budget, so these tests failed on the runner while passing on
  // every developer machine. 30 s leaves ample headroom without hiding a real
  // hang, since a hang never completes.
  const DRIVE_ENUMERATION_TIMEOUT_MS = 30_000;

  it(
    'fs:readdir reads an absent path as the drives view, not as invalid',
    async () => {
      // The explorer's nav pane and breadcrumb call navigateTo(''), which arrives
      // here as an empty string. Validating the argument before handling that made
      // the drives view come back empty: no error anywhere, just a permanently
      // blank list, and nothing that looked like a bug.
      for (const empty of ['', null, undefined]) {
        // Each invoke() creates its own sender, so batchedItems() sees this call only.
        await invoke('fs:readdir', empty);
        expect(batchedItems().batches, JSON.stringify(empty)).toBe(1);
        expect(batchedItems().items.length, JSON.stringify(empty)).toBeGreaterThan(0);
      }
    },
    DRIVE_ENUMERATION_TIMEOUT_MS
  );

  it('fs:readdir still lists the current directory', async () => {
    await invoke('fs:readdir', mediaDir);
    expect(batchedItems().items.map((i) => i.name)).toContain('track.mp3');
  });

  it(
    'fs:readdir still lists drives for the root',
    async () => {
      await invoke('fs:readdir', '/');
      expect(batchedItems().batches).toBe(1);
    },
    DRIVE_ENUMERATION_TIMEOUT_MS
  );

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

  it('media:grantAccess accepts an existing media file', async () => {
    const track = join(mediaDir, 'track.mp3');
    expect(await invoke('media:grantAccess', track)).toBe(true);
    // Only the containing directory: adding the file as a root too doubled the
    // allowlist for the common case of one track in a folder.
    expect(grantedRoots).toEqual([mediaDir]);
  });

  it('media:grantAccess refuses a path that does not exist', async () => {
    // A grant for a path that is not there can only inflate the allowlist, so
    // it is refused outright rather than stored.
    const missing = join(mediaDir, 'not-here.mp3');
    expect(await invoke('media:grantAccess', missing)).toBe(false);
    expect(grantedRoots).toEqual([]);
  });

  it('media:grantAccess grants a directory itself when asked for one', async () => {
    expect(await invoke('media:grantAccess', mediaDir)).toBe(true);
    expect(grantedRoots).toEqual([mediaDir]);
  });

  it('fs:copyPath refuses an oversized string', async () => {
    // Clipboard writes are cheap but unbounded input from the renderer is not.
    await expect(invoke('fs:copyPath', 'C:\\' + 'a'.repeat(9000))).resolves.not.toThrow();
  });
});
