import { app, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import type { IpcDownloadProfile, IpcDownloadConfig } from '../../shared/types/ipc';

function profilesFile(): string {
  return join(app.getPath('userData'), 'download-profiles.json');
}

async function readProfiles(): Promise<IpcDownloadProfile[]> {
  try {
    const raw = await readFile(profilesFile(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is IpcDownloadProfile =>
        !!p &&
        typeof (p as IpcDownloadProfile).id === 'string' &&
        typeof (p as IpcDownloadProfile).name === 'string' &&
        !!(p as IpcDownloadProfile).config
    );
  } catch {
    return [];
  }
}

let writeChain: Promise<void> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeChain.then(fn);
  writeChain = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function persistProfiles(list: IpcDownloadProfile[]): Promise<void> {
  await mkdir(dirname(profilesFile()), { recursive: true });
  await writeFile(profilesFile(), JSON.stringify(list, null, 2), 'utf-8');
}

export function registerDownloadProfileHandlers(): void {
  ipcMain.handle('profiles:list', async (): Promise<IpcDownloadProfile[]> => readProfiles());

  ipcMain.handle(
    'profiles:save',
    async (
      _event,
      input: { id?: string; name: string; config: IpcDownloadConfig }
    ): Promise<IpcDownloadProfile[] | null> => {
      if (!input || typeof input.name !== 'string' || !input.name.trim() || !input.config) {
        return null;
      }
      return withWriteLock(async () => {
        const list = await readProfiles();
        const name = input.name.trim();
        if (input.id) {
          const idx = list.findIndex((p) => p.id === input.id);
          if (idx === -1) return list;
          list[idx] = { ...list[idx], name, config: input.config };
        } else {
          list.push({ id: randomUUID(), name, config: input.config });
        }
        await persistProfiles(list);
        return list;
      });
    }
  );

  ipcMain.handle('profiles:delete', async (_event, id: string): Promise<IpcDownloadProfile[]> => {
    return withWriteLock(async () => {
      const list = await readProfiles();
      const next = list.filter((p) => p.id !== id);
      await persistProfiles(next);
      return next;
    });
  });
}
