let currentMediaServerUrl = '';

export function setMediaServerUrl(url: string): void {
  currentMediaServerUrl = url;
}

export function getMediaServerUrl(): string {
  return currentMediaServerUrl;
}

export function getMediaUrlArgs(): string[] {
  return currentMediaServerUrl ? [`--onda-media-url=${currentMediaServerUrl}`] : [];
}
