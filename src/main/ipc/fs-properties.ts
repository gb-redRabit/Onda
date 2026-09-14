import { readdir, stat } from 'fs/promises';
import { basename, join } from 'path';
import { logger } from '../../shared/logger';

// File/folder properties for the explorer: for a directory it walks the tree
// (bounded by MAX entries) and returns item/dir/file counts and total size.
export async function getFileProperties(filePath: string) {
  let s;
  try {
    s = await stat(filePath);
  } catch (e) {
    logger.warn('fs', `getProperties stat failed for ${filePath}`, e);
    return null;
  }
  const base = {
    name: basename(filePath),
    path: filePath,
    isDirectory: s.isDirectory(),
    size: s.size,
    createdAt: s.birthtimeMs,
    modifiedAt: s.mtimeMs
  };
  if (!s.isDirectory()) return base;
  let itemCount = 0;
  let dirCount = 0;
  let fileCount = 0;
  let totalSize = 0;
  let processed = 0;
  const MAX = 100000;
  async function walk(dir: string) {
    if (processed >= MAX) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      logger.warn('fs', `getProperties walk failed for ${dir}`, e);
      return;
    }
    for (const e of entries) {
      if (processed >= MAX) return;
      processed++;
      if (e.isDirectory()) {
        dirCount++;
        itemCount++;
        await walk(join(dir, e.name));
      } else if (e.isFile()) {
        fileCount++;
        itemCount++;
        try {
          const st = await stat(join(dir, e.name));
          totalSize += st.size;
        } catch (err) {
          logger.warn('fs', `getProperties stat failed for ${join(dir, e.name)}`, err);
        }
      }
    }
  }
  await walk(filePath);
  return {
    ...base,
    itemCount,
    dirCount,
    fileCount,
    totalSize,
    truncated: processed >= MAX
  };
}
