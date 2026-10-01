import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import { logger } from '../../../shared/logger';
import {
  ensureStoreBackup,
  pendingStoreMigrations,
  runFileMigrations,
  runStoreMigrations
} from '../../state-migrations';

// Bootstrap szyfrowanego electron-store, wyodrębniony z `cover-cache.ts` (plan 2.8).

// Klucz szyfrowania electron-store jest zapisywany jako losowa wartość na instalację
// zamiast być wyprowadzany z nazwy hosta (która jest publiczna i przewidywalna).
const STORE_KEY_FILE = 'onda-store-key';

export type Store = InstanceType<typeof import('electron-store').default>;

let _storePromise: Promise<Store> | null = null;

async function getOrCreateStoreKey(): Promise<string> {
  const keyPath = join(app.getPath('userData'), STORE_KEY_FILE);
  try {
    const existing = (await readFile(keyPath, 'utf-8')).trim();
    if (/^[0-9a-f]{64}$/.test(existing)) return existing;
  } catch {
    // pierwsze uruchomienie
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
      if (pendingStoreMigrations(store).length > 0) {
        const configPath = join(app.getPath('userData'), 'config.json');
        const backedUp = await ensureStoreBackup(configPath);
        if (backedUp) {
          await runStoreMigrations(store);
        } else {
          logger.warn('state', 'store backup failed — skipping migrations (retried next boot)');
        }
      }
      return store;
    })();
  }
  return _storePromise;
}
