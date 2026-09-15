import { logger } from '../shared/logger';
import { migrateAppearance } from './ipc/settings-migrations';
import { migrateLegacyStore } from './ipc/store-crypto';
import type { Store } from './ipc/cover-store';

// Central registry for one-time state migrations (plan 4.1/4.2). Two layers:
//
//  - FILE migrations run before the encrypted store can be opened (e.g. the
//    legacy hostname-derived encryption key) and are driven by cover-store.
//  - STORE migrations run once, in version order, against the decrypted store
//    and are tracked by the `schemaVersion` key it holds.
//
// Golden rule: never add a destructive store migration before the pre-migration
// `.bak` backup from plan 4.4 lands.

export const STORE_VERSION_KEY = 'schemaVersion';
export const CURRENT_STORE_VERSION = 1;

export interface StoreMigration {
  /** Target version; migrations run in ascending order above the stored one. */
  version: number;
  name: string;
  migrate(store: Store): void;
}

// The appearance sanitizer also normalizes imported payloads, so this migration
// is idempotent — it only guarantees stored state gets upgraded once at boot.
export const STORE_MIGRATIONS: StoreMigration[] = [
  {
    version: 1,
    name: 'audio-pip-adaptive-dock',
    migrate(store) {
      const appearance = store.get('appearance');
      if (appearance !== undefined) store.set('appearance', migrateAppearance(appearance));
    }
  }
];

export async function runStoreMigrations(
  store: Store,
  migrations: readonly StoreMigration[] = STORE_MIGRATIONS
): Promise<void> {
  const raw = Number(store.get(STORE_VERSION_KEY) ?? 0);
  const from = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const pending = migrations
    .filter((migration) => migration.version > from)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    migration.migrate(store);
    store.set(STORE_VERSION_KEY, migration.version);
    logger.info('state', `store migration ${migration.version} (${migration.name}) applied`);
  }
}

export interface FileMigration {
  name: string;
  /** Returns the new encryption key when the config file was rewritten. */
  run(keyPath: string): Promise<string | null>;
}

export const FILE_MIGRATIONS: FileMigration[] = [
  { name: 'legacy-hostname-key', run: migrateLegacyStore }
];

export async function runFileMigrations(
  keyPath: string,
  migrations: readonly FileMigration[] = FILE_MIGRATIONS
): Promise<string | null> {
  for (const migration of migrations) {
    const newKey = await migration.run(keyPath);
    if (newKey) {
      logger.info('state', `file migration (${migration.name}) applied`);
      return newKey;
    }
  }
  return null;
}
