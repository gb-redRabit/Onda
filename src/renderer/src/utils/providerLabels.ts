import type { ProviderId } from '@shared/types/providers';

// Lokalizuje nazwę providera. Gdy brak tłumaczenia, zwraca surową etykietę z main.
export function providerLabel(
  id: ProviderId,
  rawLabel: string,
  t: (key: string) => string
): string {
  // Szablon literałowy (nie zmienna) — dzięki temu audyt i18n widzi prefiks `providers.name.`.
  const translated = t(`providers.name.${id}`);
  return translated === `providers.name.${id}` ? rawLabel : translated;
}
