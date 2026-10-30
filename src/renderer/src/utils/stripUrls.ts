/**
 * Usuwa adresy URL z opisów wideo. Opisy z YouTube/SoundCloud często zaczynają
 * się od linków społecznościowych, a w kafelku wyników zajmują całe dwie linie.
 */
export function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}
