// Cross-platform dispatch — the ONLY shared online-sources module. Platform
// specifics live in their own files (youtube.ts / soundcloud.ts); this layer
// just routes a pasted link to the right one.

import { detectYtKind, normalizeYtUrl, extractYtVideoId } from './youtube';
import { detectScKind, normalizeScUrl } from './soundcloud';

export type MediaPlatform = 'youtube' | 'soundcloud';
export type PlatformKind = 'video' | 'playlist' | 'channel';

export interface DetectedPlatform {
  platform: MediaPlatform;
  kind: PlatformKind;
}

// Classifies a user-pasted link across every supported platform. Returns null
// for anything unrecognizable.
export function detectPlatform(input: string): DetectedPlatform | null {
  const yt = detectYtKind(input);
  if (yt) return { platform: 'youtube', kind: yt };
  const sc = detectScKind(input);
  if (sc) return { platform: 'soundcloud', kind: sc };
  return null;
}

// Normalizes a link for the platform it was detected as: YT expands bare
// video IDs and handles into full URLs; SC permalinks pass through.
export function normalizePlatformUrl(input: string, detected: DetectedPlatform): string {
  if (detected.platform === 'youtube') return normalizeYtUrl(input, detected.kind);
  return normalizeScUrl(input);
}

export interface BatchEntryPlatform {
  url: string;
  kind: PlatformKind;
  platform: MediaPlatform;
}

// Query-prefix convention: "@name" targets a YouTube channel handle, "$name"
// targets a SoundCloud profile. Both open the channel/profile view directly.
export interface ChannelPrefixQuery {
  platform: MediaPlatform;
  name: string;
}

export function detectChannelPrefix(input: string): ChannelPrefixQuery | null {
  const m = input.trim().match(/^([@$])([A-Za-z0-9_.-]+)$/);
  if (!m) return null;
  return m[1] === '@'
    ? { platform: 'youtube', name: m[2] }
    : { platform: 'soundcloud', name: m[2] };
}

export interface BatchEntryPlatform {
  url: string;
  kind: PlatformKind;
  platform: MediaPlatform;
}

// Splits pasted text (newlines or commas) into links of ANY supported
// platform. Channels are skipped (they open in the profile view, not the
// download flow). Dedupe: by video id for YouTube, by normalized permalink
// for SoundCloud.
export function parseBatchInputAll(text: string): BatchEntryPlatform[] {
  const lines = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: BatchEntryPlatform[] = [];
  for (const line of lines) {
    const detected = detectPlatform(line);
    if (!detected || detected.kind === 'channel') continue;
    const key =
      detected.platform === 'youtube'
        ? extractYtVideoId(line) || line.toLowerCase()
        : line.toLowerCase().replace(/\/+$/, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ url: line, kind: detected.kind, platform: detected.platform });
  }
  return out;
}
