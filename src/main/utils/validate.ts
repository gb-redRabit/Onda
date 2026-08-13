import { isAbsolute } from 'path';

const MAX_PATH_LENGTH = 4096;

// IPC arguments come from the renderer and are never trusted. These guards
// validate the shape of filesystem arguments before any fs operation runs.

export function isSafeAbsolutePath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!value || value.length > MAX_PATH_LENGTH) return false;
  if (value.includes('\0')) return false;
  return isAbsolute(value);
}

export function isSafeStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length <= MAX_PATH_LENGTH)
  );
}
