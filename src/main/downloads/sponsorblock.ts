type SponsorBlockMode = 'off' | 'mark' | 'remove';

// Flagi SponsorBlock yt-dlp. "mark" zachowuje media w całości i zapisuje segmenty
// sponsora jako rozdziały; "remove" wycina segmenty z pobranego pliku.
export function buildSponsorBlockArgs(mode?: SponsorBlockMode): string[] {
  if (mode === 'mark') return ['--sponsorblock-mark', 'sponsor'];
  if (mode === 'remove') return ['--sponsorblock-remove', 'sponsor'];
  return [];
}
