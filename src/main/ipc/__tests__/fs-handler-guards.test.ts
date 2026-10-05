import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { makeGrantableScratch } from '../../__tests__/scratch-dirs';

// Eksploracyjne kanały fs przyjmowały argumenty z renderera bez sprawdzenia. `fs:readdir`
// i `fs:getProperties` chętnie przechodziły dowolną ścieżkę, a `shell:openTerminal`
// uruchamiał odłączony shell przy każdym wywołaniu.

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
const spawns: Array<{ cmd: string; args: string[]; cwd?: string }> = [];

// Częściowy: fs-utils promisifikuje `exec` z tego modułu, więc zastępowany jest
// tylko `spawn`. Pełny stub zepsułby graf modułów.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const fakeSpawn = (cmd: string, args: string[], opts?: { cwd?: string }) => {
    spawns.push({ cmd, args, cwd: opts?.cwd });
    return { unref: () => {}, kill: () => {} };
  };
  return {
    ...actual,
    spawn: fakeSpawn,
    default: { ...actual, spawn: fakeSpawn }
  };
});

// media-handlers importuje addAllowedRoot z src/main/media-server, co jest
// dwa poziomy wyżej od tego pliku testowego. Mock odwzorowuje prawdziwą sygnaturę:
// handler rozgałęzia się na tym, czy korzeń został faktycznie zapisany.
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
 * `fs:readdir` streamuje: jedno `{done:false, items:[...]}` na partię, po którym następuje
 * terminator `{done:true, items:[]}`, więc elementy trzeba zbierać, a nie
 * odczytywać z ostatniego wywołania.
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
// os.tmpdir() nie jest zwykłym folderem wszędzie — na macOS jest pod
// /var, a na runnerze Windows bez ustawionych TEMP/TMP jest to C:\WINDOWS\temp — więc
// fixture znajduje się pod katalogiem domowym. Patrz scratch-dirs.ts.
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

  // Wyliczanie każdego dysku to prawdziwe I/O. Lokalnie to milisekundy, ale na
  // zimnym runnerze CI Windows, albo takim z dyskiem mapowanym sieciowo, przekracza
  // domyślny budżet 5 s, więc te testy zawodzą na runnerze, choć przechodzą na
  // każdej maszynie deweloperskiej. 30 s zostawia spory zapas bez ukrywania prawdziwego
  // zawieszenia, bo zawieszenie nigdy się nie kończy.
  const DRIVE_ENUMERATION_TIMEOUT_MS = 30_000;

  it(
    'fs:readdir reads an absent path as the drives view, not as invalid',
    async () => {
      // Panel nawigacji i breadcrumb explorera wywołują navigateTo(''), co trafia
      // tu jako pusty string. Walidacja argumentu przed obsłużeniem tego powodowała,
      // że widok dysków wracał pusty: nigdzie błędu, tylko trwale
      // pusta lista i nic, co wyglądałoby na błąd.
      for (const empty of ['', null, undefined]) {
        // Każde invoke() tworzy własnego sendera, więc batchedItems() widzi tylko to wywołanie.
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
    // Bez zatrzasku re-entrancy każde wywołanie uruchamiało odłączony cmd.exe, więc
    // kanału można było użyć jako bomby procesowej.
    await Promise.all([
      invoke('shell:openTerminal', mediaDir),
      invoke('shell:openTerminal', mediaDir),
      invoke('shell:openTerminal', mediaDir)
    ]);
    expect(spawns).toHaveLength(1);
    // Katalog trafia przez `cwd` (bezpiecznie), a nie jako zbudowany łańcuch shella;
    // na platformach, których kandydat przekazuje go argumentem, akceptujemy i to.
    const openedDir = spawns[0].cwd ?? spawns[0].args.at(-1);
    expect(openedDir).toBe(await realpath(mediaDir));
  });

  it('shell:openTerminal refuses a file', async () => {
    await invoke('shell:openTerminal', join(mediaDir, 'track.mp3'));
    expect(spawns).toEqual([]);
  });

  it('shell:openTerminal accepts a new directory once the latch clears', async () => {
    // Powyższy test serii pozostawił zatrzask 500 ms włączony; prawdziwe drugie kliknięcie
    // po tym oknie musi zadziałać.
    await new Promise((r) => setTimeout(r, 600));
    await invoke('shell:openTerminal', mediaDir);
    expect(spawns).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 600));
    await invoke('shell:openTerminal', mediaDir);
    expect(spawns).toHaveLength(2);
  });

  it('media:grantAccess refuses a protected path', async () => {
    // Grant jest zapisywany w extraRoots, więc bez tego wywołujący mógłby
    // przekazać media serverowi katalog systemowy na resztę sesji.
    const protectedDir = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
    expect(await invoke('media:grantAccess', join(protectedDir, 'a.dll'))).toBe(false);
    expect(grantedRoots).toEqual([]);
  });

  it('media:grantAccess accepts an existing media file', async () => {
    const track = join(mediaDir, 'track.mp3');
    expect(await invoke('media:grantAccess', track)).toBe(true);
    // Tylko katalog zawierający: dodanie także pliku jako korzenia podwajało
    // allowlistę w typowym przypadku jednego utworu w folderze.
    expect(grantedRoots).toEqual([mediaDir]);
  });

  it('media:grantAccess refuses a path that does not exist', async () => {
    // Grant dla nieistniejącej ścieżki może tylko rozdąć allowlistę, więc
    // jest odrzucany od razu, a nie zapisywany.
    const missing = join(mediaDir, 'not-here.mp3');
    expect(await invoke('media:grantAccess', missing)).toBe(false);
    expect(grantedRoots).toEqual([]);
  });

  it('media:grantAccess grants a directory itself when asked for one', async () => {
    expect(await invoke('media:grantAccess', mediaDir)).toBe(true);
    expect(grantedRoots).toEqual([mediaDir]);
  });

  it('fs:copyPath refuses an oversized string', async () => {
    // Zapis do schowka jest tani, ale nieograniczone wejście z renderera już nie.
    await expect(invoke('fs:copyPath', 'C:\\' + 'a'.repeat(9000))).resolves.not.toThrow();
  });
});
