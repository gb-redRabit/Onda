// Wspólny rate-limiter dla zapytań do API providerów — minimalny odstęp między
// żądaniami (per provider), żeby nie robić burstów i nie łapać rate-limitu serwisu.
// Używany przez wszystkich providerów w `fetch`-owych helperach.

const MIN_GAP_MS = 300;
const lastAt = new Map<string, number>();

export async function throttleProvider(providerId: string): Promise<void> {
  const now = Date.now();
  const last = lastAt.get(providerId) ?? 0;
  const wait = MIN_GAP_MS - (now - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt.set(providerId, Date.now());
}

// Testy: reset stanu limitera.
export function __resetProviderRateLimit(): void {
  lastAt.clear();
}
