import type { HomeSectionId } from '@renderer/types/settings';

// Canonical shelf order on Home. Both the view and the right-click menu use it,
// so toggling a section off and on again restores its original position.
export const HOME_SECTION_ORDER: readonly HomeSectionId[] = [
  'continue',
  'recent',
  'mostPlayed',
  'favorites',
  'playlists',
  'albums',
  'artists'
];

export function isHomeSectionId(value: unknown): value is HomeSectionId {
  return typeof value === 'string' && (HOME_SECTION_ORDER as readonly string[]).includes(value);
}

/** Enabled sections in canonical order (stored order is not trusted). */
export function orderedHomeSections(enabled: readonly HomeSectionId[]): HomeSectionId[] {
  return HOME_SECTION_ORDER.filter((id) => enabled.includes(id));
}

export function toggleHomeSection(
  enabled: readonly HomeSectionId[],
  id: HomeSectionId
): HomeSectionId[] {
  if (enabled.includes(id)) return enabled.filter((section) => section !== id);
  return HOME_SECTION_ORDER.filter((section) => enabled.includes(section) || section === id);
}
