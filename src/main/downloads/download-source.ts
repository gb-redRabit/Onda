import type { IpcDownloadSource } from '../../shared/types/ipc/download';
import { sanitizeFilename } from '../../shared/text';

const MAX_FILE_NAME = 200;

/**
 * Nazwa pliku docelowego pochodzi z renderera, więc może nieść separatory
 * katalogów i `..`. `join(outputDir, fileName)` znormalizowałby taką ścieżkę i
 * pozwolił zapisać dowolny plik poza katalogiem wyjściowym (path traversal do
 * np. folderu Startup). Bierzemy wyłącznie ostatni segment, odrzucamy `.`/`..`
 * i przepuszczamy przez sanityzację nazw.
 */
export function safeDownloadFileName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const last =
    raw
      .trim()
      .split(/[\\/]+/)
      .pop() ?? '';
  if (!last || last === '.' || last === '..') return undefined;
  return sanitizeFilename(last, { maxLength: MAX_FILE_NAME, fallback: '' }) || undefined;
}

// Odbudowuje deskryptor source zapisywany na zadaniu pobierania. Pole po polu
// (nie spread), aby nic nieoczekiwanego z renderera nie wyciekło do kolejki.
//
// Regresja: `sourceId`/`sourceItemId`/`allowPrivateNetwork` były tu gubione.
// Warstwa źródeł oznacza ukończone pobieranie jako "downloaded" na podstawie
// `sourceId`+`sourceItemId`, a próbowany cel sieciowy używa
// `allowPrivateNetwork`, więc ich utrata po cichu psuła jedno i drugie.
//
// UWAGA: `allowPrivateNetwork` wciąż jest przepisywane z wejścia, ale
// `addDownloadJobs` nadpisuje je po powiązaniu z ZAPISANYM źródłem po `sourceId`
// (tak jak `sources:enqueue`); surowa flaga z renderera nigdy nie trafia do sieci.
export function buildJobSource(
  input: IpcDownloadSource | undefined
): IpcDownloadSource | undefined {
  if (!input) return undefined;
  const common = {
    sourceId: typeof input.sourceId === 'string' ? input.sourceId.slice(0, 200) : undefined,
    sourceItemId:
      typeof input.sourceItemId === 'string' ? input.sourceItemId.slice(0, 500) : undefined,
    allowPrivateNetwork: !!input.allowPrivateNetwork
  };
  if (input.mode === 'http') {
    return {
      mode: 'http',
      ...common,
      fileName: safeDownloadFileName(input.fileName),
      apiKeyId: typeof input.apiKeyId === 'string' ? input.apiKeyId.slice(0, 200) : undefined,
      headerName: typeof input.headerName === 'string' ? input.headerName.slice(0, 100) : undefined
    };
  }
  if (input.mode === 'soundcloud') {
    return {
      mode: 'soundcloud',
      ...common,
      fileName: safeDownloadFileName(input.fileName)
    };
  }
  return {
    mode: 'ytdlp',
    ...common,
    apiKeyId: typeof input.apiKeyId === 'string' ? input.apiKeyId.slice(0, 200) : undefined,
    headerName: typeof input.headerName === 'string' ? input.headerName.slice(0, 100) : undefined,
    headers:
      input.headers && typeof input.headers === 'object'
        ? Object.fromEntries(
            Object.entries(input.headers).filter(
              ([k, v]) => typeof k === 'string' && typeof v === 'string'
            )
          )
        : undefined
  };
}
