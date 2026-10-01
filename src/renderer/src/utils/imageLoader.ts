export function toMediaServerUrl(filePath: string): string {
  const base = window.api?.mediaServerUrl || '';
  return `${base}/?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

// Zdalne (YouTube online) strumienie audio są proxowane przez media server,
// więc renderer rozmawia wyłącznie z 127.0.0.1, a URL strumienia nigdy nie
// trafia do własnego stosu sieciowego strony (patrz /stream w media-server.ts).
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
