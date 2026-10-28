import { readFile, writeFile, mkdir, rename } from 'fs/promises';
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
    const promise = (async () => {
      const { default: Store } = await import('electron-store');
      const key = await getOrCreateStoreKey();
      let store: Store;
      try {
        store = new Store({ encryptionKey: key });
      } catch (e) {
        // Uszkodzony `config.json` lub niezgodny klucz nie może zablokować
        // ustawień do końca życia procesu. Odkładamy plik na bok (do ręcznego
        // odzyskania) i startujemy z czystym store.
        const configPath = join(app.getPath('userData'), 'config.json');
        logger.error('state', 'store load failed — moving config.json aside', e);
        try {
          await rename(configPath, `${configPath}.corrupt-${Date.now()}`);
        } catch {
          // brak pliku / brak uprawnień — kolejna próba i tak zgłosi błąd
        }
        store = new Store({ encryptionKey: key });
      }
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
    // Odrzucony Promise nie może zostać w cache na zawsze: następne wywołanie
    // ma ponowić inicjalizację (np. po chwilowej blokadzie pliku).
    _storePromise = promise.catch((e) => {
      _storePromise = null;
      logger.error('state', 'store initialization failed', e);
      throw e;
    });
  }
  return _storePromise;
}
