/**
 * Ludzki opis odległości w czasie („5 minut temu”, „wczoraj”, „3 dni temu”).
 * Powyżej tygodnia wraca do daty, bo „2 miesiące temu” nic już nie wnosi.
 * `locale` przekazujemy z i18n, żeby odmiana zgadzała się z językiem aplikacji,
 * a nie systemu.
 */
export function relativeTime(ts: number, locale?: string, now = Date.now()): string {
  const diffSeconds = Math.round((ts - now) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });

  if (abs < 60) return rtf.format(diffSeconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 7 * 86_400) return rtf.format(Math.round(diffSeconds / 86_400), 'day');
  return new Date(ts).toLocaleDateString(locale);
}
