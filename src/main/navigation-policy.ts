export interface NavigationPolicyOptions {
  // Allow data: URLs (used by the PiP preview placeholder windows).
  allowData?: boolean;
}

export function isAllowedNavigationUrl(
  url: string,
  devUrl: string | undefined,
  options: NavigationPolicyOptions = {}
): boolean {
  try {
    const parsed = new URL(url);
    if (options.allowData && parsed.protocol === 'data:') return true;
    if (parsed.protocol === 'file:') return true;
    if (parsed.protocol === 'onda:') return true;
    if (devUrl) {
      const dev = new URL(devUrl);
      if (parsed.origin === dev.origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}