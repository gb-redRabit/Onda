import type { IpcDownloadSource } from '../../shared/types/ipc/download';

// Odbudowuje deskryptor source zapisywany na zadaniu pobierania. Pole po polu
// (nie spread), aby nic nieoczekiwanego z renderera nie wyciekło do kolejki.
//
// Regresja: `sourceId`/`sourceItemId`/`allowPrivateNetwork` były tu gubione.
// Warstwa źródeł oznacza ukończone pobieranie jako "downloaded" na podstawie
// `sourceId`+`sourceItemId`, a próbowany cel sieciowy używa
// `allowPrivateNetwork`, więc ich utrata po cichu psuła jedno i drugie.
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
      fileName:
        typeof input.fileName === 'string' && input.fileName
          ? input.fileName.slice(0, 200)
          : undefined,
      apiKeyId: typeof input.apiKeyId === 'string' ? input.apiKeyId.slice(0, 200) : undefined,
      headerName: typeof input.headerName === 'string' ? input.headerName.slice(0, 100) : undefined
    };
  }
  if (input.mode === 'soundcloud') {
    return {
      mode: 'soundcloud',
      ...common,
      fileName:
        typeof input.fileName === 'string' && input.fileName
          ? input.fileName.slice(0, 200)
          : undefined
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
