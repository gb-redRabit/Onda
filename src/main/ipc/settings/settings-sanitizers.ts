// Pure sanitizer primitives extracted from `settings-schema.ts` (plan 2.8).

export type Sanitizer = (value: unknown) => unknown | undefined;

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function str(v: unknown): unknown | undefined {
  return typeof v === 'string' ? v : undefined;
}
export function num(v: unknown): unknown | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
export function numClamped(min: number, max: number): Sanitizer {
  return (v) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
}
export function bool(v: unknown): unknown | undefined {
  return typeof v === 'boolean' ? v : undefined;
}
export function enumOf(values: readonly string[]): Sanitizer {
  return (v) => (typeof v === 'string' && values.includes(v) ? v : undefined);
}
export function nullable(inner: Sanitizer): Sanitizer {
  return (v) => (v === null ? null : inner(v));
}
export function obj(fields: Record<string, Sanitizer>): Sanitizer {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, fn] of Object.entries(fields)) {
      if (key in v) {
        const cleaned = fn(v[key]);
        if (cleaned !== undefined) out[key] = cleaned;
      }
    }
    return out;
  };
}
export function stringRecord(v: unknown): unknown | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
export function primitiveRecord(v: unknown): unknown | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}
export function recordOf(item: Sanitizer): Sanitizer {
  return (v) => {
    if (!isPlainObject(v)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(v)) {
      const cleaned = item(value);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  };
}
export function arrayOf(item: Sanitizer): Sanitizer {
  return (v) => {
    if (!Array.isArray(v)) return undefined;
    const out: unknown[] = [];
    for (const value of v) {
      const cleaned = item(value);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  };
}
export function stringArray(v: unknown): unknown | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string') out.push(x);
  }
  return out;
}
export function viewModes(v: unknown): unknown | undefined {
  if (!isPlainObject(v)) return undefined;
  const out: Record<string, 'list' | 'grid'> = {};
  for (const [key, value] of Object.entries(v)) {
    if (value === 'list' || value === 'grid') out[key] = value;
  }
  return out;
}

export function hexStr(v: unknown): unknown | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/.test(s) ? s : undefined;
}

export function zeroOne(v: unknown): unknown | undefined {
  return v === 0 || v === 1 ? v : undefined;
}

export function sizeMultiplier(v: unknown): unknown | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = v > 5 ? Math.round(v / 2) : Math.round(v);
  return Math.min(5, Math.max(1, n));
}
