export function toMediaServerUrl(filePath: string): string {
  const base = window.api?.mediaServerUrl || '';
  return `${base}/?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

// Remote (YouTube online) audio streams are proxied through the media server
// so the renderer only ever talks to 127.0.0.1 and the stream URL never
// reaches the page's own network stack (see /stream in media-server.ts).
export function toMediaStreamUrl(remoteUrl: string): string {
  const base = window.api?.mediaServerUrl || '';
  return `${base}/stream?url=${encodeURIComponent(remoteUrl)}`;
}

export function loadScaledImageUrl(filePath: string, maxWidth: number = 1920): Promise<string> {
  return fetch(`onda:///?path=${encodeURIComponent(filePath)}&w=${maxWidth}`)
    .then((resp) => {
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.blob();
    })
    .then((blob) => URL.createObjectURL(blob));
}
