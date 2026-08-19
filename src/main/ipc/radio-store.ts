import { app, ipcMain } from 'electron';
import { join, dirname } from 'path';
import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import type { IpcRadioStation } from '../../shared/types/ipc';
import { logger } from '../../shared/logger';

const SCHEMA_VERSION = 1;
const MAX_STATIONS = 200;

interface PersistedRadio {
  version: number;
  stations: IpcRadioStation[];
}

export function radioFilePath(): string {
  return join(app.getPath('userData'), 'radios.json');
}

// Hosts of the stations the user added, mirrored from the persisted store so
// the media-server stream proxy can allow them (radio streams are plain
// http(s) Icecast/SHOUTcast URLs, unlike the YouTube allowlist).
const allowedRadioHosts = new Set<string>();

function isValidStationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function sanitizeStations(input: unknown): IpcRadioStation[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: IpcRadioStation[] = [];
  for (const s of input) {
    if (
      !s ||
      typeof (s as IpcRadioStation).id !== 'string' ||
      !(s as IpcRadioStation).id ||
      typeof (s as IpcRadioStation).name !== 'string' ||
      !(s as IpcRadioStation).name.trim() ||
      typeof (s as IpcRadioStation).url !== 'string' ||
      !isValidStationUrl((s as IpcRadioStation).url)
    ) {
      continue;
    }
    if (seen.has((s as IpcRadioStation).url)) continue;
    seen.add((s as IpcRadioStation).url);
    out.push({
      id: (s as IpcRadioStation).id.slice(0, 128),
      name: (s as IpcRadioStation).name.trim().slice(0, 200),
      url: (s as IpcRadioStation).url.slice(0, 2048),
      addedAt: typeof (s as IpcRadioStation).addedAt === 'number' ? (s as IpcRadioStation).addedAt : Date.now()
    });
  }
  return out.slice(0, MAX_STATIONS);
}

// Keeps the proxy allowlist in sync with the persisted stations. Called on
// every load/save so a station added while the app runs is playable at once.
function syncAllowedRadioHosts(stations: IpcRadioStation[]): void {
  allowedRadioHosts.clear();
  for (const s of stations) {
    try {
      allowedRadioHosts.add(new URL(s.url).hostname.toLowerCase());
    } catch {
      // sanitized already — skip
    }
  }
}

export function isAllowedRadioHost(hostname: string): boolean {
  return allowedRadioHosts.has(hostname.toLowerCase());
}

// Best-effort load with sanitization: corrupt files or malformed entries are
// dropped so the view can never crash on bad persisted data.
export async function loadRadioData(filePath: string): Promise<IpcRadioStation[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedRadio>;
    if (!parsed || parsed.version !== SCHEMA_VERSION) return [];
    const stations = sanitizeStations(parsed.stations);
    syncAllowedRadioHosts(stations);
    return stations;
  } catch {
    return [];
  }
}

let writeChain: Promise<void> = Promise.resolve();

// Serializes writes and swaps the file in atomically (temp file + rename) so a
// crash mid-write never leaves a half-written store.
export function persistRadio(filePath: string, stations: IpcRadioStation[]): Promise<void> {
  const payload: PersistedRadio = { version: SCHEMA_VERSION, stations };
  writeChain = writeChain.then(async () => {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(payload), 'utf-8');
    await rename(tmp, filePath);
  });
  writeChain = writeChain.catch((e) => {
    logger.warn('radio', 'failed to persist radio stations', e);
  });
  return writeChain;
}

export function registerRadioHandlers(): void {
  let stations: IpcRadioStation[] = [];
  const filePath = radioFilePath();

  ipcMain.handle('radio:load', async () => {
    if (stations.length === 0) {
      stations = await loadRadioData(filePath);
    }
    return { stations };
  });

  ipcMain.handle('radio:save', async (_event, input: IpcRadioStation[]) => {
    const cleaned = sanitizeStations(input);
    stations = cleaned;
    syncAllowedRadioHosts(cleaned);
    await persistRadio(filePath, cleaned);
    return true;
  });
}