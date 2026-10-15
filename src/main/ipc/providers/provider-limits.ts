// Uniwersalne wykrywanie komunikatów LIMITÓW serwisów (transfer/kwota/rate-limit).
// Serwisy różnie to nazywają (MEGA „Bandwidth limit reached: N seconds…", 429,
// „transfer quota", „too many requests"…), więc rozpoznajemy je po wzorcach i —
// gdy to możliwe — wyciągamy czas do resetu. Używane przez klasyfikację błędów
// pobierania i proxy strumienia, żeby użytkownik dostał czytelną informację.

export interface ProviderLimitInfo {
  limited: boolean;
  retryAfterSeconds?: number;
  source?: string;
}

function secondsFrom(message: string): number | undefined {
  const s = /(\d+)\s*(?:seconds?|secs?)\b/i.exec(message);
  if (s) return Number(s[1]);
  const min = /(\d+)\s*(?:minutes?|mins?)\b/i.exec(message);
  if (min) return Number(min[1]) * 60;
  const hrs = /(\d+)\s*(?:hours?|hrs?)\b/i.exec(message);
  if (hrs) return Number(hrs[1]) * 3600;
  return undefined;
}

export function detectProviderLimit(message: string): ProviderLimitInfo {
  const m = message || '';

  // MEGA i podobne: „Bandwidth limit reached: 2307 seconds until it resets".
  const reset = /bandwidth limit reached:\s*(\d+)\s*seconds/i.exec(m);
  if (reset) return { limited: true, retryAfterSeconds: Number(reset[1]), source: 'MEGA' };

  const generic =
    /(bandwidth limit|transfer quota|quota[ _-]?(?:exceeded|reached)|out of quota|exceeded (?:your|the) (?:quota|traffic)|rate[ _-]?limit|too many requests|http(?: error)? 429|slow down|try again (?:in|later)|until it resets|account (?:is )?limited|限流|流量|次数)/i;
  if (generic.test(m)) {
    return { limited: true, retryAfterSeconds: secondsFrom(m), source: 'quota' };
  }
  return { limited: false };
}

// Krótki opis dla UI/logów (renderer i tak tłumaczy kod na swój język).
export function formatProviderLimit(info: ProviderLimitInfo): string {
  if (!info.limited) return '';
  const src = info.source ? ` (${info.source})` : '';
  if (info.retryAfterSeconds && info.retryAfterSeconds > 0) {
    const min = Math.max(1, Math.round(info.retryAfterSeconds / 60));
    return `Service limit${src} — try again in ~${min} min`;
  }
  return `Service limit${src} — try again later`;
}
