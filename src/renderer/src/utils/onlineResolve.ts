import { detectPlatform } from '@shared/platform';
import type { YouTubeResolveResult } from '@renderer/types/online';

export interface OnlineResolveResponse {
  success: boolean;
  error?: string;
  code?: string;
  result?: YouTubeResolveResult;
}

// Platform-dispatched link resolution (detects the platform from the link
// itself, not from the active UI tab).
export async function resolveOnlineUrl(url: string): Promise<OnlineResolveResponse> {
  const detected = detectPlatform(url);
  if (!detected) return { success: false, error: 'Unsupported or invalid link' };
  if (detected.platform === 'soundcloud') {
    return (await window.api.invoke('sc:resolve', url)) as OnlineResolveResponse;
  }
  return (await window.api.invoke('yt:resolve', url)) as OnlineResolveResponse;
}
