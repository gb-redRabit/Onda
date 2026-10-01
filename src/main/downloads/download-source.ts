import type { IpcDownloadSource } from '../../shared/types/ipc/download';

// Rebuilds the source descriptor that is stored on a download job. Field-by-field
// (not a spread) so nothing unexpected from the renderer leaks into the queue.
//
// Regression: `sourceId`/`sourceItemId`/`allowPrivateNetwork` were dropped here.
// The sources layer marks a finished download as "downloaded" from
// `sourceId`+`sourceItemId`, and the attempted network target uses
// `allowPrivateNetwork`, so losing them silently broke both.
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
