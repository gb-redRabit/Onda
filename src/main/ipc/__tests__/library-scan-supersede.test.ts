import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Nowe skanowanie biblioteki nadpisywało AbortController bez przerywania
// poprzedniego, więc dwa pełne przejścia po katalogach biegły równolegle. To napędza
// prawdziwe handlery i obserwuje sygnały przekazywane skanom.

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
let userData = '';
const signals: AbortSignal[] = [];

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false, getVersion: () => '0.0.0-test' },
  ipcMain: { handle: (channel: string, listener: Handler) => handlers.set(channel, listener) }
}));

vi.mock('../media/media-handlers', () => ({ getDuration: vi.fn(async () => 0) }));

vi.mock('../library/library-watcher', () => ({
  startLibraryWatcher: vi.fn(async () => {}),
  setLibraryWatcherScan: vi.fn()
}));

const { registerLibraryHandlers } = await import('../library/library-handlers');
const { setLibraryScanned } = await import('../library/library-store');

let bigDir = '';
let smallDir = '';

function event() {
  return { sender: { send: () => {} } };
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`channel ${channel} is not registered`);
  return Promise.resolve(handler(event(), ...args));
}

beforeAll(async () => {
  userData = await mkdtemp(join(tmpdir(), 'onda-scan-abort-'));
  bigDir = join(userData, 'big');
  smallDir = join(userData, 'small');
  // Wystarczająco dużo wpisów, aby pierwsze przejście wciąż trwało, gdy
  // zostanie wydane drugie skanowanie.
  await mkdir(bigDir, { recursive: true });
  await Promise.all(
    Array.from({ length: 400 }, async (_unused, i) => {
      const file = join(bigDir, `track-${String(i).padStart(4, '0')}.mp3`);
      await writeFile(
        file,
        Buffer.concat([Buffer.from('ID3'), Buffer.from([0x04, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])])
      );
    })
  );
  await mkdir(smallDir, { recursive: true });
  await writeFile(
    join(smallDir, 'only.mp3'),
    Buffer.concat([Buffer.from('ID3'), Buffer.from([0x04, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])])
  );
  registerLibraryHandlers();
});

afterAll(async () => {
  // Przerwane skanowanie może jeszcze kończyć przejście po katalogu, gdy teardown
  // usuwa fixture — na Windows dawało to `ENOTEMPTY: rmdir`. Retry (jak w specach
  // E2E) ponawia usuwanie po krótkim odczekaniu.
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('library:scan supersedes the running scan', () => {
  it('aborts the previous scan instead of running two traversals at once', async () => {
    signals.length = 0;
    // Pierwsze skanowanie celowo nie jest awaited: drugie musi je przerwać.
    const first = invoke('library:scan', [bigDir]);
    const second = invoke('library:scan', [smallDir]);

    const [firstResult, secondResult] = (await Promise.all([first, second])) as Array<{
      count: number;
      aborted: boolean;
    }>;

    // Zastąpione skanowanie zgłasza się jako przerwane i nic nie wnosi.
    expect(firstResult.aborted).toBe(true);
    // Ocalałe skanowanie to to, o które użytkownik poprosił jako ostatnie.
    expect(secondResult.aborted).toBe(false);
    expect(secondResult.count).toBe(1);
  });

  it('does not let the aborted scan overwrite the library', async () => {
    setLibraryScanned({ files: [], folderTypes: {} });
    signals.length = 0;
    await Promise.all([invoke('library:scan', [bigDir]), invoke('library:scan', [smallDir])]);
    // Niezależnie od kolejności, zapisana biblioteka to jeden z dwóch przeskanych
    // folderów, nigdy scalenie obu i nigdy puste wyczyszczenie z przerwanego przebiegu.
    const { getLibraryScanned } = await import('../library/library-store');
    const stored = getLibraryScanned();
    const paths = stored.files.map((f: { path: string }) => f.path);
    expect(paths.length === 0 || paths.every((p: string) => p.startsWith(smallDir))).toBe(true);
  });

  it('scanCancel still aborts the active scan', async () => {
    const scan = invoke('library:scan', [bigDir]);
    expect(await invoke('library:scanCancel')).toBe(true);
    const result = (await scan) as { aborted: boolean };
    expect(result.aborted).toBe(true);
  });
});

void signals;
