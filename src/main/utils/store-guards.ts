// Strażniki runtime dla wartości czytanych z electron-store. Store to plik JSON,
// który inne oprogramowanie (lub uszkodzony zapis) może zmienić, więc wartość
// musi zostać zwalidowana przed użyciem, a nie rzutowana przez `as` — TypeScript
// nie widzi prawdziwej zawartości pliku.

export function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : undefined;
}
