import { detectPlatform, isHttpUrl } from '@shared/platform';
import type { YouTubeResolveResult } from '@renderer/types/online';

export interface OnlineResolveResponse {
  success: boolean;
  error?: string;
  code?: string;
  result?: YouTubeResolveResult;
}

// Rozwiązywanie linku z dyspozycją per platforma (wykrywa platformę z samego
// linku, a nie z aktywnej zakładki UI).
export async function resolveOnlineUrl(url: string): Promise<OnlineResolveResponse> {
  const detected = detectPlatform(url);
  if (!detected) {
    if (!isHttpUrl(url)) return { success: false, error: 'Unsupported or invalid link' };
    return (await window.api.invoke('yt:resolve', url)) as OnlineResolveResponse;
  }
  if (detected.platform === 'soundcloud') {
    return (await window.api.invoke('sc:resolve', url)) as OnlineResolveResponse;
  }
  return (await window.api.invoke('yt:resolve', url)) as OnlineResolveResponse;
}
