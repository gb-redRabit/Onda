import { useI18n } from 'vue-i18n';
import { pluralCategory } from '@renderer/utils/plural';

// Wspólne etykiety liczby mnogiej. vue-i18n nie mapuje polskiego one/few/many
// na 3-formową wiadomość, więc formę wybiera `pluralCategory` (Intl), a klucz
// powstaje z bazy i kategorii (`...CountOne/Few/Many`).
function keyFor(locale: string, count: number, base: string): string {
  const category = pluralCategory(locale, count);
  const suffix = category === 'one' ? 'One' : category === 'few' ? 'Few' : 'Many';
  return `${base}${suffix}`;
}

export function useCountLabel() {
  const { t, locale } = useI18n();

  /** „1 utwór”, „3 utwory”, „12 utworów”. */
  const trackCount = (count: number): string =>
    t(keyFor(locale.value, count, 'home.trackCount'), { count });

  /** „1 plik”, „3 pliki”, „12 plików”. */
  const fileCount = (count: number): string =>
    t(keyFor(locale.value, count, 'library.fileCount'), { count });

  return { trackCount, fileCount };
}
