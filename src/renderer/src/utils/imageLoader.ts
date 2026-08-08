export function toMediaServerUrl(filePath: string): string {
  const base = window.api?.mediaServerUrl || '';
  return `${base}/?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

export function loadScaledImageUrl(filePath: string, maxWidth: number = 1920): Promise<string> {
  return fetch(`onda:///?path=${encodeURIComponent(filePath)}&w=${maxWidth}`)
    .then((resp) => {
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.blob();
    })
    .then((blob) => URL.createObjectURL(blob));
}
