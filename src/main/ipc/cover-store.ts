import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import { runFileMigrations, runStoreMigrations } from '../state-migrations';

// Encrypted electron-store bootstrap, split out of `cover-cache.ts` (plan 2.8).

// The electron-store encryption key is persisted as a random per-install value
// instead of being derived from the hostname (which is public and predictable).
const STORE_KEY_FILE = 'onda-store-key';

export type Store = InstanceType<typeof import('electron-store').default>;

let _storePromise: Promise<Store> | null = null;

async function getOrCreateStoreKey(): Promise<string> {
  const keyPath = join(app.getPath('userData'), STORE_KEY_FILE);
  try {
    const existing = (await readFile(keyPath, 'utf-8')).trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch {
    // first run
  }
  const migrated = await runFileMigrations(keyPath);
  if (migrated) return migrated;
  const fresh = randomBytes(32).toString('hex');
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(keyPath, fresh, { mode: 0o600 });
  return fresh;
}

export function getStore(): Promise<Store> {
  if (!_storePromise) {
    _storePromise = (async () => {
      const { default: Store } = await import('electron-store');
      const key = await getOrCreateStoreKey();
      const store = new Store({ encryptionKey: key });
      await runStoreMigrations(store);
      return store;
    })();
  }
  return _storePromise;
}
