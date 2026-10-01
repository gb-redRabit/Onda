/**
 * Safe wrappers around localStorage. Access can throw (private mode, disabled
 * storage, quota) and a stored value can be anything, so both read and write
 * degrade gracefully instead of crashing the view that owns the state.
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
    // Storage unavailable or full — UI state is best-effort.
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
    // Circular or non-serialisable value — nothing to persist.
  }
}

/** Reads a string[] and validates its shape, dropping anything non-string. */
export function readStringArray(key: string): string[] {
  const value = readJson<unknown>(key);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
