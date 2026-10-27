const NOISE_PATTERN =
  /\s*[\(\[](?:[^)\]]*(?:official|lyrics?|audio|video|visuali[sz]er|hd|hq|4k|remaster(?:ed)?)[^)\]]*)[\)\]]/gi;

/**
 * Czyści typowe dopiski z tytułów YouTube/SoundCloud i — gdy nie znamy artysty —
 * rozdziela „Artist - Title”. Dzięki temu Discord pokazuje krótki tytuł i artystę,
 * zamiast długiego tytułu filmu z „(Official Video)”.
 */
export function splitTitle(
  rawTitle: string,
  knownArtist?: string
): { title: string; artist?: string } {
  const cleaned = rawTitle
    .replace(NOISE_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!knownArtist) {
    const separator = ' - ';
    const index = cleaned.indexOf(separator);
    if (index > 0) {
      const candidateArtist = cleaned.slice(0, index).trim();
      const candidateTitle = cleaned.slice(index + separator.length).trim();
      if (candidateArtist && candidateTitle) {
        return { title: candidateTitle, artist: candidateArtist };
      }
    }
  }
  return { title: cleaned || rawTitle, artist: knownArtist };
}
