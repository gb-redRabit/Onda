import { readdir, stat, lstat, unlink, rm, copyFile, cp, rename } from 'fs/promises';
import { join, basename } from 'path';
import { stripDuplicateSuffix, fileHash, uniqueDestPath } from './fs-utils';
import { isSafeAbsolutePath, isSafeStringArray } from '../../utils/validate';
import { isProtectedPath, parentOf } from '../../path-policy';
import { logger } from '../../../shared/logger';

// `fs:findDuplicates` hash'uje pliki-kandydatów. Przypadek użycia explorera to
// folder mediów, więc te limity są znacznie powyżej normalnej biblioteki i istnieją
// tylko po to, by jedno wywołanie nie wysyciło dysku.
const MAX_DUPLICATE_CANDIDATES = 5000;
const MAX_DUPLICATE_FILE_BYTES = 2 * 1024 * 1024 * 1024;

export interface DupGroup {
  original: string;
  duplicates: string[];
}

// Wykrywanie duplikatów: grupuje pliki po nazwie z usuniętym sufiksem kopii i
// porównuje hashe w obrębie grupy. Ogranicza liczbę kandydatów i czytane bajty.
export async function findDuplicates(directory: string): Promise<DupGroup[]> {
  const groups: DupGroup[] = [];
  if (!isSafeAbsolutePath(directory)) {
    logger.warn('fs', 'findDuplicates rejected invalid path');
    return groups;
  }
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .slice(0, MAX_DUPLICATE_CANDIDATES)
      .map((e) => join(directory, e.name));

    const bucket = new Map<string, string[]>();
    for (const f of files) {
      const stripped = stripDuplicateSuffix(basename(f));
      if (stripped) {
        if (!bucket.has(stripped)) bucket.set(stripped, []);
        bucket.get(stripped)!.push(f);
      }
    }

    for (const [origName, candidates] of bucket) {
      const originalPath = join(directory, origName);
      let refPath = originalPath;
      let refStats: Awaited<ReturnType<typeof stat>> | null = null;
      try {
        refStats = await stat(originalPath);
      } catch {
        // brak oryginału — spodziewane, można wybrać kandydata jako referencję
      }
      if (!refStats?.isFile()) {
        if (candidates.length < 2) continue;
        refPath = candidates[0];
        try {
          refStats = await stat(refPath);
        } catch (e) {
          logger.warn('fs', `duplicate reference stat failed for ${refPath}`, e);
          continue;
        }
      }
      const refSize = refStats.size;
      if (refSize > MAX_DUPLICATE_FILE_BYTES) continue;
      let refHash: string | null = null;
      try {
        refHash = await fileHash(refPath, MAX_DUPLICATE_FILE_BYTES);
      } catch (e) {
        logger.warn('fs', `duplicate reference hash failed for ${refPath}`, e);
        continue;
      }
      if (!refHash) continue;
      const dups: string[] = [];
      for (const c of candidates) {
        if (c.toLowerCase() === refPath.toLowerCase()) continue;
        try {
          const s = await stat(c);
          if (s.size !== refSize) continue;
          if ((await fileHash(c, MAX_DUPLICATE_FILE_BYTES)) === refHash) dups.push(c);
        } catch (e) {
          logger.warn('fs', `duplicate compare failed for ${c}`, e);
        }
      }
      if (dups.length > 0) groups.push({ original: refPath, duplicates: dups });
    }
  } catch (e) {
    logger.warn('fs', `findDuplicates failed for ${directory}`, e);
  }
  return groups;
}

/**
 * Wspólna walidacja `fs:move`/`fs:copy`: argumenty, chroniony cel i (dla
 * przenoszenia, które usuwa źródło) chronione źródła. Zwraca `null`, gdy cała
 * operacja jest odrzucona, oraz przefiltrowaną listę źródeł.
 */
export async function validateTransferArgs(
  paths: unknown,
  destination: unknown,
  op: 'move' | 'copy'
): Promise<{ sources: string[]; destination: string } | null> {
  if (!isSafeStringArray(paths) || !isSafeAbsolutePath(destination)) {
    logger.warn('fs', `${op} rejected invalid arguments`);
    return null;
  }
  if (isProtectedPath(destination) || isProtectedPath(parentOf(destination))) {
    logger.warn('fs', `${op} rejected protected destination: ${destination}`);
    return null;
  }
  const sources: string[] = [];
  for (const src of paths) {
    if (!isSafeAbsolutePath(src)) continue;
    // Przenoszenie to usunięcie u źródła: obowiązuje ten sam guard.
    if (op === 'move' && isProtectedPath(src)) {
      logger.warn('fs', `move rejected protected source: ${src}`);
      continue;
    }
    sources.push(src);
  }
  return { sources, destination };
}

/** Przenosi pliki/katalogi (rename z fallbackiem copy+delete) do `destination`. */
export async function moveItems(paths: unknown, destination: unknown): Promise<void> {
  const args = await validateTransferArgs(paths, destination, 'move');
  if (!args) return;
  for (const src of args.sources) {
    try {
      const name = basename(src);
      const dest = await uniqueDestPath(join(args.destination, name));
      if (src.toLowerCase() === dest.toLowerCase()) {
        continue;
      }
      await rename(src, dest);
    } catch {
      try {
        const name = basename(src);
        const dest = await uniqueDestPath(join(args.destination, name));
        const s = await lstat(src);
        if (s.isDirectory()) {
          await cp(src, dest, { recursive: true });
          await rm(src, { recursive: true, force: true });
        } else {
          await copyFile(src, dest);
          await unlink(src);
        }
      } catch (err2) {
        logger.error('fs', `fs:move failed for ${src}`, err2);
      }
    }
  }
}

/** Kopiuje pliki/katalogi do `destination`. */
export async function copyItems(paths: unknown, destination: unknown): Promise<void> {
  const args = await validateTransferArgs(paths, destination, 'copy');
  if (!args) return;
  for (const src of args.sources) {
    try {
      const name = basename(src);
      const dest = await uniqueDestPath(join(args.destination, name));
      const s = await lstat(src);
      if (s.isDirectory()) {
        await cp(src, dest, { recursive: true });
      } else {
        await copyFile(src, dest);
      }
    } catch (err) {
      logger.error('fs', `fs:copy failed for ${src}`, err);
    }
  }
}
