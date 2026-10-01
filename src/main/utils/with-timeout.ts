export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Odrzuca z TimeoutError, jeśli `promise` nie został rozstrzygnięty w ciągu `ms`.
 * Używane, aby zawieszone wywołanie systemu plików (martwy udział sieciowy,
 * uśpiony dysk zewnętrzny) nie zamroziło widoku Eksploratora na zawsze.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
