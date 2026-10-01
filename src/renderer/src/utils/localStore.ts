/**
 * Bezpieczne wrappery wokół localStorage. Dostęp może rzucić wyjątek (tryb prywatny,
 * wyłączony storage, limit) i zapisana wartość może być czymkolwiek, więc zarówno odczyt,
 * jak i zapis degradują się łagodnie, zamiast wywalać widok, który jest właścicielem stanu.
 */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage niedostępny lub pełny — stan UI jest best-effort.
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    // Wartość cykliczna lub nieprzeznaczona do serializacji — nic nie zapisujemy.
  }
}

/** Czyta string[] i waliduje jego kształt, odrzucając wszystko, co nie jest stringiem. */
export function readStringArray(key: string): string[] {
  const value = readJson<unknown>(key);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
