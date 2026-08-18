type SponsorBlockMode = 'off' | 'mark' | 'remove';

// yt-dlp SponsorBlock flags. "mark" keeps the media intact and records sponsor
// segments as chapters; "remove" cuts the segments out of the downloaded file.
export function buildSponsorBlockArgs(mode?: SponsorBlockMode): string[] {
  if (mode === 'mark') return ['--sponsorblock-mark', 'sponsor'];
  if (mode === 'remove') return ['--sponsorblock-remove', 'sponsor'];
  return [];
}
