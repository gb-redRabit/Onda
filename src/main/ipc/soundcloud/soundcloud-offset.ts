// Clamps a SoundCloud search offset to the API-supported range (0-900).
export function normalizeScOffset(offset: unknown): number {
  return Math.max(0, Math.min(900, Math.floor(Number(offset) || 0)));
}
