import { extractSignedUrlExpiryMs } from './soundcloud-client';

// SoundCloud stream-cache helpers extracted from `soundcloud-handlers.ts`
// (plan 2.8). The cache map + pending map stay in the handler; only the pure
// lifetime math and its bounds live here.

export interface ScStreamCacheEntry {
  url: string;
  expires: number;
}

// Fallback for URLs without a parseable signature; signed SC CDN URLs
// (~30 min lifetime) always use their own embedded expiry minus a safety
// margin — see streamCacheExpiry below.
const STREAM_CACHE_FALLBACK_TTL_MS = 10 * 60 * 1000;
// Serve the URL at most until this long BEFORE its real expiry.
const STREAM_EXPIRY_SAFETY_MS = 60 * 1000;
export const STREAM_CACHE_MAX = 50;

// Cache lifetime for a resolved CDN URL: the signature's own expiry (parsed
// from the Policy blob) minus a safety margin, capped by the fallback TTL.
export function streamCacheExpiry(cdnUrl: string): number {
  const now = Date.now();
  const epoch = extractSignedUrlExpiryMs(cdnUrl);
  if (epoch == null) return now + STREAM_CACHE_FALLBACK_TTL_MS;
  return Math.min(
    now + STREAM_CACHE_FALLBACK_TTL_MS,
    Math.max(now + 5000, epoch - STREAM_EXPIRY_SAFETY_MS)
  );
}
