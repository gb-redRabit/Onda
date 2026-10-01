import { copyFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../shared/logger';
import { migrateAppearance } from './ipc/settings/settings-migrations';
import { migrateLegacyStore } from './ipc/store-crypto';
import type { Store } from './ipc/cover/cover-store';

// Centralny rejestr jednorazowych migracji stanu (plan 4.1/4.2). Dwie warstwy:
//
//  - migracje FILE uruchamiają się, zanim można otworzyć zaszyfrowany store
//    (np. starszy klucz szyfrowania wywodzony z nazwy hosta) i są sterowane
//    przez cover-store.
//  - migracje STORE uruchamiają się raz, w kolejności wersji, na odszyfrowanym
//    store i są śledzone przez klucz `schemaVersion`, który on przechowuje.
//
// Złota zasada: nigdy nie dodawaj destrukcyjnej migracji store, zanim nie
// powstanie kopia `.bak` sprzed migracji z planu 4.4.

export const STORE_VERSION_KEY = 'schemaVersion';
export const CURRENT_STORE_VERSION = 1;

// Kroczące kopie `.bak` zachowywane, zanim migracja nadpisze config.json.
export const MAX_STORE_BACKUPS = 3;

export interface StoreMigration {
  /** Wersja docelowa; migracje działają w kolejności rosnącej powyżej zapisanej. */
  version: number;
  name: string;
  migrate(store: Store): void;
}

// Sanitizer wyglądu normalizuje też importowane payloady, więc ta migracja jest
// idempotentna — gwarantuje tylko, że zapisany stan zostanie raz zaktualizowany przy starcie.
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

export function pendingStoreMigrations(
  store: Store,
  migrations: readonly StoreMigration[] = STORE_MIGRATIONS
): StoreMigration[] {
  const raw = Number(store.get(STORE_VERSION_KEY) ?? 0);
  const from = Number.isFinite(raw) && raw > 0 ? raw : 0;
  return migrations
    .filter((migration) => migration.version > from)
    .sort((a, b) => a.version - b.version);
}

export async function runStoreMigrations(
  store: Store,
  migrations: readonly StoreMigration[] = STORE_MIGRATIONS
): Promise<void> {
  for (const migration of pendingStoreMigrations(store, migrations)) {
    migration.migrate(store);
    store.set(STORE_VERSION_KEY, migration.version);
    logger.info('state', `store migration ${migration.version} (${migration.name}) applied`);
  }
}

// Tworzy `config.json.bak.1` (rotując starsze kopie do `maxBackups`) przed
// nadpisaniem store przez migrację. Zwraca false, gdy kopia zapasowa się nie
// powiodła — wywołujący musi wtedy POMINĄĆ migracje (plan 4.4: brak kopii, brak migracji).
export async function ensureStoreBackup(
  configPath: string,
  maxBackups = MAX_STORE_BACKUPS
): Promise<boolean> {
  if (!existsSync(configPath)) return true; // świeży store — nie ma czego chronić
  try {
    await mkdir(dirname(configPath), { recursive: true });
    for (let i = maxBackups; i >= 1; i--) {
      const source = i === 1 ? configPath : `${configPath}.bak.${i - 1}`;
      if (!existsSync(source)) continue;
      const dest = `${configPath}.bak.${i}`;
      await rm(dest, { force: true });
      await copyFile(source, dest);
    }
    return true;
  } catch (e) {
    logger.warn('state', `store backup failed (${configPath})`, e);
    return false;
  }
}

export interface FileMigration {
  name: string;
  /** Zwraca nowy klucz szyfrowania, gdy plik konfiguracyjny został przepisany. */
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
