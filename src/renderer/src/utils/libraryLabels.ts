// Stabilne klucze grup „bez metadanych”. Tłumaczenie zostaje w UI, żeby zmiana
// języka działała bez przeliczania biblioteki, a grupowanie nie zależało od
// języka interfejsu. Prefiks `\uffff` sortuje takie grupy na końcu listy.
export const UNKNOWN_ARTIST = '\uffffunknown-artist';
export const UNKNOWN_ALBUM = '\uffffunknown-album';

export function isUnknownGroup(name: string): boolean {
  return name === UNKNOWN_ARTIST || name === UNKNOWN_ALBUM;
}

/**
 * Etykieta grupy do wyświetlenia. Albumy mogą mieć etykietę złożoną
 * („Album — Wykonawca”), więc tłumaczymy każdą część osobno.
 */
export function groupLabel(name: string, t: (key: string) => string): string {
  if (!name.includes(' — ')) return isUnknownGroup(name) ? t('common.unknown') : name;
  return name
    .split(' — ')
    .map((part) => (isUnknownGroup(part) ? t('common.unknown') : part))
    .join(' — ');
}
