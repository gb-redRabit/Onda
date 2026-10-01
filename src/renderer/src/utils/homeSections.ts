import type { HomeSectionId } from '@renderer/types/settings';

// Kanoniczna kolejność półek na Stronie głównej. Używają jej zarówno widok, jak i menu
// kontekstowe, więc wyłączenie i ponowne włączenie sekcji przywraca jej pierwotną pozycję.
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

/** Włączone sekcje w kanonicznej kolejności (zapisana kolejność nie jest zaufana). */
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
