import { logger } from '../../shared/logger';

// Zdalne bazy napisów odpowiadają 4xx/5xx oraz limitami (429) w normalnym użytkowaniu —
// „brak napisów" i „limit" to NIE awarie. Logujemy je jednym spokojnym zdaniem (bez stosu
// i bez ostrzeżenia), a `warn` zostawiamy na sytuacje, których naprawdę nie przewidujemy.

export type RequestErrorKind = 'http' | 'network' | 'unexpected';

export interface RequestOutcome {
  kind: RequestErrorKind;
  message: string;
}

export function classifyRequestError(e: unknown): RequestOutcome {
  const message = (e as Error)?.message ?? String(e);
  if (/^HTTP \d{3}$/.test(message)) return { kind: 'http', message };
  if (/timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|aborted/i.test(message)) {
    return { kind: 'network', message };
  }
  return { kind: 'unexpected', message };
}

/** Loguje wynik żądania i zwraca komunikat do przekazania do UI. */
export function logRequestOutcome(tag: string, action: string, e: unknown): string {
  const { kind, message } = classifyRequestError(e);
  if (kind === 'unexpected') logger.warn(tag, `${action} failed`, message);
  else logger.info(tag, `${action}: ${message}`);
  return message;
}

/** Limit zapytań (429/503) — do czytelnego komunikatu w UI. */
export function isRateLimited(e: unknown): boolean {
  const { message } = classifyRequestError(e);
  return /HTTP (429|503)/.test(message);
}
